/**
 * The sponsor recap: what was sold, scheduled, delivered, evidenced and accepted, reconciled into one
 * record per contract, with measured results kept visibly apart from modeled estimates and every
 * missing piece of proof surfaced as a named gap. Pure rules only (no database).
 */
import crypto from "crypto";
import type { ObligationStatus } from "../obligations/model";

// ── commitments ─────────────────────────────────────────────────────────────

export interface ObligationFact {
  id: string; title: string; kind: "deliverable" | "onboarding"; quantity: number | null; unit: string | null; allocation_id: string | null;
  due_date: string; owner_email: string; status: ObligationStatus; proof: "attached" | "stated" | "none"; moved: boolean;
}

export interface CommitmentLine extends ObligationFact { gaps: GapKind[] }

export interface Commitments {
  /** every obligation the contract created */
  sold: number;
  /** sold and given an owner and a date */
  scheduled: number;
  /** marked delivered, whether or not proved */
  delivered: number;
  /** delivered and backed by proof */
  evidenced: number;
  /** proved and accepted by a second person */
  accepted: number;
  waived: number;
  open: number;
  overdue: number;
  lines: CommitmentLine[];
}

// ── gaps ────────────────────────────────────────────────────────────────────

export type GapKind =
  | "no_obligations" | "not_delivered_overdue" | "missing_proof" | "weak_proof" | "not_accepted"
  | "no_outcome_data" | "matches_without_reach" | "unsourced_measure" | "signature_unproven" | "no_value_recorded";

export interface Gap {
  kind: GapKind;
  /** a blocking gap means the recap cannot honestly be called complete */
  blocking: boolean;
  subject: string | null;
  message: string;
  /** what would close it */
  fix: string;
}

const GAP_INFO: Record<GapKind, { blocking: boolean; fix: string }> = {
  no_obligations: { blocking: true, fix: "Run the contract handoff so the commitments exist, then record delivery." },
  not_delivered_overdue: { blocking: true, fix: "Deliver it and record it, or move its date with a reason, or waive it with a reason." },
  missing_proof: { blocking: true, fix: "Attach proof of delivery (a link, a file or a written statement) to the obligation." },
  weak_proof: { blocking: false, fix: "Replace the written statement with a link or file that shows it." },
  not_accepted: { blocking: false, fix: "Have a second person confirm the delivery." },
  no_outcome_data: { blocking: false, fix: "Record the real reach for the matches in the contract period." },
  matches_without_reach: { blocking: false, fix: "Record reach for those matches, with its source." },
  unsourced_measure: { blocking: false, fix: "Add the source to the reach record. Until then it is left out of the measured results." },
  signature_unproven: { blocking: false, fix: "Record signature evidence for the contract (provider record or a second person's verification)." },
  no_value_recorded: { blocking: false, fix: "Record the cash and barter lines for the contract." },
};

export const gap = (kind: GapKind, subject: string | null, message: string): Gap => ({ kind, blocking: GAP_INFO[kind].blocking, subject, message, fix: GAP_INFO[kind].fix });

// ── reconciling the obligations ─────────────────────────────────────────────

export function reconcileCommitments(obligations: ObligationFact[], today: string): { commitments: Commitments; gaps: Gap[] } {
  const gaps: Gap[] = [];
  const lines: CommitmentLine[] = obligations.map((o) => {
    const g: GapKind[] = [];
    if (o.status === "open" && o.due_date < today) g.push("not_delivered_overdue");
    if (o.status === "delivered") g.push("missing_proof");
    if ((o.status === "evidenced" || o.status === "accepted") && o.proof === "stated") g.push("weak_proof");
    if (o.status === "evidenced") g.push("not_accepted");
    for (const k of g) {
      const what = k === "not_delivered_overdue" ? `was due ${o.due_date} and is not recorded as delivered`
        : k === "missing_proof" ? "is marked delivered but has no proof attached"
        : k === "weak_proof" ? "is supported only by a written statement"
        : "has proof but no second person has accepted it";
      gaps.push(gap(k, o.id, `"${o.title}" ${what}`));
    }
    return { ...o, gaps: g };
  });

  const count = (f: (o: ObligationFact) => boolean) => obligations.filter(f).length;
  const commitments: Commitments = {
    sold: obligations.length,
    scheduled: count((o) => !!o.owner_email && !!o.due_date),
    delivered: count((o) => o.status === "delivered" || o.status === "evidenced" || o.status === "accepted"),
    evidenced: count((o) => o.status === "evidenced" || o.status === "accepted"),
    accepted: count((o) => o.status === "accepted"),
    waived: count((o) => o.status === "waived"),
    open: count((o) => o.status === "open"),
    overdue: count((o) => o.status === "open" && o.due_date < today),
    lines,
  };
  if (obligations.length === 0) gaps.push(gap("no_obligations", null, "The contract has no obligations, so nothing can be reconciled"));
  return { commitments, gaps };
}

// ── outcomes: measured and modeled, kept apart ──────────────────────────────

export interface Figure {
  id: string;
  label: string;
  value: number | string;
  unit: string | null;
  basis: "measured" | "modeled";
  /** where a measured figure comes from; a modeled one says whose estimate it is */
  source: string | null;
  note: string | null;
}

export interface ReachRow { match_id: string; match_date: string; opponent: string; official_views: number; unofficial_fan_views: number; rival_account_views: number; media_tv_radio_views: number; source_notes: string | null }

const REACH_METRICS: Array<{ key: keyof Pick<ReachRow, "official_views" | "unofficial_fan_views" | "rival_account_views" | "media_tv_radio_views">; label: string }> = [
  { key: "official_views", label: "Views on the club's official channels" },
  { key: "unofficial_fan_views", label: "Views on fan channels" },
  { key: "rival_account_views", label: "Views on rival accounts" },
  { key: "media_tv_radio_views", label: "TV and radio audience" },
];

/**
 * Measured results come only from recorded reach that states its source. A reach record with no source is
 * left out of the figures and named as a gap, so an unsourced number can never read as a result.
 */
export function measuredFromReach(rows: ReachRow[], pastMatches: Array<{ id: string; opponent: string; match_date: string }>): { measured: Figure[]; gaps: Gap[] } {
  const gaps: Gap[] = [];
  const sourced = rows.filter((r) => !!r.source_notes && r.source_notes.trim().length > 0);
  const unsourced = rows.filter((r) => !r.source_notes || r.source_notes.trim().length === 0);
  for (const r of unsourced) gaps.push(gap("unsourced_measure", r.match_id, `Reach for ${r.opponent} (${r.match_date}) has no source, so it is not counted as a measured result`));

  const withRow = new Set(rows.map((r) => r.match_id));
  const missing = pastMatches.filter((m) => !withRow.has(m.id));
  if (pastMatches.length === 0) gaps.push(gap("no_outcome_data", null, "No match has been played in the contract period, so there is no reach to measure yet"));
  else if (sourced.length === 0) gaps.push(gap("no_outcome_data", null, "No sourced reach has been recorded for any match in the contract period"));
  if (missing.length > 0 && pastMatches.length > 0) gaps.push(gap("matches_without_reach", null, `${missing.length} of ${pastMatches.length} matches played in the period have no reach recorded`));

  const measured: Figure[] = [];
  if (sourced.length > 0) {
    const sources = [...new Set(sourced.map((r) => r.source_notes!.trim()))];
    for (const m of REACH_METRICS) {
      const total = sourced.reduce((s, r) => s + (Number(r[m.key]) || 0), 0);
      if (total <= 0) continue;
      measured.push({
        id: `reach:${m.key}`, label: m.label, value: total, unit: "views", basis: "measured",
        source: `match_media_reach, ${sourced.length} match${sourced.length === 1 ? "" : "es"}; sources: ${sources.join("; ").slice(0, 400)}`, note: null,
      });
    }
  }
  return { measured, gaps };
}

/** Estimates made before delivery (for example the AI-written reach estimate in a strategy). Never a result. */
export function modeledFromVariants(variants: unknown): Figure[] {
  if (!Array.isArray(variants)) return [];
  const out: Figure[] = [];
  variants.forEach((v: any, i) => {
    if (v && typeof v.estimated_reach === "string" && v.estimated_reach.trim()) {
      out.push({
        id: `strategy:${i + 1}:estimated_reach`, label: `Estimated reach, strategy "${String(v.label ?? v.name ?? i + 1).slice(0, 80)}"`, value: v.estimated_reach.trim().slice(0, 400), unit: null,
        basis: "modeled", source: "Estimate written into the proposal before delivery", note: "An estimate, not a result: it was never measured.",
      });
    }
  });
  return out;
}

/** Problems that would let an estimate pass as a result. */
export function separationProblems(measured: Figure[], modeled: Figure[]): string[] {
  const p: string[] = [];
  for (const f of measured) {
    if (f.basis !== "measured") p.push(`"${f.label}" is ${f.basis} but sits in the measured list`);
    if (!f.source || !f.source.trim()) p.push(`"${f.label}" is in the measured list without a source`);
  }
  for (const f of modeled) if (f.basis !== "modeled") p.push(`"${f.label}" is ${f.basis} but sits in the modeled list`);
  return p;
}

// ── money recorded against the contract (Task 18) ───────────────────────────

export interface Financial {
  recorded: boolean;
  cash: { committed: number; invoiced: number; settled: number };
  barter: { committed: number; received: number };
  savings_realized: number;
  note: string;
}

// ── the recap ───────────────────────────────────────────────────────────────

export type RecapStatus = "not_ready" | "in_progress" | "ready_with_gaps" | "complete";

export interface Recap {
  contract: { id: string; contract_number: string | null; title: string; company_id: string; start_date: string | null; end_date: string | null; status: string };
  generated_for: string;
  status: RecapStatus;
  commitments: Commitments;
  measured: Figure[];
  modeled: Figure[];
  financial: Financial;
  gaps: Gap[];
  gap_count: number;
  blocking_gap_count: number;
  signature: { stage: string; label: string; verified: boolean } | null;
  rules: string[];
}

export function deriveRecapStatus(i: { commitments: Commitments; endDate: string | null; blockingGaps: number; today: string }): RecapStatus {
  if (i.commitments.sold === 0) return "not_ready";
  if (!i.endDate || i.endDate >= i.today) return "in_progress";
  return i.blockingGaps > 0 ? "ready_with_gaps" : "complete";
}

export function assembleRecap(i: {
  contract: Recap["contract"]; today: string; obligations: ObligationFact[]; reach: ReachRow[]; pastMatches: Array<{ id: string; opponent: string; match_date: string }>;
  variants: unknown; financial: Financial; signature: Recap["signature"];
}): Recap {
  const rec = reconcileCommitments(i.obligations, i.today);
  const out = measuredFromReach(i.reach, i.pastMatches);
  const modeled = modeledFromVariants(i.variants);
  const gaps: Gap[] = [...rec.gaps, ...out.gaps];
  if (i.signature && !i.signature.verified) gaps.push(gap("signature_unproven", i.contract.id, `The contract's signature is "${i.signature.label}", not proven`));
  if (!i.financial.recorded) gaps.push(gap("no_value_recorded", i.contract.id, "No cash or barter lines are recorded for this contract"));
  const blocking = gaps.filter((g) => g.blocking).length;
  return {
    contract: i.contract, generated_for: i.today,
    status: deriveRecapStatus({ commitments: rec.commitments, endDate: i.contract.end_date, blockingGaps: blocking, today: i.today }),
    commitments: rec.commitments, measured: out.measured, modeled, financial: i.financial, gaps, gap_count: gaps.length, blocking_gap_count: blocking, signature: i.signature,
    rules: [
      "Measured results come only from recorded reach that states its source. Estimates made before delivery are listed apart as modeled and are never results.",
      "Delivery counts as proven only with attached proof or a written statement; a bare 'delivered' mark is a gap.",
      "Every gap is listed. Nothing missing is skipped.",
    ],
  };
}

// ── issuing, and the checksum of what was issued ────────────────────────────

export function stableStringify(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(stableStringify).join(",")}]`;
  if (v && typeof v === "object") return `{${Object.keys(v as object).sort().map((k) => `${JSON.stringify(k)}:${stableStringify((v as Record<string, unknown>)[k])}`).join(",")}}`;
  return JSON.stringify(v);
}
export const recapChecksum = (content: unknown): string => crypto.createHash("sha256").update(stableStringify(content)).digest("hex");

/** What stops a recap being issued, or what the issuer has to acknowledge. */
export function issueProblems(recap: Recap, acknowledgement: string | null | undefined): string[] {
  const p: string[] = [];
  if (recap.status === "not_ready") p.push("the contract has no obligations, so there is nothing to recap");
  p.push(...separationProblems(recap.measured, recap.modeled));
  if (recap.gap_count > 0 && (!acknowledgement || acknowledgement.trim().length < 10)) {
    p.push(`this recap has ${recap.gap_count} gap${recap.gap_count === 1 ? "" : "s"} (${recap.blocking_gap_count} blocking); issuing it needs a written acknowledgement (10+ characters) that the sponsor is told about them`);
  }
  return p;
}

// ── the renewal case, from the recap and nothing else ───────────────────────

export type RenewalTier = "strong_case" | "supported_with_caveats" | "insufficient_evidence";

export interface RenewalRecommendation { tier: RenewalTier; reasons: string[]; may_claim: string[]; must_not_claim: string[]; proven: number; due: number }

/**
 * The deterministic reading of a recap that a renewal draft is built from. It says how strong the case is,
 * what may be said (only what is proven or measured) and what must not be.
 */
export function recommendRenewal(recap: Recap): RenewalRecommendation {
  const c = recap.commitments;
  const due = c.sold - c.waived;
  const proven = c.evidenced;
  const share = due > 0 ? proven / due : 0;
  const reasons: string[] = [];
  const mayClaim: string[] = [];
  const mustNot: string[] = [];

  if (c.sold === 0) reasons.push("no commitments are recorded for the contract");
  else reasons.push(`${proven} of ${due} commitments are delivered with proof (${Math.round(share * 100)}%)${c.waived > 0 ? `, ${c.waived} waived` : ""}`);
  if (recap.blocking_gap_count > 0) reasons.push(`${recap.blocking_gap_count} blocking gap${recap.blocking_gap_count === 1 ? "" : "s"} open`);
  if (recap.measured.length === 0) reasons.push("no measured outcome is recorded");

  if (proven > 0) mayClaim.push(`${proven} of ${due} contracted commitments were delivered and documented`);
  for (const f of recap.measured) mayClaim.push(`${f.label}: ${Number(f.value).toLocaleString("en-US")} ${f.unit ?? ""} (measured, source on file)`.trim());
  for (const l of c.lines.filter((x) => x.gaps.includes("missing_proof") || x.gaps.includes("not_delivered_overdue"))) mustNot.push(`that "${l.title}" was delivered (no proof on file)`);
  if (c.waived > 0) mustNot.push(`that every commitment was delivered or delivered "in full" (${c.waived} ${c.waived === 1 ? "was" : "were"} waived by agreement)`);
  for (const f of recap.modeled) mustNot.push(`the estimate "${String(f.value).slice(0, 80)}" as a result`);
  mustNot.push("any figure that is not listed as measured above");

  let tier: RenewalTier;
  if (proven === 0 || due === 0) tier = "insufficient_evidence";
  else if (share >= 0.9 && recap.blocking_gap_count === 0 && recap.measured.length > 0) tier = "strong_case";
  else if (share >= 0.5) tier = "supported_with_caveats";
  else tier = "insufficient_evidence";
  return { tier, reasons, may_claim: mayClaim, must_not_claim: mustNot, proven, due };
}

/** The text block given to the renewal drafting model. It carries facts and prohibitions, never enthusiasm. */
export function recapPromptBlock(recap: Recap, rec: RenewalRecommendation): string {
  const lines = [
    "RECONCILED DELIVERY RECAP (the only source for what was delivered and achieved; do not go beyond it):",
    `- Contract ${recap.contract.contract_number ?? recap.contract.id}, ${recap.contract.start_date ?? "?"} to ${recap.contract.end_date ?? "?"}.`,
    `- Commitments: ${rec.proven} of ${rec.due} delivered with documented proof; ${recap.commitments.open} still open; ${recap.commitments.waived} waived by agreement.`,
    ...recap.measured.map((f) => `- MEASURED: ${f.label} = ${Number(f.value).toLocaleString("en-US")} ${f.unit ?? ""} (source on file)`),
    ...(recap.measured.length === 0 ? ["- No measured outcome figures are available. Do not state any reach, audience or impact number."] : []),
    ...(recap.gaps.some((g) => g.blocking) ? ["- Known gaps (do not paper over them): " + recap.gaps.filter((g) => g.blocking).map((g) => g.message).slice(0, 6).join("; ")] : []),
    "You MAY say: " + (rec.may_claim.length > 0 ? rec.may_claim.join("; ") : "nothing about results; present the renewal as a conversation to review delivery together") + ".",
    "You MUST NOT say: " + rec.must_not_claim.join("; ") + ".",
    `Strength of the case: ${rec.tier.replace(/_/g, " ")}. Word the proposal to match it; do not oversell.`,
  ];
  return lines.join("\n");
}

