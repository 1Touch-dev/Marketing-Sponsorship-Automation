import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import {
  passwordLinkAuditMeta,
  supabaseAnonNoSession,
  type PasswordLinkKind,
} from "@/lib/auth/password-links";
import { checkRateLimit, getClientIp, rateLimitHeaders } from "@/lib/rate-limit";
import { recordAudit } from "@/lib/audit/log";
import { externalActor } from "@/lib/identity/actor";

export const runtime = "nodejs";

const MIN_PASSWORD_LEN = 8;
const KINDS = new Set<PasswordLinkKind>(["invite", "recovery"]);

/**
 * POST /api/auth/set-password
 * Body: { token_hash, type: "invite" | "recovery", password }
 *
 * verifyOtp on a no-cookie anon client, then admin.updateUserById — avoids
 * HttpOnly session cookie conflicts that break browser-side updateUser.
 */
export async function POST(req: Request) {
  const ip = getClientIp(req);
  const body = (await req.json().catch(() => ({}))) as {
    token_hash?: string;
    type?: string;
    password?: string;
  };

  const tokenHash = typeof body.token_hash === "string" ? body.token_hash.trim() : "";
  const type = typeof body.type === "string" ? body.type.trim() : "";
  const password = typeof body.password === "string" ? body.password : "";

  const tokenKey = tokenHash ? tokenHash.slice(0, 16) : "empty";
  const byIp = checkRateLimit(`set-pw:ip:${ip}`, { max: 5, windowMs: 15 * 60 * 1000 });
  const byToken = checkRateLimit(`set-pw:token:${tokenKey}`, { max: 5, windowMs: 15 * 60 * 1000 });
  if (!byIp.ok || !byToken.ok) {
    const blocked = !byIp.ok ? byIp : byToken;
    return NextResponse.json(
      { error: "Too many attempts. Try again later." },
      { status: 429, headers: rateLimitHeaders(blocked) },
    );
  }

  if (!tokenHash || !KINDS.has(type as PasswordLinkKind)) {
    return NextResponse.json(
      { error: "This link is invalid or incomplete. Request a new one from the login page." },
      { status: 400 },
    );
  }
  if (password.length < MIN_PASSWORD_LEN) {
    return NextResponse.json(
      { error: `Password must be at least ${MIN_PASSWORD_LEN} characters` },
      { status: 400 },
    );
  }

  const kind = type as PasswordLinkKind;
  const anon = supabaseAnonNoSession();
  const { data: verified, error: verifyError } = await anon.auth.verifyOtp({
    type: kind,
    token_hash: tokenHash,
  });

  if (verifyError || !verified?.user?.id) {
    return NextResponse.json(
      { error: "This link is invalid or has expired. Request a new one from the login page." },
      { status: 400 },
    );
  }

  const userId = verified.user.id;
  const email = (verified.user.email ?? "").toLowerCase();

  const { error: updateError } = await supabaseAdmin().auth.admin.updateUserById(userId, {
    password,
  });
  if (updateError) {
    return NextResponse.json({ error: "Could not set your password. Try again or request a new link." }, { status: 500 });
  }

  // Best-effort audit — never store token_hash or password.
  if (email) {
    const { data: platformUser } = await supabaseAdmin()
      .from("platform_users" as "companies")
      .select("id, tenant_id")
      .eq("email" as "id", email)
      .maybeSingle();

    await recordAudit({
      actor: externalActor(`staff set-password: ${email}`, `auth-set-pw:${email}`),
      entity_type: "platform_user",
      entity_id: (platformUser as { id?: string } | null)?.id ?? null,
      action: "auth.password_set",
      tenant_id: (platformUser as { tenant_id?: string } | null)?.tenant_id ?? undefined,
      metadata: passwordLinkAuditMeta(email, kind),
    }).catch(() => {});
  }

  return NextResponse.json({ ok: true });
}
