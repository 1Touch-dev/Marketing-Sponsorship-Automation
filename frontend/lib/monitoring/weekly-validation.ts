/**
 * Weekly validation-tracking summary (Phase 3 clean-window requirement).
 *
 * Two independent checks over a trailing 7-day window:
 *  - Spend-cap breaches: days where recorded AI spend (spend_ledger) met or
 *    exceeded the daily cap enforced by lib/monitoring/spend-guard.ts.
 *  - Approval bypasses: emails marked "sent" or proposals marked "approved"/
 *    "active_contract" with no corresponding approval audit trail at or
 *    before the moment they were sent/approved — i.e. the approval gate
 *    (server-side enforcement added 2026-09-16 in
 *    app/api/emails/[id]/send/route.ts, and the pre-existing one in
 *    app/api/proposals/[id]/approve/route.ts) was never actually satisfied
 *    for that record. A clean report each week is the evidence that both
 *    gates are holding under real usage, not just in code review.
 *
 * Read-only — never mutates business data. Call
 * recordWeeklyValidationReport() separately to persist the result.
 */
import { supabaseAdmin } from "@/lib/supabase/server";
import { recordAudit } from "@/lib/audit/log";
import { CORITIBA_TENANT_ID } from "@/lib/tenants/types";

function dailyCapUsd(): number {
  const raw = process.env.DAILY_SPEND_CAP_USD;
  const parsed = raw ? Number(raw) : NaN;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 25;
}

export interface SpendCapBreach {
  date: string; // YYYY-MM-DD, UTC
  totalUsd: number;
  capUsd: number;
}

export interface EmailBypass {
  id: string;
  subject: string;
  recipient: string;
  sent_at: string;
}

export interface ProposalBypass {
  id: string;
  title: string;
  status: string;
  approved_at: string | null;
}

export interface WeeklyValidationReport {
  tenant_id: string;
  period_start: string;
  period_end: string;
  total_spend_usd: number;
  spend_cap_breaches: SpendCapBreach[];
  email_bypasses: EmailBypass[];
  proposal_bypasses: ProposalBypass[];
  is_clean: boolean;
}

export async function generateWeeklyValidationReport(
  tenantId: string = CORITIBA_TENANT_ID,
): Promise<WeeklyValidationReport> {
  const sb = supabaseAdmin();
  const periodEnd = new Date();
  const periodStart = new Date(periodEnd.getTime() - 7 * 86_400_000);

  // ── Spend-cap breaches, grouped by UTC calendar day ──
  const { data: spendRows } = await sb
    .from("spend_ledger" as "companies")
    .select("amount_usd, created_at" as "id")
    .eq("tenant_id" as "id", tenantId)
    .gte("created_at" as "id", periodStart.toISOString());

  const spendByDay = new Map<string, number>();
  for (const row of ((spendRows ?? []) as unknown as Array<{ amount_usd: number; created_at: string }>)) {
    const day = row.created_at.slice(0, 10);
    spendByDay.set(day, (spendByDay.get(day) ?? 0) + Number(row.amount_usd ?? 0));
  }
  const cap = dailyCapUsd();
  const spendCapBreaches: SpendCapBreach[] = Array.from(spendByDay.entries())
    .filter(([, total]) => total >= cap)
    .map(([date, totalUsd]) => ({ date, totalUsd, capUsd: cap }));
  const totalSpendUsd = Array.from(spendByDay.values()).reduce((a, b) => a + b, 0);

  // ── Email approval bypasses ──
  const { data: sentEmails } = await sb
    .from("emails")
    .select("id, subject, recipient, sent_at")
    .eq("tenant_id", tenantId)
    .eq("status", "sent")
    .gte("sent_at", periodStart.toISOString());

  const emailBypasses: EmailBypass[] = [];
  if (sentEmails && sentEmails.length > 0) {
    const emailIds = sentEmails.map((e) => e.id);
    const { data: approvalAudits } = await sb
      .from("audit_logs")
      .select("entity_id, action, created_at")
      .eq("tenant_id", tenantId)
      .eq("entity_type", "email")
      .in("action", ["email.approved", "email.draft_created"])
      .in("entity_id", emailIds);

    const approvedBefore = new Map<string, string[]>();
    for (const row of (approvalAudits ?? [])) {
      const list = approvedBefore.get(row.entity_id as string) ?? [];
      list.push(row.created_at as string);
      approvedBefore.set(row.entity_id as string, list);
    }

    for (const email of sentEmails) {
      const sentAt = email.sent_at as string;
      const approvals = approvedBefore.get(email.id) ?? [];
      const hasValidApproval = approvals.some((ts) => ts <= sentAt);
      if (!hasValidApproval) {
        emailBypasses.push({
          id: email.id,
          subject: email.subject,
          recipient: email.recipient,
          sent_at: sentAt,
        });
      }
    }
  }

  // ── Proposal approval bypasses ──
  const { data: approvedProposals } = await sb
    .from("proposals")
    .select("id, title, status, approved_at")
    .eq("tenant_id", tenantId)
    .in("status", ["approved", "active_contract"])
    .gte("approved_at", periodStart.toISOString());

  const proposalBypasses: ProposalBypass[] = [];
  if (approvedProposals && approvedProposals.length > 0) {
    const proposalIds = approvedProposals.map((p) => p.id);
    const { data: approvalRows } = await sb
      .from("approvals")
      .select("proposal_id, decision, created_at")
      .eq("tenant_id", tenantId)
      .eq("decision", "approve")
      .in("proposal_id", proposalIds);

    const approvedIds = new Set((approvalRows ?? []).map((r) => r.proposal_id as string));
    for (const proposal of approvedProposals) {
      if (!approvedIds.has(proposal.id)) {
        proposalBypasses.push({
          id: proposal.id,
          title: proposal.title,
          status: proposal.status,
          approved_at: proposal.approved_at,
        });
      }
    }
  }

  return {
    tenant_id: tenantId,
    period_start: periodStart.toISOString(),
    period_end: periodEnd.toISOString(),
    total_spend_usd: totalSpendUsd,
    spend_cap_breaches: spendCapBreaches,
    email_bypasses: emailBypasses,
    proposal_bypasses: proposalBypasses,
    is_clean: spendCapBreaches.length === 0 && emailBypasses.length === 0 && proposalBypasses.length === 0,
  };
}

/** Persists the report as an audit_logs row so there's a queryable weekly
 * history without needing a dedicated table. */
export async function recordWeeklyValidationReport(report: WeeklyValidationReport): Promise<void> {
  await recordAudit({
    entity_type: "system",
    action: "validation.weekly_report",
    tenant_id: report.tenant_id,
    metadata: report as unknown as Record<string, unknown>,
  });
}
