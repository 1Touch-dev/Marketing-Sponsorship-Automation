/**
 * The buyer brief and the discovery gate (Task 12).
 *
 * A proposal is not generated until a person has written down what the buyer
 * wants. A quick brief is the four discovery fields (objective, period, point of
 * contact, next action). A full brief adds why this sponsor, why this package and
 * cited evidence, with an explicit list of what is still unverified.
 */

export type BriefLevel = "quick" | "full";

export interface EvidenceItem {
  claim: string;
  source_name?: string;
  source_url?: string;
  retrieved_at?: string;
  confidence?: "high" | "medium" | "low";
}

export interface BriefInput {
  level: BriefLevel;
  objective: string;
  period_start: string; // YYYY-MM-DD
  period_end: string;
  contact_name: string;
  contact_email?: string | null;
  next_action: string;
  next_action_due?: string | null;
  why_sponsor?: string | null;
  why_package?: string | null;
  evidence?: EvidenceItem[];
  unverified?: string[];
  opportunity_id?: string | null;
  research_id?: string | null;
}

export interface BriefRow extends BriefInput {
  id: string;
  author_email: string;
  created_at: string;
  evidence: EvidenceItem[];
  unverified: string[];
}

/** A brief older than this no longer counts: the objective and next action go stale. */
export const BRIEF_MAX_AGE_DAYS = 90;

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const blank = (s: unknown) => typeof s !== "string" || s.trim() === "";

/** Returns an error message, or null when the brief is acceptable. */
export function validateBrief(b: BriefInput): string | null {
  if (b.level !== "quick" && b.level !== "full") return "level must be quick or full";
  if (blank(b.objective)) return "objective is required: what does the buyer want?";
  if (blank(b.contact_name)) return "point of contact is required";
  if (blank(b.next_action)) return "next action is required";
  for (const f of ["period_start", "period_end"] as const) {
    if (blank(b[f]) || !DATE_RE.test(b[f])) return `${f} must be a date (YYYY-MM-DD)`;
  }
  if (b.period_end < b.period_start) return "period_end cannot be before period_start";
  if (b.next_action_due && !DATE_RE.test(b.next_action_due)) return "next_action_due must be a date (YYYY-MM-DD)";
  if (b.contact_email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(b.contact_email)) return "contact_email is not a valid email";

  const evidence = b.evidence ?? [];
  for (const [i, e] of evidence.entries()) {
    if (blank(e.claim)) return `evidence ${i + 1}: claim is required`;
    if (blank(e.source_name) && blank(e.source_url)) return `evidence ${i + 1}: a source name or link is required`;
    if (!blank(e.source_url)) {
      try {
        const u = new URL(e.source_url as string);
        if (u.protocol !== "http:" && u.protocol !== "https:") return `evidence ${i + 1}: source_url must be http(s)`;
      } catch {
        return `evidence ${i + 1}: source_url is not a valid link`;
      }
    }
    if (e.confidence && !["high", "medium", "low"].includes(e.confidence)) return `evidence ${i + 1}: confidence must be high, medium or low`;
  }
  if (b.level === "full") {
    if (blank(b.why_sponsor)) return "a full brief needs why_sponsor: why this sponsor?";
    if (blank(b.why_package)) return "a full brief needs why_package: why this package?";
    if (evidence.length === 0) return "a full brief needs at least one cited piece of evidence";
  }
  return null;
}

export function cleanBrief(b: BriefInput) {
  const t = (s?: string | null) => (s && s.trim() !== "" ? s.trim() : null);
  return {
    level: b.level,
    objective: b.objective.trim(),
    period_start: b.period_start,
    period_end: b.period_end,
    contact_name: b.contact_name.trim(),
    contact_email: t(b.contact_email),
    next_action: b.next_action.trim(),
    next_action_due: t(b.next_action_due),
    why_sponsor: t(b.why_sponsor),
    why_package: t(b.why_package),
    evidence: (b.evidence ?? []).map((e) => ({
      claim: e.claim.trim(),
      ...(t(e.source_name) ? { source_name: t(e.source_name) as string } : {}),
      ...(t(e.source_url) ? { source_url: t(e.source_url) as string } : {}),
      ...(e.retrieved_at ? { retrieved_at: e.retrieved_at } : {}),
      ...(e.confidence ? { confidence: e.confidence } : {}),
    })),
    unverified: (b.unverified ?? []).map((u) => u.trim()).filter(Boolean),
    opportunity_id: b.opportunity_id ?? null,
    research_id: b.research_id ?? null,
  };
}

export interface GateResult {
  ok: boolean;
  level: BriefLevel | null;
  /** What is missing or wrong, in plain words. Empty when ok. */
  missing: string[];
  briefId: string | null;
}

export const DISCOVERY_FIELDS = ["objective", "period", "point of contact", "next action"] as const;

/** The gate: a complete, recent brief written by a person must exist. */
export function evaluateGate(brief: Pick<BriefRow, "id" | "level" | "created_at"> | null, now: Date = new Date()): GateResult {
  if (!brief) return { ok: false, level: null, missing: [...DISCOVERY_FIELDS], briefId: null };
  const ageDays = Math.floor((now.getTime() - new Date(brief.created_at).getTime()) / 86_400_000);
  if (ageDays > BRIEF_MAX_AGE_DAYS) {
    return { ok: false, level: brief.level, missing: [`the latest brief is ${ageDays} days old (more than ${BRIEF_MAX_AGE_DAYS}): write a fresh one`], briefId: brief.id };
  }
  return { ok: true, level: brief.level, missing: [], briefId: brief.id };
}

export function gateMessage(companyName: string, companyId: string, gate: GateResult): string {
  return `A buyer brief is needed before a proposal can be generated for ${companyName}: ${gate.missing.join(", ")}. Add a quick brief at /companies/${companyId}/brief.`;
}

/**
 * The block added to the proposal prompt. The brief shapes the pitch; it never
 * sets prices, and nothing unverified may appear as a stated fact.
 */
export function briefPromptBlock(b: BriefRow): string {
  const lines = [
    `BUYER BRIEF (${b.level} brief written by ${b.author_email} on ${b.created_at.slice(0, 10)}):`,
    `- Objective: ${b.objective}`,
    `- Period: ${b.period_start} to ${b.period_end}`,
    `- Point of contact: ${b.contact_name}${b.contact_email ? ` (${b.contact_email})` : ""}`,
    `- Next action: ${b.next_action}${b.next_action_due ? ` (by ${b.next_action_due})` : ""}`,
  ];
  if (b.why_sponsor) lines.push(`- Why this sponsor: ${b.why_sponsor}`);
  if (b.why_package) lines.push(`- Why this package: ${b.why_package}`);
  if (b.evidence.length > 0) {
    lines.push("- Cited evidence:");
    for (const e of b.evidence) {
      const src = [e.source_name, e.source_url].filter(Boolean).join(", ");
      lines.push(`  * ${e.claim} (source: ${src}; confidence: ${e.confidence ?? "unstated"})`);
    }
  }
  if (b.unverified.length > 0) {
    lines.push("- STILL UNVERIFIED (never state these as fact):");
    for (const u of b.unverified) lines.push(`  * ${u}`);
  }
  lines.push(
    "Use this brief to shape the pitch only. Prices come from the rate card and the selected inventory lines, never from this brief or from any research: do not invent, adjust or imply a price.",
  );
  if (b.evidence.length > 0) {
    lines.push("State a fact from the cited evidence as fact only when its confidence is high; otherwise word it as unconfirmed (for example 'reported' or 'to be confirmed'). Anything listed as unverified must not appear as a fact.");
  } else {
    lines.push("No cited research is on file for this sponsor: do not state specific facts about the sponsor beyond the objective above; keep every other statement general.");
  }
  return lines.join("\n");
}
