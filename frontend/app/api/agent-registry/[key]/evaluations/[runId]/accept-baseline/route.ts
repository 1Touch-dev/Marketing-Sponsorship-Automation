import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { requirePermission } from "@/lib/auth/server-permission";
import { recordAudit } from "@/lib/audit/log";
import { userActor } from "@/lib/identity/actor";
import { acceptBaseline } from "@/lib/evals/store";

export const runtime = "nodejs";

/** POST /api/agent-registry/<key>/evaluations/<run>/accept-baseline: this passing run becomes the reference later versions' cost and quality are compared with. */
export async function POST(_req: Request, ctx: { params: { key: string; runId: string } }) {
  const auth = await requirePermission("manage_agents");
  if ("error" in auth) return auth.error;
  const res = await acceptBaseline(supabaseAdmin(), auth.user.tenant_id, ctx.params.runId, auth.user.email);
  if (!res.ok) return NextResponse.json({ error: res.error }, { status: res.status });
  await recordAudit({ actor: userActor(auth.user), entity_type: "agent", action: "agent.baseline_accepted", metadata: { key: ctx.params.key, run_id: ctx.params.runId, cases: res.value.cases } });
  return NextResponse.json(res.value, { status: 201 });
}
