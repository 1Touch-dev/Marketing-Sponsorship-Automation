import { extractNumbers } from "./checks";
import type { EvidenceItem } from "../accounts/research";

/**
 * Is each cited claim really in the source it cites? The platform requires evidence to name a source; this is the check
 * that a source was actually read and says what the claim says, so an agent cannot dress an invented fact in a plausible
 * link. It works on text already fetched (fetching is the caller's job); a claim whose source was not retrieved is a gap,
 * and "high confidence" on a claim with no retrieved source is a gap of its own: a model must not hide how little it checked.
 */
export interface EvidenceGap { index: number; claim: string; problem: "no_source" | "source_not_retrieved" | "claim_not_in_source" | "confidence_without_source" }

const words = (t: string) => (t.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").match(/[a-z0-9]{5,}/g) ?? []);

export function evidenceGaps(evidence: EvidenceItem[], sources: Record<string, string | undefined>): EvidenceGap[] {
  const gaps: EvidenceGap[] = [];
  evidence.forEach((e, index) => {
    const claim = e.claim;
    if (!e.source_url && !e.source_name) { gaps.push({ index, claim, problem: "no_source" }); return; }
    const text = e.source_url ? sources[e.source_url] : undefined;
    if (!text) {
      gaps.push({ index, claim, problem: e.confidence === "high" ? "confidence_without_source" : "source_not_retrieved" });
      return;
    }
    const have = new Set(extractNumbers(text));
    const missingNumber = extractNumbers(claim).filter((n) => !have.has(n)).length > 0;
    const claimWords = [...new Set(words(claim))];
    const sourceWords = new Set(words(text));
    const share = claimWords.length ? claimWords.filter((w) => sourceWords.has(w)).length / claimWords.length : 1;
    if (missingNumber || share < 0.5) gaps.push({ index, claim, problem: "claim_not_in_source" });
  });
  return gaps;
}
