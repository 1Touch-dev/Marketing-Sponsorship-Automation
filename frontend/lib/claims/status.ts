/**
 * Whether a claim may appear in a sponsor-facing document (Task 8).
 *
 * Derived from facts, never stored: the version's own metadata (source, owner,
 * dates) plus the latest review of that exact version. A figure is usable only
 * when someone verified it, it names a source and an owner, and it is in date.
 *
 * Pure: no database, no clock. Callers pass `now`.
 */

export const SOURCE_KINDS = [
  "official_club",
  "public_statistics",
  "third_party_report",
  "internal_estimate",
  "unknown",
] as const;
export type SourceKind = (typeof SOURCE_KINDS)[number];

export type ClaimState =
  | "current"
  | "expiring_soon"
  | "scheduled"
  | "expired"
  | "unreviewed"
  | "disputed"
  | "unsupported"
  | "retired";

/** How many days before expiry a claim is flagged. It stays usable. */
export const EXPIRY_WARNING_DAYS = 30;

export interface ClaimVersionFacts {
  source_kind: SourceKind;
  source_ref: string | null;
  effective_date: string | null; // YYYY-MM-DD
  expires_at: string | null; // YYYY-MM-DD
  owner: string | null;
}

export interface ReviewFact {
  decision: "verified" | "disputed";
  created_at: string;
}

export interface ClaimEvaluation {
  state: ClaimState;
  usable: boolean;
  /** Every reason the claim is not clean, most important first. */
  reasons: string[];
  /** Days until expiry (negative once expired); null without an expiry date. */
  daysToExpiry: number | null;
  /** True for an internal estimate: it must be labelled as one wherever shown. */
  isEstimate: boolean;
}

const blank = (s: string | null | undefined) => !s || s.trim() === "";

/** Whole days from the UTC date of `now` to a YYYY-MM-DD date. */
export function daysUntil(date: string, now: Date): number {
  const [y, m, d] = date.split("-").map(Number);
  const target = Date.UTC(y, m - 1, d);
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  return Math.round((target - today) / 86_400_000);
}

/** The most recent review wins; ties break toward the later array position. */
export function latestReview(reviews: ReviewFact[]): ReviewFact | null {
  let best: ReviewFact | null = null;
  for (const r of reviews) {
    if (!best || r.created_at >= best.created_at) best = r;
  }
  return best;
}

export function evaluateClaim(input: {
  version: ClaimVersionFacts;
  reviews: ReviewFact[];
  retired: boolean;
  now: Date;
}): ClaimEvaluation {
  const { version, reviews, retired, now } = input;
  const reasons: string[] = [];
  const review = latestReview(reviews);

  const daysToExpiry = version.expires_at ? daysUntil(version.expires_at, now) : null;
  const expired = daysToExpiry !== null && daysToExpiry < 0;
  const scheduled = version.effective_date ? daysUntil(version.effective_date, now) > 0 : false;

  if (retired) reasons.push("retired");
  if (review?.decision === "disputed") reasons.push("disputed by a reviewer");

  const missing: string[] = [];
  if (blank(version.source_ref)) missing.push("source");
  if (version.source_kind === "unknown") missing.push("source type");
  if (blank(version.owner)) missing.push("owner");
  if (!version.effective_date) missing.push("effective date");
  if (!version.expires_at) missing.push("expiry date");
  if (missing.length > 0) reasons.push(`missing ${missing.join(", ")}`);

  if (expired) reasons.push(`expired ${-(daysToExpiry as number)} day(s) ago`);
  if (scheduled) reasons.push(`not effective until ${version.effective_date}`);
  if (review?.decision !== "verified" && review?.decision !== "disputed") reasons.push("not yet verified by a reviewer");

  let state: ClaimState;
  if (retired) state = "retired";
  else if (review?.decision === "disputed") state = "disputed";
  else if (missing.length > 0) state = "unsupported";
  else if (expired) state = "expired";
  else if (scheduled) state = "scheduled";
  else if (review?.decision !== "verified") state = "unreviewed";
  else if (daysToExpiry !== null && daysToExpiry <= EXPIRY_WARNING_DAYS) state = "expiring_soon";
  else state = "current";

  if (state === "expiring_soon") reasons.push(`expires in ${daysToExpiry} day(s)`);

  return {
    state,
    usable: state === "current" || state === "expiring_soon",
    reasons,
    daysToExpiry,
    isEstimate: version.source_kind === "internal_estimate",
  };
}
