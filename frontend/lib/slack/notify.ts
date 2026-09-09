import { serverEnv } from "@/lib/env";
import { logger } from "@/lib/monitoring/logger";

/**
 * Slack internal notifications (master_report.md Section 5 — "Slack: wire
 * for internal notifications"). Uses a single Incoming Webhook
 * (SLACK_WEBHOOK_URL) rather than the full Slack app/bot API — the
 * simplest integration that covers "post a message to one internal
 * channel," which is all three trigger points below need. No SDK, no
 * OAuth, no MCP server required for this direction (app -> Slack); if a
 * future feature needs Slack -> app (e.g. approving from within Slack),
 * that would need the real Slack app/bot setup, not just a webhook.
 *
 * Silently no-ops until SLACK_WEBHOOK_URL is configured — same pattern as
 * scripts/run-backup.ts's local-fallback-with-warning, except there is no
 * safe local fallback for "post a chat message," so this just skips (once
 * per server process) rather than doing nothing useful in its place.
 */

let warnedMissingWebhook = false;

export async function sendSlackNotification(text: string): Promise<void> {
  const { SLACK_WEBHOOK_URL } = serverEnv();
  if (!SLACK_WEBHOOK_URL) {
    if (!warnedMissingWebhook) {
      warnedMissingWebhook = true;
      logger.warn("SLACK_WEBHOOK_URL not configured — internal Slack notifications are disabled", {});
    }
    return;
  }

  try {
    const res = await fetch(SLACK_WEBHOOK_URL, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text }),
    });
    if (!res.ok) {
      logger.warn("Slack webhook post failed", { status: res.status, body: await res.text().catch(() => "") });
    }
  } catch (err) {
    logger.warn("Slack webhook post threw", { error: String(err) });
  }
}

// ── Debounce for the spend-cap notification specifically — the cap check
// runs on every AI call, and once the cap is hit every subsequent call
// would otherwise fire another message. One notification per UTC day is
// enough to alert the team without spamming the channel. ──
let lastSpendCapNotifyDateUtc: string | null = null;

export async function notifySpendCapHit(todaySpendUsd: number, capUsd: number): Promise<void> {
  const todayUtc = new Date().toISOString().slice(0, 10);
  if (lastSpendCapNotifyDateUtc === todayUtc) return;
  lastSpendCapNotifyDateUtc = todayUtc;

  await sendSlackNotification(
    `:rotating_light: *Daily AI spend cap reached* — $${todaySpendUsd.toFixed(2)} / $${capUsd.toFixed(2)}. AI calls (Bedrock/proposal generation) are paused until tomorrow (UTC) or the cap is raised.`
  );
}

export async function notifyApprovalNeeded(args: {
  proposalId: string;
  proposalTitle: string;
  appUrl: string;
}): Promise<void> {
  await sendSlackNotification(
    `:pencil2: *Proposal ready for review* — "${args.proposalTitle}" is waiting on approval before the outreach agent can continue.\n<${args.appUrl}/proposals/${args.proposalId}|Open proposal>`
  );
}

export async function notifyGoneColdNudge(args: {
  proposalId: string;
  proposalTitle: string;
  daysSinceLastView: number;
  appUrl: string;
}): Promise<void> {
  await sendSlackNotification(
    `:snowflake: *Proposal gone cold* — "${args.proposalTitle}" was viewed but no activity for ${args.daysSinceLastView} day(s). A follow-up draft is queued for review.\n<${args.appUrl}/followups|Open follow-ups>`
  );
}
