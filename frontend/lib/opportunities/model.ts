import { stageOf, type ProposalStatus } from "../metrics/definitions";

/**
 * Opportunities (Task 11): the account-level deal between a company and its
 * proposals and contracts. One company can run several at once.
 *
 * An opportunity's status is derived, never stored:
 *   closed  a person closed it (the newest event says so)
 *   won     it has an active contract (or a proposal in the "won" stage)
 *   lost    it has proposals and every one was rejected
 *   open    a proposal is under review, sent back, or approved
 *   draft   it has only drafts, or no proposal yet
 */

export const OPPORTUNITY_KINDS = ["cash", "barter", "hybrid", "incentive", "renewal", "other"] as const;
export type OpportunityKind = (typeof OPPORTUNITY_KINDS)[number];

export const KIND_LABELS: Record<OpportunityKind, string> = {
  cash: "Cash sponsorship",
  barter: "Barter deal",
  hybrid: "Cash and barter deal",
  incentive: "Lei de Incentivo deal",
  renewal: "Renewal",
  other: "Other deal",
};

/** The same mapping the migration's backfill uses. No type counts as a cash sponsorship. */
export function kindFromProposalType(type: string | null | undefined): OpportunityKind {
  switch (type ?? "sponsorship") {
    case "barter": return "barter";
    case "mixed": return "hybrid";
    case "lei_de_incentivo": return "incentive";
    case "sponsorship":
    case "national_brand": return "cash";
    default: return "other";
  }
}

export type OpportunityStatus = "draft" | "open" | "won" | "lost" | "closed";

export interface StatusFacts {
  /** Statuses of the proposals that belong to the opportunity. */
  proposalStatuses: string[];
  /** True when a contract of the opportunity is active. */
  hasActiveContract: boolean;
  /** The newest closed/reopened event, or null. */
  lastEvent: "closed" | "reopened" | null;
}

export function deriveOpportunityStatus(f: StatusFacts): OpportunityStatus {
  if (f.lastEvent === "closed") return "closed";
  const stages = f.proposalStatuses.map((s) => stageOf(s as ProposalStatus));
  if (f.hasActiveContract || stages.includes("won")) return "won";
  if (stages.length > 0 && stages.every((s) => s === "lost")) return "lost";
  if (stages.some((s) => s === "awaiting_approval" || s === "sent_back" || s === "approved")) return "open";
  return "draft";
}

/** A new proposal may join an opportunity that is still being worked. */
export const isAttachable = (status: OpportunityStatus) => status === "draft" || status === "open";

export type Actor =
  | { kind: "human"; email: string; userId?: string | null }
  | { kind: "agent"; name: string }
  | { kind: "rule"; name: string };
