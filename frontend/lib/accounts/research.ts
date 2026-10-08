/**
 * What counts as a research record (Task 10). Research is a summary, a
 * recommendation and cited evidence, plus an explicit list of what is still
 * unverified. It is never a revenue opportunity: only a person qualifying the
 * account does that.
 */

export const RECOMMENDATIONS = ["pursue", "park", "not_a_fit", "needs_more_research"] as const;
export type Recommendation = (typeof RECOMMENDATIONS)[number];

export interface EvidenceItem {
  claim: string;
  source_name?: string;
  source_url?: string;
  retrieved_at?: string;
  confidence?: "high" | "medium" | "low";
}

export interface ResearchInput {
  summary: string;
  recommendation: Recommendation;
  evidence: EvidenceItem[];
  unverified?: string[];
}

const blank = (s: unknown) => typeof s !== "string" || s.trim() === "";

/** Returns an error message, or null when the research is acceptable. */
export function validateResearch(input: ResearchInput): string | null {
  if (blank(input.summary)) return "summary is required";
  if (!RECOMMENDATIONS.includes(input.recommendation)) return `recommendation must be one of ${RECOMMENDATIONS.join(", ")}`;
  if (!Array.isArray(input.evidence) || input.evidence.length === 0) return "at least one cited piece of evidence is required";

  for (const [i, e] of input.evidence.entries()) {
    const n = i + 1;
    if (blank(e?.claim)) return `evidence ${n}: claim is required`;
    if (blank(e.source_name) && blank(e.source_url)) return `evidence ${n}: a source name or link is required`;
    if (!blank(e.source_url)) {
      try {
        const u = new URL(e.source_url as string);
        if (u.protocol !== "http:" && u.protocol !== "https:") return `evidence ${n}: source_url must be http(s)`;
      } catch {
        return `evidence ${n}: source_url is not a valid link`;
      }
    }
    if (e.retrieved_at && Number.isNaN(Date.parse(e.retrieved_at))) return `evidence ${n}: retrieved_at is not a date`;
    if (e.confidence && !["high", "medium", "low"].includes(e.confidence)) return `evidence ${n}: confidence must be high, medium or low`;
  }
  if (input.unverified && !input.unverified.every((u) => typeof u === "string")) return "unverified must be a list of text";
  return null;
}

export function cleanResearch(input: ResearchInput) {
  return {
    summary: input.summary.trim(),
    recommendation: input.recommendation,
    evidence: input.evidence.map((e) => ({
      claim: e.claim.trim(),
      ...(e.source_name?.trim() ? { source_name: e.source_name.trim() } : {}),
      ...(e.source_url?.trim() ? { source_url: e.source_url.trim() } : {}),
      ...(e.retrieved_at ? { retrieved_at: e.retrieved_at } : {}),
      ...(e.confidence ? { confidence: e.confidence } : {}),
    })),
    unverified: (input.unverified ?? []).map((u) => u.trim()).filter(Boolean),
  };
}
