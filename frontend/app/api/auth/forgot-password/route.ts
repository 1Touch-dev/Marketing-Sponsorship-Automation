import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import {
  FORGOT_PASSWORD_GENERIC_MESSAGE,
  findAuthUserByEmail,
  issuePasswordLinkEmail,
  passwordLinkAuditMeta,
} from "@/lib/auth/password-links";
import { checkRateLimit, getClientIp, rateLimitHeaders } from "@/lib/rate-limit";
import { recordAudit } from "@/lib/audit/log";
import { externalActor } from "@/lib/identity/actor";
import { resolveAppUrl } from "@/lib/url";

export const runtime = "nodejs";

const GENERIC = NextResponse.json({
  ok: true,
  message: FORGOT_PASSWORD_GENERIC_MESSAGE,
});

/**
 * POST /api/auth/forgot-password
 * Body: { email }
 *
 * Always returns the same generic success message. Rate-limited per IP and email.
 * SES send runs in the background so response timing does not reveal account existence.
 */
export async function POST(req: Request) {
  const ip = getClientIp(req);
  const body = await req.json().catch(() => ({})) as { email?: string };
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";

  const byIp = checkRateLimit(`forgot-pw:ip:${ip}`, { max: 5, windowMs: 15 * 60 * 1000 });
  const byEmail = checkRateLimit(`forgot-pw:email:${email || "empty"}`, {
    max: 5,
    windowMs: 15 * 60 * 1000,
  });
  if (!byIp.ok || !byEmail.ok) {
    const blocked = !byIp.ok ? byIp : byEmail;
    // Still generic message — do not reveal rate-limit reason that could help enumeration.
    return NextResponse.json(
      { ok: true, message: FORGOT_PASSWORD_GENERIC_MESSAGE },
      { status: 200, headers: rateLimitHeaders(blocked) },
    );
  }

  if (email) {
    const appUrl = resolveAppUrl(req);
    void sendRecoveryInBackground(email, appUrl).catch(() => {});
  }

  return GENERIC;
}

async function sendRecoveryInBackground(email: string, appUrl: string): Promise<void> {
  const sb = supabaseAdmin();
  const { data: platformUser } = await sb
    .from("platform_users" as "companies")
    .select("id, email, tenant_id, is_active")
    .eq("email" as "id", email)
    .eq("is_active" as "id", true as unknown as string)
    .maybeSingle();

  if (!platformUser) return;

  const authUser = await findAuthUserByEmail(email);
  if (!authUser) return;

  const tenantId = (platformUser as { tenant_id: string }).tenant_id;

  await recordAudit({
    actor: externalActor(`staff reset: ${email}`, `auth-reset:${email}`),
    entity_type: "platform_user",
    entity_id: (platformUser as { id: string }).id,
    action: "auth.password_reset_requested",
    tenant_id: tenantId,
    metadata: passwordLinkAuditMeta(email, "recovery"),
  });

  await issuePasswordLinkEmail({
    tenantId,
    email,
    kind: "recovery",
    appUrl,
  });
}
