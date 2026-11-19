import { NextResponse } from "next/server";
import { getCurrentPlatformUser } from "@/lib/auth/server-permission";
import { supabaseServer } from "@/lib/supabase/server";
import { supabaseAnonNoSession } from "@/lib/auth/password-links";
import { checkRateLimit, getClientIp, rateLimitHeaders } from "@/lib/rate-limit";
import { recordAudit } from "@/lib/audit/log";
import { userActor } from "@/lib/identity/actor";

export const runtime = "nodejs";

const MIN_PASSWORD_LEN = 8;

/**
 * POST /api/auth/change-password
 * Body: { current_password, new_password }
 *
 * Verifies current password on a separate anon client (no cookies), updates via
 * the session client, then signs out other sessions.
 */
export async function POST(req: Request) {
  const me = await getCurrentPlatformUser();
  if (!me) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const ip = getClientIp(req);
  const byUser = checkRateLimit(`change-pw:user:${me.id}`, { max: 5, windowMs: 15 * 60 * 1000 });
  const byIp = checkRateLimit(`change-pw:ip:${ip}`, { max: 10, windowMs: 15 * 60 * 1000 });
  if (!byUser.ok || !byIp.ok) {
    const blocked = !byUser.ok ? byUser : byIp;
    return NextResponse.json(
      { error: blocked.message },
      { status: 429, headers: rateLimitHeaders(blocked) },
    );
  }

  const body = await req.json().catch(() => ({})) as {
    current_password?: string;
    new_password?: string;
  };
  const current = typeof body.current_password === "string" ? body.current_password : "";
  const next = typeof body.new_password === "string" ? body.new_password : "";

  if (!current || !next) {
    return NextResponse.json({ error: "Current and new password are required" }, { status: 400 });
  }
  if (next.length < MIN_PASSWORD_LEN) {
    return NextResponse.json(
      { error: `New password must be at least ${MIN_PASSWORD_LEN} characters` },
      { status: 400 },
    );
  }
  if (current === next) {
    return NextResponse.json(
      { error: "New password must be different from the current password" },
      { status: 400 },
    );
  }

  const anon = supabaseAnonNoSession();
  const { error: verifyError } = await anon.auth.signInWithPassword({
    email: me.email,
    password: current,
  });
  if (verifyError) {
    return NextResponse.json({ error: "Current password is incorrect" }, { status: 401 });
  }
  // Do not signOut on the anon client: default scope is "global" and would
  // invalidate the cookie session needed for updateUser below. Anon client
  // has persistSession: false, so the verify session dies with this request.

  const sessionClient = supabaseServer();
  const { error: updateError } = await sessionClient.auth.updateUser({ password: next });
  if (updateError) {
    return NextResponse.json({ error: "Could not update password" }, { status: 500 });
  }

  await sessionClient.auth.signOut({ scope: "others" }).catch(() => {});

  await recordAudit({
    actor: userActor(me),
    entity_type: "platform_user",
    entity_id: me.id,
    action: "auth.password_changed",
    tenant_id: me.tenant_id,
    metadata: {},
  });

  return NextResponse.json({ ok: true, message: "Password updated" });
}
