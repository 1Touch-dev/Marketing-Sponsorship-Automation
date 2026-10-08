import { NextResponse } from "next/server";
import { z } from "zod";
import { supabaseAdmin } from "@/lib/supabase/server";
import { requirePermission } from "@/lib/auth/server-permission";
import { recordAudit } from "@/lib/audit/log";
import { assignRole, endRole } from "@/lib/contacts/store";
import { CONTACT_ROLES } from "@/lib/contacts/model";
import { userActor } from "@/lib/identity/actor";

export const runtime = "nodejs";

const schema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("assign"), role: z.enum(CONTACT_ROLES), started_on: z.string().max(10).nullish(), note: z.string().max(500).nullish() }),
  z.object({ action: z.literal("end"), role_id: z.string().uuid(), reason: z.string().min(3).max(500), ended_on: z.string().max(10).nullish() }),
]);

/** Give a contact a role (decision-maker, billing, signatory...) or end one. Roles are never overwritten: history stays. */
export async function POST(req: Request, ctx: { params: { id: string } }) {
  const auth = await requirePermission("manage_contacts");
  if ("error" in auth) return auth.error;
  const parsed = schema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "Invalid payload", issues: parsed.error.issues }, { status: 400 });

  const sb = supabaseAdmin();
  const d = parsed.data;
  const res = d.action === "assign"
    ? await assignRole(sb, auth.user.tenant_id, ctx.params.id, { role: d.role, startedOn: d.started_on, note: d.note, by: auth.user.email })
    : await endRole(sb, auth.user.tenant_id, ctx.params.id, d.role_id, { endedOn: d.ended_on, reason: d.reason, by: auth.user.email });
  if (!res.ok) return NextResponse.json({ error: res.error }, { status: res.status });

  await recordAudit({ actor: userActor(auth.user), entity_type: "contact", entity_id: ctx.params.id, action: d.action === "assign" ? "contact.role_assigned" : "contact.role_ended", actor_email: auth.user.email, tenant_id: auth.user.tenant_id, metadata: { ...(d.action === "assign" ? { role: d.role } : { role_id: d.role_id }), actor_user_id: auth.user.id } });
  return NextResponse.json({ role_id: res.value.id }, { status: 201 });
}
