import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { requirePermissionOrInternal } from "@/lib/auth/server-permission";
import { recordAudit } from "@/lib/audit/log";
import { userOrService } from "@/lib/identity/actor";
import { sweepStuck } from "@/lib/actions/engine";
import { supabaseRpc } from "@/lib/actions/broker";
import { resolveTenantId } from "@/lib/tenants/current";

export const runtime = "nodejs";

/**
 * POST /api/agent-actions/sweep?minutes=10
 * Finds actions left "executing" by a process that died and marks them uncertain: nobody knows whether they went out,
 * so none is run again until a person settles it. Safe to run any time, and on a schedule.
 */
export async function POST(req: Request) {
  const auth = await requirePermissionOrInternal(req, "manage_agents");
  if ("error" in auth) return auth.error;
  const minutes = Math.max(1, Math.min(Number(new URL(req.url).searchParams.get("minutes")) || 10, 1440));
  const n = await sweepStuck(supabaseRpc(supabaseAdmin()), minutes);
  if (n > 0) await recordAudit({ actor: userOrService(auth.user, req, "action-sweeper"), tenant_id: auth.user?.tenant_id ?? (await resolveTenantId()), entity_type: "agent_actions", action: "agent.action.swept", metadata: { marked_uncertain: n, older_than_minutes: minutes } });
  return NextResponse.json({ marked_uncertain: n });
}
