import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { requirePermission } from "@/lib/auth/server-permission";
import { recordAudit } from "@/lib/audit/log";
import { userActor } from "@/lib/identity/actor";
import { getThread, resumeRun } from "@/lib/agents/langgraph/runtime";
import { graphFor } from "@/lib/agents/langgraph/registry";
import { idempotent } from "@/lib/idempotency";

export const runtime = "nodejs";
export const maxDuration = 300;

/**
 * POST /api/agent-graphs/threads/<id>/resume
 * Carries a FAILED run on from its last saved step; steps that finished are not repeated. A run that is waiting for a
 * person is answered where the person decides (approve the proposal, approve the send), never from here, so this cannot
 * be used to approve something on someone's behalf.
 */
async function postHandler(_req: Request, ctx: { params: { id: string } }) {
  const auth = await requirePermission("manage_agents");
  if ("error" in auth) return auth.error;
  const sb = supabaseAdmin();
  const id = decodeURIComponent(ctx.params.id);
  const got = await getThread(sb, auth.user.tenant_id, id);
  if (!got.ok) return NextResponse.json({ error: got.error }, { status: got.status });
  if (got.value.status !== "failed") {
    return NextResponse.json({ error: got.value.status === "interrupted" ? "This run is waiting for a person to decide; it is answered where they decide, not from here." : `Only a failed run can be carried on (this one is ${got.value.status}).` }, { status: 409 });
  }
  const graph = graphFor(sb, auth.user.tenant_id, got.value.graph);
  if (!graph) return NextResponse.json({ error: `Unknown agent "${got.value.graph}".` }, { status: 400 });
  const out = await resumeRun(sb, graph, { tenantId: auth.user.tenant_id, threadId: id });
  if (!out.ok) return NextResponse.json({ error: out.error }, { status: out.status });
  await recordAudit({ actor: userActor(auth.user), entity_type: "agent_run", action: "agent.run.resumed", metadata: { thread_id: id, graph: got.value.graph, result: out.result.status } });
  return NextResponse.json({ status: out.result.status, ...(out.result.status === "failed" ? { error: out.result.error } : {}), ...(out.result.status === "interrupted" ? { waiting_for: out.result.waitingFor } : {}) });
}

export const POST = idempotent("agent-graphs.resume", postHandler);
