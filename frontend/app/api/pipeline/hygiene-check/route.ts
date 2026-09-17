import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/auth/server-permission";
import { runPipelineHygieneAgent } from "@/lib/agents/langgraph/pipeline-hygiene-agent";
import { sendSlackNotification } from "@/lib/slack/notify";
import { recordAudit } from "@/lib/audit/log";

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

  const report = await runPipelineHygieneAgent(auth.user.tenant_id);

  const critical = report.staleCompanies.filter((c) => c.severity === "critical");
  if (critical.length > 0) {
    await sendSlackNotification(
      `:warning: *Pipeline Hygiene Check* — ${critical.length} deal(s) stuck 30+ days with no activity.`,
    );
  }

  await recordAudit({
    entity_type: "pipeline",
    action: "pipeline.hygiene_check_run",
    metadata: { stale_count: report.staleCompanies.length },
  });

  return NextResponse.json(report);
}
