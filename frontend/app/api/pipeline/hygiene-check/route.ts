import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/auth/server-permission";
import { runPipelineHygieneAgent } from "@/lib/agents/langgraph/pipeline-hygiene-agent";
import { sendSlackNotification } from "@/lib/slack/notify";
import { recordAudit } from "@/lib/audit/log";
import { userActor } from "@/lib/identity/actor";
import { auditAgentOutputs } from "@/lib/agents/audit";
import { authorizeAgent } from "@/lib/agents/governance";
import { supabaseAdmin } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const maxDuration = 30;

/**
 * POST /api/pipeline/hygiene-check
 * Phase 8, Team 2 — Pipeline Hygiene Agent (on-demand trigger; not
 * cron-scheduled yet, see PLATFORM_ROADMAP.md Phase 8).
 */
export async function POST() {
  const auth = await requirePermission("run_intelligence");
  if ("error" in auth) return auth.error;

  const authority = await authorizeAgent(supabaseAdmin(), auth.user.tenant_id, "pipeline-hygiene-agent", { effects: ["flag_pipeline"] });
  if (!authority.ok) return NextResponse.json({ error: authority.error }, { status: authority.status });
  const report = await runPipelineHygieneAgent(auth.user.tenant_id);

  await auditAgentOutputs("pipeline-hygiene-agent", auth.user, [{ entity_type: "pipeline", action: "agent.hygiene.flagged", metadata: { stale_count: report.staleCompanies.length, critical: report.staleCompanies.filter((c) => c.severity === "critical").length } }]);
  const critical = report.staleCompanies.filter((c) => c.severity === "critical");
  if (critical.length > 0) {
    await sendSlackNotification(
      `:warning: *Pipeline Hygiene Check* — ${critical.length} deal(s) stuck 30+ days with no activity.`,
    );
  }

  await recordAudit({ actor: userActor(auth.user),
    entity_type: "pipeline",
    action: "pipeline.hygiene_check_run",
    metadata: { stale_count: report.staleCompanies.length },
  });

  return NextResponse.json(report);
}
