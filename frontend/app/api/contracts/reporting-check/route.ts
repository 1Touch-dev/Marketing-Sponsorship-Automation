import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/auth/server-permission";
import { runReportingAgent } from "@/lib/agents/langgraph/reporting-agent";
import { recordAudit } from "@/lib/audit/log";

export const runtime = "nodejs";
export const maxDuration = 120;

/**
 * POST /api/contracts/reporting-check
 * Phase 8, Team 2 — Reporting Agent (on-demand trigger; not cron-scheduled
 * yet, see PLATFORM_ROADMAP.md Phase 8).
 */
export async function POST() {
  const auth = await requirePermission("create_proposal");
  if ("error" in auth) return auth.error;

  const report = await runReportingAgent(auth.user.tenant_id);

  await recordAudit({
    entity_type: "contract",
    action: "contract.reporting_check_run",
    metadata: { drafted_count: report.drafted.length, skipped_count: report.skipped.length },
  });

  return NextResponse.json(report);
}
