/**
 * Phase 3 clean-window requirement — weekly validation-tracking summary.
 * Computes the trailing-7-day spend-cap + approval-bypass report directly
 * (bypassing HTTP/requireInternalAuth entirely, same reasoning as
 * scripts/run-backup.ts: this runs from cron, not a request), persists it
 * to audit_logs, and posts to Slack.
 *
 * Run: npx tsx scripts/run-weekly-validation.ts
 * Schedule: via scripts/run-weekly-validation-cron.sh
 */
import WS from "ws";
(globalThis as unknown as { WebSocket: unknown }).WebSocket = WS;

import {
  generateWeeklyValidationReport,
  recordWeeklyValidationReport,
} from "@/lib/monitoring/weekly-validation";
import { notifyWeeklyValidationReport } from "@/lib/slack/notify";

async function main() {
  console.log("[weekly-validation] generating trailing-7-day report...");
  const report = await generateWeeklyValidationReport();

  console.log(
    `[weekly-validation] clean=${report.is_clean} spend=$${report.total_spend_usd.toFixed(2)} ` +
      `breaches=${report.spend_cap_breaches.length} email_bypasses=${report.email_bypasses.length} ` +
      `proposal_bypasses=${report.proposal_bypasses.length}`,
  );

  await recordWeeklyValidationReport(report);

  await notifyWeeklyValidationReport({
    isClean: report.is_clean,
    totalSpendUsd: report.total_spend_usd,
    spendCapBreachCount: report.spend_cap_breaches.length,
    emailBypassCount: report.email_bypasses.length,
    proposalBypassCount: report.proposal_bypasses.length,
    appUrl: process.env.APP_URL || "http://localhost:3000",
  });

  if (!report.is_clean) {
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error("[weekly-validation] fatal error:", err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
