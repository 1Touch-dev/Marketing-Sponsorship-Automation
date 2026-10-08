/**
 * The three account stages (Task 10), derived from facts and never stored as a
 * status someone can set. Mirrors the SQL view company_account_stage.
 *
 *   directory   known to the platform; no research on file
 *   researched  the newest cited research reached a conclusion (pursue, park or
 *               not_a_fit); "needs_more_research" keeps the trail but does not count
 *   qualified   a person decided it is a real sales opportunity
 */

export const ACCOUNT_STAGES = ["directory", "researched", "qualified"] as const;
export type AccountStage = (typeof ACCOUNT_STAGES)[number];

export const STAGE_DEFINITIONS: Record<AccountStage, string> = {
  directory: "An organization the platform knows about. Nobody has researched it.",
  researched: "Cited research reached a conclusion (pursue, park or not a fit). It is not a sales opportunity.",
  qualified: "A person decided this is a real sales opportunity.",
};

/** Pipeline columns a person can drag a card into that mean "this is a real opportunity". */
export const QUALIFYING_PIPELINE_STAGES = ["qualified", "diagnosis", "prepare_proposal", "proposal_sent", "negotiation", "closed_won"] as const;

export interface StageFacts {
  /** The newest research record, or null when there is none. */
  research: { id: string; recommendation: string } | null;
  /** The newest qualification decision, or null when there is none. */
  qualification: { decision: "qualified" | "disqualified" | "revoked" } | null;
}

export function deriveStage(f: StageFacts): AccountStage {
  if (f.qualification?.decision === "qualified") return "qualified";
  if (f.research && f.research.recommendation !== "needs_more_research") return "researched";
  return "directory";
}
