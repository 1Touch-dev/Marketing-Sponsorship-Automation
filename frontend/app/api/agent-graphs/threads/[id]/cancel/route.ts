import { NextResponse } from "next/server";
import { z } from "zod";
import { supabaseAdmin } from "@/lib/supabase/server";
import { requirePermission } from "@/lib/auth/server-permission";
import { recordAudit } from "@/lib/audit/log";
import { userActor } from "@/lib/identity/actor";
import { cancelRun, getThread } from "@/lib/agents/langgraph/runtime";
import { cancel as cancelAction } from "@/lib/actions/engine";
import { supabaseRpc } from "@/lib/actions/broker";

export const runtime = "nodejs";

const schema = z.object({ reason: z.string().min(5).max(500) });

/**
 * POST /api/agent-graphs/threads/<id>/cancel   { reason }
 * Stops a run for good. What it already did stays on record. If the run is waiting on a send plan that has not run yet,
 * the plan is withdrawn too, so a cancelled run cannot still be approved into a send. A send that is already executing or
 * accepted is not recalled; the answer says so (`send_plan`).
 */
export async function POST(req: Request, ctx: { params: { id: string } }) {
  const auth = await requirePermission("manage_agents");
  if ("error" in auth) return auth.error;
  const parsed = schema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "Say why the run is being cancelled (5+ characters).", issues: parsed.error.issues }, { status: 400 });
  const sb = supabaseAdmin();
  const id = decodeURIComponent(ctx.params.id);
  const before = await getThread(sb, auth.user.tenant_id, id);
  const res = await cancelRun(sb, { tenantId: auth.user.tenant_id, threadId: id, by: auth.user.email, reason: parsed.data.reason });
  if (!res.ok) return NextResponse.json({ error: res.error }, { status: res.status });
  let sendPlan: "withdrawn" | "not_withdrawn" | "none" = "none";
  const actionId = before.ok ? (before.value.waiting_for as { action_id?: string | null } | null)?.action_id : null;
  if (actionId) {
    const w = await cancelAction(supabaseRpc(sb), actionId, { kind: "human", id: auth.user.id, email: auth.user.email }, `The run that made this plan was cancelled: ${parsed.data.reason}`);
    sendPlan = w.ok ? "withdrawn" : "not_withdrawn";
  }
  // an outreach run is also marked cancelled where people see it
  const t = await getThread(sb, auth.user.tenant_id, id);
  if (t.ok && t.value.subject_type === "agent_run" && t.value.subject_id) {
    await sb.from("agent_runs").update({ status: "cancelled", updated_at: new Date().toISOString() }).eq("id", t.value.subject_id).eq("tenant_id", auth.user.tenant_id).in("status", ["running", "paused_for_proposal_approval", "paused_for_approval", "resuming"]);
  }
  await recordAudit({ actor: userActor(auth.user), entity_type: "agent_run", action: "agent.run.cancelled", metadata: { thread_id: id, reason: parsed.data.reason, send_plan: sendPlan, action_id: actionId ?? null } });
  return NextResponse.json({ status: res.value.status, send_plan: sendPlan });
}
