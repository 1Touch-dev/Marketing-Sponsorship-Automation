import { NextRequest, NextResponse } from "next/server";
import { requireInternalAuth } from "@/lib/internal-auth";
import {
  generateWeeklyValidationReport,
  recordWeeklyValidationReport,
} from "@/lib/monitoring/weekly-validation";
import { notifyWeeklyValidationReport } from "@/lib/slack/notify";
import { serverEnv } from "@/lib/env";

/**
 * POST /api/system/weekly-validation
 * Cron-triggered (see scripts/run-weekly-validation-cron.sh) or manually
 * triggerable from /system. Computes the trailing-7-day spend-cap +
 * approval-bypass report, records it to audit_logs for history, and
 * notifies Slack.
 */
export async function POST(req: NextRequest) {
  const authErr = requireInternalAuth(req);
  if (authErr) return authErr;

  const report = await generateWeeklyValidationReport();
  await recordWeeklyValidationReport(report);

  const { APP_URL } = serverEnv();
  await notifyWeeklyValidationReport({
    isClean: report.is_clean,
    totalSpendUsd: report.total_spend_usd,
    spendCapBreachCount: report.spend_cap_breaches.length,
    emailBypassCount: report.email_bypasses.length,
    proposalBypassCount: report.proposal_bypasses.length,
    appUrl: APP_URL || "http://localhost:3000",
  });

  return NextResponse.json({ ok: true, report });
}
