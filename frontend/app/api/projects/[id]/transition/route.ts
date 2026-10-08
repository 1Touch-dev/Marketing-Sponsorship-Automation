import { NextResponse } from "next/server";
import { z } from "zod";
import { supabaseAdmin } from "@/lib/supabase/server";
import { requirePermission } from "@/lib/auth/server-permission";
import { recordAudit } from "@/lib/audit/log";
import { transition } from "@/lib/projects/store";
import { refreshForProject } from "@/lib/company-status/store";
import { userActor } from "@/lib/identity/actor";

export const runtime = "nodejs";

const schema = z.object({
  action: z.enum(["start", "pause", "resume", "complete", "cancel"]),
  reason: z.string().max(1000).nullish(),
  outcome_note: z.string().max(2000).nullish(),
  early_reason: z.string().max(1000).nullish(),
});

/**
 * Move a project along: start, pause, resume, complete or cancel. Completing is refused while the
 * records it points at say it is not finished (an open deal, open delivery tasks, a running period).
 */
export async function POST(req: Request, ctx: { params: { id: string } }) {
  const auth = await requirePermission("manage_projects");
  if ("error" in auth) return auth.error;
  const parsed = schema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "Invalid payload", issues: parsed.error.issues }, { status: 400 });

  const d = parsed.data;
  const res = await transition(supabaseAdmin(), auth.user.tenant_id, ctx.params.id, { action: d.action, reason: d.reason, outcomeNote: d.outcome_note, earlyReason: d.early_reason, actorEmail: auth.user.email });
  if (!res.ok) return NextResponse.json({ error: res.error }, { status: res.status });
  await recordAudit({ actor: userActor(auth.user), entity_type: "project", entity_id: ctx.params.id, action: `project.${d.action}`, actor_email: auth.user.email, tenant_id: auth.user.tenant_id, metadata: { reason: d.reason ?? d.early_reason ?? null, actor_user_id: auth.user.id } });
  await refreshForProject(supabaseAdmin(), auth.user.tenant_id, ctx.params.id, `project.${d.action}`);
  return NextResponse.json({ status: res.value.status });
}
