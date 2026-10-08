import { NextResponse } from "next/server";
import { z } from "zod";
import { supabaseAdmin } from "@/lib/supabase/server";
import { resolveTenantId } from "@/lib/tenants/current";
import { requirePermission } from "@/lib/auth/server-permission";
import { recordAudit } from "@/lib/audit/log";
import { listCurrentSuppressions, recordSuppression } from "@/lib/contacts/store";
import { SUPPRESSION_REASONS } from "@/lib/contacts/model";
import { userActor } from "@/lib/identity/actor";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Everyone and every company currently on the do-not-contact list. */
export async function GET() {
  const tenantId = await resolveTenantId();
  const res = await listCurrentSuppressions(supabaseAdmin(), tenantId);
  if (!res.ok) return NextResponse.json({ error: res.error }, { status: res.status });
  return NextResponse.json({ total: res.value.length, data: res.value });
}

const schema = z.object({
  email: z.string().max(200).nullish(),
  company_id: z.string().uuid().nullish(),
  decision: z.enum(["suppressed", "lifted"]),
  reason_code: z.enum(SUPPRESSION_REASONS),
  note: z.string().max(1000).nullish(),
});

/**
 * Put an email address or a whole company on the do-not-contact list, or take it off.
 * Anyone who sells or approves can add; only an admin can lift, and must say why.
 */
export async function POST(req: Request) {
  const parsed = schema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "Invalid payload", issues: parsed.error.issues }, { status: 400 });
  const d = parsed.data;

  const auth = await requirePermission(d.decision === "lifted" ? "lift_suppression" : "suppress_contact");
  if ("error" in auth) return auth.error;

  const res = await recordSuppression(supabaseAdmin(), auth.user.tenant_id, {
    email: d.email, companyId: d.company_id, decision: d.decision, reasonCode: d.reason_code, note: d.note,
    actor: { kind: "human", email: auth.user.email }, source: "manual",
  });
  if (!res.ok) return NextResponse.json({ error: res.error }, { status: res.status });

  if (!res.value.already) {
    await recordAudit({ actor: userActor(auth.user), entity_type: d.company_id ? "company" : "contact", entity_id: d.company_id ?? null, action: d.decision === "suppressed" ? "contact.suppressed" : "contact.suppression_lifted", actor_email: auth.user.email, tenant_id: auth.user.tenant_id, metadata: { email: d.email ?? null, reason_code: d.reason_code, actor_user_id: auth.user.id } });
  }
  return NextResponse.json({ suppression_id: res.value.id, already_suppressed: res.value.already }, { status: res.value.already ? 200 : 201 });
}
