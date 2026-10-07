import { NextResponse } from "next/server";
import { z } from "zod";
import { supabaseAdmin } from "@/lib/supabase/server";
import { requirePermission } from "@/lib/auth/server-permission";
import { recordAudit } from "@/lib/audit/log";
import { moveProjectDate } from "@/lib/schedule/store";
import { refreshForProject } from "@/lib/company-status/store";

export const runtime = "nodejs";

const schema = z.object({
  field: z.enum(["period_start", "period_end", "target_date"]),
  new_date: z.string().max(10),
  reason: z.string().max(1000),
  acknowledge: z.boolean().optional(),
});

/** Move a project's period (delivery) or target date (commercial), with a reason. Refused while it leaves unfinished work outside the period unless acknowledged. */
export async function POST(req: Request, ctx: { params: { id: string } }) {
  const auth = await requirePermission("manage_projects");
  if ("error" in auth) return auth.error;
  const parsed = schema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "Invalid payload", issues: parsed.error.issues }, { status: 400 });

  const d = parsed.data;
  const res = await moveProjectDate(supabaseAdmin(), auth.user.tenant_id, ctx.params.id, { field: d.field, newValue: d.new_date, reason: d.reason, acknowledge: d.acknowledge }, auth.user.email);
  if (!res.ok) return NextResponse.json({ error: res.error, impact: res.impact ?? null, conflicts: res.conflicts ?? [] }, { status: res.status });
  await recordAudit({ entity_type: "project", entity_id: ctx.params.id, action: "project.date_moved", actor_email: auth.user.email, tenant_id: auth.user.tenant_id, metadata: { field: d.field, to: d.new_date, reason: d.reason, owners: res.value.impact.owners, actor_user_id: auth.user.id } });
  await refreshForProject(supabaseAdmin(), auth.user.tenant_id, ctx.params.id, "project.date_moved");
  return NextResponse.json({ change_id: res.value.change_id, impact: res.value.impact });
}
