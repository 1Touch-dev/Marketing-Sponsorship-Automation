import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { requirePermissionOrInternal } from "@/lib/auth/server-permission";
import { recordAudit } from "@/lib/audit/log";
import { userOrService } from "@/lib/identity/actor";
import { sweepStuckRuns } from "@/lib/agents/langgraph/runtime";
import { resolveTenantId } from "@/lib/tenants/current";

export const runtime = "nodejs";

/**
 * POST /api/agent-graphs/sweep?minutes=10
 * A run whose process died stays "running" with no sign of life. This marks those failed, so they can be carried on from
 * their last saved step. Safe to run any time, and on a schedule.
 */
export async function POST(req: Request) {
  const auth = await requirePermissionOrInternal(req, "manage_agents");
  if ("error" in auth) return auth.error;
  const minutes = Math.max(1, Math.min(Number(new URL(req.url).searchParams.get("minutes")) || 10, 1440));
  const tenantId = auth.user?.tenant_id ?? (await resolveTenantId());
  const res = await sweepStuckRuns(supabaseAdmin(), tenantId, minutes);
  if (!res.ok) return NextResponse.json({ error: res.error }, { status: res.status });
  if (res.value.marked_failed.length > 0) await recordAudit({ actor: userOrService(auth.user, req, "graph-sweeper"), tenant_id: tenantId, entity_type: "agent_run", action: "agent.run.swept", metadata: { marked_failed: res.value.marked_failed.length, older_than_minutes: minutes } });
  return NextResponse.json({ marked_failed: res.value.marked_failed.length, threads: res.value.marked_failed });
}
