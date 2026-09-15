import { ShieldCheck } from "lucide-react";

/**
 * Pattern 9 (master_report.md Section 8 — "enterprise trust erosion from
 * over-automation", citing GodmodeHQ/Astra/Builder.ai): "Position as
 * augmentation with a visible 'human takeover' mode in every workflow;
 * conservative, verifiable marketing claims." The approval-gate mechanism
 * itself (Pattern 4) has existed since 2026-09-08 — this surfaces it in the
 * UI instead of leaving it an invisible backend guarantee.
 *
 * IMPORTANT — keep this copy honest, it is a claim a real buyer could check:
 * a single-company run (the UI's default path) always pauses for human
 * proposal approval before drafting an email. Pre-approved BATCH campaigns
 * (app/api/agents/outreach/batch/route.ts, mode defaults to "auto") skip
 * that pause by design — that is the point of marking a campaign
 * pre-approved. The one claim that is unconditionally true everywhere,
 * confirmed by code inspection 2026-09-15 (toolSendEmail in
 * lib/agents/tools.ts never calls the real Gmail-send function): no real
 * external email has ever left this system automatically or otherwise —
 * "send" only logs a Pipedrive activity, because live sending (Pattern 3)
 * was never wired up. Do not overclaim beyond that without re-verifying.
 */
export function HumanInTheLoopBadge({ compact = false }: { compact?: boolean }) {
  if (compact) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-emerald-600/30 bg-emerald-50 dark:bg-emerald-950/30 px-2 py-0.5 text-[11px] font-medium text-emerald-700 dark:text-emerald-400">
        <ShieldCheck className="h-3 w-3" />
        No email has ever sent without human review
      </span>
    );
  }

  return (
    <div className="flex items-start gap-2 rounded-lg border border-emerald-600/30 bg-emerald-50 dark:bg-emerald-950/30 px-3 py-2 text-xs text-emerald-800 dark:text-emerald-400">
      <ShieldCheck className="h-4 w-4 shrink-0 mt-0.5" />
      <span>
        <strong>Human-in-the-loop by default.</strong> Running the agent on a single company
        always pauses here for a person to approve, edit, or reject the proposal before an email
        is drafted. Pre-approved batch campaigns can skip that pause by design — but even then,
        no real outbound email has ever left this system unattended: &quot;sent&quot; today means
        logging the activity to your CRM, not live delivery.
      </span>
    </div>
  );
}
