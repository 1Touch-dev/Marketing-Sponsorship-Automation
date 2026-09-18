import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/auth/server-permission";
import { runRenewalAgent } from "@/lib/agents/langgraph/renewal-agent";
import { sendSlackNotification } from "@/lib/slack/notify";
import { recordAudit } from "@/lib/audit/log";

export const runtime = "nodejs";
export const maxDuration = 120;

/**
 * POST /api/contracts/renewal-check
 * Phase 8, Team 2 — Renewal Agent (on-demand trigger; not cron-scheduled
 * yet, see PLATFORM_ROADMAP.md Phase 8).
 */
export async function POST() {
  const auth = await requirePermission("create_proposal");
  if ("error" in auth) return auth.error;

  const report = await runRenewalAgent(auth.user.tenant_id);

  const critical = report.drafted.filter((d) => d.severity === "critical");
  if (critical.length > 0) {
    await sendSlackNotification(
      `:memo: *Renewal Agent* — drafted ${critical.length} renewal proposal(s) for contract(s) expiring within 15 days. Review in /approvals or on the proposal directly.`,
    );
  }

  await recordAudit({
    entity_type: "contract",
    action: "contract.renewal_check_run",
    metadata: { drafted_count: report.drafted.length, skipped_count: report.skipped.length },
  });

  return NextResponse.json(report);
}
