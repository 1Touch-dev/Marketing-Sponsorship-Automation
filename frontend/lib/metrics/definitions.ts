/**
 * One definition for every business number the app shows. A number that
 * appears on more than one page is computed here, once, and each page reads
 * it instead of re-deriving it with its own filter. Every metric states what
 * it counts, what it divides by, and where to click to see the rows.
 */

export type ProposalStatus =
  | "draft" | "under_review" | "revision_requested" | "approved" | "scheduled" | "sent" | "rejected" | "active_contract";

/** Each proposal status belongs to exactly one stage. */
export const PROPOSAL_STAGES = {
  draft: ["draft"],
  awaiting_approval: ["under_review"],
  sent_back: ["revision_requested"],
  approved: ["approved", "scheduled", "sent"],
  won: ["active_contract"],
  lost: ["rejected"],
} as const satisfies Record<string, readonly ProposalStatus[]>;

export type ProposalStage = keyof typeof PROPOSAL_STAGES;

/** Everything except lost: what the Proposals list shows. */
export const LIVE_STATUSES: ProposalStatus[] = [...PROPOSAL_STAGES.draft, ...PROPOSAL_STAGES.awaiting_approval, ...PROPOSAL_STAGES.sent_back, ...PROPOSAL_STAGES.approved, ...PROPOSAL_STAGES.won];

/** Offers still in play: submitted, sent back, or approved, but not yet won or lost. */
export const OPEN_PIPELINE_STATUSES: ProposalStatus[] = [...PROPOSAL_STAGES.awaiting_approval, ...PROPOSAL_STAGES.sent_back, ...PROPOSAL_STAGES.approved];

export function stageOf(status: ProposalStatus): ProposalStage | null {
  for (const [stage, statuses] of Object.entries(PROPOSAL_STAGES)) {
    if ((statuses as readonly string[]).includes(status)) return stage as ProposalStage;
  }
  return null;
}

export type MetricUnit = "count" | "brl" | "percent";

export type MetricValue = {
  id: string;
  label: string;
  unit: MetricUnit;
  /** null means "not computable" (for example a rate with nothing to divide by), never a silent zero */
  value: number | null;
  definition: string;
  source: string;
  href: string | null;
  numerator?: number;
  denominator?: number;
  caveats: string[];
  extra?: Record<string, number>;
};

export type MetricsSnapshot = {
  generated_at: string;
  metrics: Record<string, MetricValue>;
};

/** A percentage that is null, not 0, when there is nothing to divide by. */
export function percent(numerator: number, denominator: number): number | null {
  if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator <= 0) return null;
  return Math.round((numerator / denominator) * 100);
}

export type ContractValueRow = { total_value_brl: number | string | null };

/** Contracted value, with an honest account of contracts that have no value recorded. */
export function contractedValue(rows: ContractValueRow[]) {
  const known = rows.map((r) => Number(r.total_value_brl)).filter((n) => Number.isFinite(n) && n > 0);
  return { total: known.reduce((s, n) => s + n, 0), contracts: rows.length, withValue: known.length, withoutValue: rows.length - known.length };
}

export type PackageRow = { proposal_id: string; price_brl: number | string | null };

/**
 * Packages on one proposal are alternative price options, so their prices must
 * not be added together. Per proposal take the cheapest and the dearest option.
 */
export function pipelineRange(packages: PackageRow[], openProposalCount: number) {
  const byProposal = new Map<string, number[]>();
  for (const p of packages) {
    const price = Number(p.price_brl);
    if (!Number.isFinite(price) || price <= 0) continue;
    byProposal.set(p.proposal_id, [...(byProposal.get(p.proposal_id) ?? []), price]);
  }
  let low = 0;
  let high = 0;
  for (const prices of byProposal.values()) {
    low += Math.min(...prices);
    high += Math.max(...prices);
  }
  return { low, high, pricedProposals: byProposal.size, openProposals: openProposalCount };
}

/** Plain-language definitions, shown wherever a number is shown. */
export const DEFINITIONS = {
  proposals_live: { label: "Proposals", definition: "Every proposal that is not rejected.", source: "proposals", href: "/proposals" },
  proposals_awaiting_approval: { label: "Proposals awaiting approval", definition: "Proposals submitted for review and waiting for an approver (status: under review).", source: "proposals", href: "/approvals?status=under_review" },
  proposals_sent_back: { label: "Proposals sent back for rework", definition: "Proposals an approver sent back to their author (status: revision requested).", source: "proposals", href: "/approvals?status=revision_requested" },
  proposals_approved: { label: "Proposals approved", definition: "Approved proposals that have not yet become a contract.", source: "proposals", href: "/approvals?status=approved" },
  proposals_won: { label: "Proposals marked in contract", definition: "Proposals whose status is active contract. This is a status someone set; see 'contracts' for signed records.", source: "proposals", href: "/proposals?status=active_contract" },
  opportunities_open: { label: "Open opportunities", definition: "Account-level deals with a proposal under review, sent back or approved, that a person has not closed. One company can have several at once (cash, barter, renewal...).", source: "opportunities + proposals", href: "/companies" },
  opportunities_won: { label: "Won opportunities", definition: "Opportunities with an active contract (or a proposal marked in contract), that a person has not closed.", source: "opportunities + contracts", href: "/companies" },
  accounts_with_parallel_opportunities: { label: "Accounts with parallel opportunities", definition: "Companies that have two or more opportunities being worked at the same time (draft or open).", source: "opportunities", href: "/companies" },
  proposals_lost: { label: "Proposals rejected", definition: "Proposals that were rejected.", source: "proposals", href: "/proposals?status=rejected" },
  emails_awaiting_approval: { label: "Emails awaiting approval", definition: "Outreach emails waiting for an approver (status: pending approval).", source: "emails", href: "/approvals?type=emails&status=pending_approval" },
  approvals_pending_total: { label: "Awaiting approval", definition: "Proposals awaiting approval plus emails awaiting approval: everything an approver has to decide on right now. It does not include drafts or items already approved.", source: "proposals + emails", href: "/approvals" },
  contracts_active: { label: "Active contracts", definition: "Contract records whose status is active.", source: "contracts", href: "/contracts" },
  proposals_won_without_contract: { label: "Marked in contract, no contract record", definition: "Proposals whose status is active contract but that have no contract record behind them.", source: "proposals + contracts", href: "/proposals?status=active_contract" },
  contracted_value_brl: { label: "Contracted value", definition: "Sum of the value recorded on active contracts. Contracts with no value recorded are not counted as zero; they are listed separately.", source: "contracts", href: "/contracts" },
  emails_marked_sent: { label: "Emails marked sent", definition: "Emails whose status is sent. Sending only logs the email in the CRM; it does not mean the recipient received it.", source: "emails", href: "/emails?status=sent" },
  emails_marked_sent_this_month: { label: "Emails marked sent this month", definition: "Emails marked sent since the first of this month, by the date they were marked sent.", source: "emails", href: "/emails?status=sent" },
  emails_opened: { label: "Sent emails opened", definition: "Emails marked sent that the recipient's mail client later opened (tracking pixel).", source: "emails", href: "/emails?status=opened" },
  email_open_rate: { label: "Open rate", definition: "Sent emails opened, divided by emails marked sent.", source: "emails", href: "/emails?status=opened" },
  emails_clicked: { label: "Sent emails with a link clicked", definition: "Emails marked sent where a tracked link was clicked.", source: "emails", href: "/emails" },
  win_rate: { label: "Win rate", definition: "Proposals marked in contract, divided by proposals marked in contract plus proposals rejected. Open proposals are not counted either way.", source: "proposals", href: "/reports" },
  pipeline_value_brl: { label: "Open pipeline value", definition: "For each open proposal that has priced packages, the cheapest package option; the highest option is shown as the ceiling. Package options are alternatives and are never added together. Open proposals with no priced package are not valued.", source: "proposal_packages + proposals", href: "/proposals" },
} as const;

export type MetricId = keyof typeof DEFINITIONS;
