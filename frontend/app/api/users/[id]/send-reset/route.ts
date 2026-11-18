import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { requirePermission } from "@/lib/auth/server-permission";
import {
  findAuthUserByEmail,
  issuePasswordLinkEmail,
  passwordLinkAuditMeta,
} from "@/lib/auth/password-links";
import { recordAudit } from "@/lib/audit/log";
import { userActor } from "@/lib/identity/actor";
import { resolveAppUrl } from "@/lib/url";

export const runtime = "nodejs";

/**
 * POST /api/users/[id]/send-reset
 * Admin-triggered recovery link for a Login account that already has Auth.
 */
export async function POST(req: Request, ctx: { params: { id: string } }) {
  const auth = await requirePermission("manage_users");
  if ("error" in auth) return auth.error;

  const sb = supabaseAdmin();
  const { data: row, error } = await sb
    .from("platform_users" as "companies")
    .select("id, email, tenant_id, is_active")
    .eq("id" as "id", ctx.params.id)
    .eq("tenant_id" as "id", auth.user.tenant_id)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!row) return NextResponse.json({ error: "User not found" }, { status: 404 });

  const email = String((row as { email: string }).email).toLowerCase();
  const existing = await findAuthUserByEmail(email);
  if (!existing) {
    return NextResponse.json(
      {
        error:
          "This user has no login yet. Use Resend invite instead.",
      },
      { status: 409 },
    );
  }

  try {
    await issuePasswordLinkEmail({
      tenantId: auth.user.tenant_id,
      email,
      kind: "recovery",
      appUrl: resolveAppUrl(req),
    });
  } catch (err) {
    return NextResponse.json(
      {
        error:
          err instanceof Error
            ? err.message.slice(0, 200)
            : "Could not send reset email",
      },
      { status: 502 },
    );
  }

  await recordAudit({
    actor: userActor(auth.user),
    entity_type: "platform_user",
    entity_id: (row as { id: string }).id,
    action: "auth.password_reset_sent",
    tenant_id: auth.user.tenant_id,
    metadata: passwordLinkAuditMeta(email, "recovery"),
  });

  return NextResponse.json({ ok: true, email_sent: true });
}
