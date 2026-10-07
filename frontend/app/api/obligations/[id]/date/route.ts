import { NextResponse } from "next/server";
import { z } from "zod";
import { supabaseAdmin } from "@/lib/supabase/server";
import { requirePermission } from "@/lib/auth/server-permission";
import { recordAudit } from "@/lib/audit/log";
import { moveObligation } from "@/lib/schedule/store";
import { refreshForObligation } from "@/lib/company-status/store";

export const runtime = "nodejs";

const schema = z.object({
  new_due_date: z.string().max(10),
  reason: z.string().max(1000),
  cascade: z.boolean().optional(),
  acknowledge: z.boolean().optional(),
});

/**
 * Move an obligation's due date, with a reason. The move is recorded with the downstream work and owners
 * it affected. It is refused while it leaves work due before what it waits on, or outside the contract or
 * delivery period, unless `acknowledge` is true. `cascade` moves later work that would fall due before it.
 */
export async function POST(req: Request, ctx: { params: { id: string } }) {
  const auth = await requirePermission("manage_obligations");
  if ("error" in auth) return auth.error;
  const parsed = schema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "Invalid payload", issues: parsed.error.issues }, { status: 400 });

  const d = parsed.data;
  const res = await moveObligation(supabaseAdmin(), auth.user.tenant_id, ctx.params.id, { newDue: d.new_due_date, reason: d.reason, cascade: d.cascade, acknowledge: d.acknowledge }, auth.user.email);
  if (!res.ok) return NextResponse.json({ error: res.error, impact: res.impact ?? null, conflicts: res.conflicts ?? [] }, { status: res.status });
  await recordAudit({
    entity_type: "obligation", entity_id: ctx.params.id, action: "obligation.date_moved", actor_email: auth.user.email, tenant_id: auth.user.tenant_id,
    metadata: { to: d.new_due_date, reason: d.reason, cascaded: res.value.cascaded, owners: res.value.impact.owners, actor_user_id: auth.user.id },
  });
  await refreshForObligation(supabaseAdmin(), auth.user.tenant_id, ctx.params.id, "obligation.date_moved");
  return NextResponse.json({ change_id: res.value.change_id, cascaded: res.value.cascaded, impact: res.value.impact });
}
