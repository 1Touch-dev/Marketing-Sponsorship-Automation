import { loadRegistry, type RegistryEntry } from "./store";
import type { ClaimState } from "./status";

type Sb = any;

/** A claim that may appear in a sponsor-facing document. Plain data, safe to pass to client components. */
export interface SponsorClaim {
  key: string;
  label: string;
  value: string;
  source: string;
  sourceUrl: string | null;
  /** The date the figure was true from (YYYY-MM-DD). */
  asOf: string;
  expiresAt: string;
  isEstimate: boolean;
  state: ClaimState;
}

export type SponsorClaimMap = Record<string, SponsorClaim>;

export interface WithheldClaim {
  key: string;
  label: string;
  state: ClaimState;
  reasons: string[];
}

export interface SponsorClaims {
  claims: SponsorClaimMap;
  /** Claims that exist but are not usable right now, with the reasons. */
  withheld: WithheldClaim[];
  /** False when the registry could not be read; nothing is shown in that case. */
  available: boolean;
}

export function toSponsorClaims(entries: RegistryEntry[]): SponsorClaims {
  const claims: SponsorClaimMap = {};
  const withheld: WithheldClaim[] = [];
  for (const e of entries) {
    if (e.evaluation.usable) {
      claims[e.key] = {
        key: e.key,
        label: e.label,
        value: e.current.value,
        source: e.current.source_ref as string,
        sourceUrl: e.current.source_url,
        asOf: e.current.effective_date as string,
        expiresAt: e.current.expires_at as string,
        isEstimate: e.evaluation.isEstimate,
        state: e.evaluation.state,
      };
    } else {
      withheld.push({ key: e.key, label: e.label, state: e.evaluation.state, reasons: e.evaluation.reasons });
    }
  }
  return { claims, withheld, available: true };
}

/**
 * Loads what a sponsor-facing page may show for a tenant. If the registry
 * cannot be read, nothing is shown: an unreadable registry never counts as
 * permission to show unverified figures.
 */
export async function loadSponsorClaims(sb: Sb, tenantId: string, now: Date = new Date()): Promise<SponsorClaims> {
  const res = await loadRegistry(sb, tenantId, now);
  if (!res.ok) return { claims: {}, withheld: [], available: false };
  return toSponsorClaims(res.entries);
}

/** The text a figure is shown as. An estimate is always labelled as one. */
export function displayValue(c: SponsorClaim): string {
  return c.isEstimate ? `${c.value} (estimativa)` : c.value;
}

/** "Fontes: A (dados de 2026-01-31) · B ..." for a footnote. Empty when nothing is shown. */
export function sourcesFootnote(claims: SponsorClaim[]): string {
  const seen = new Map<string, string>();
  for (const c of claims) {
    if (!seen.has(c.source)) seen.set(c.source, c.asOf);
  }
  if (seen.size === 0) return "";
  return "Fontes: " + Array.from(seen, ([source, asOf]) => `${source} (dados de ${asOf})`).join(" · ");
}

/**
 * The block added to an AI prompt: the only club figures the model may state.
 * Without any usable claim it says so, so the model stays qualitative instead
 * of reaching for a number.
 */
export function verifiedClaimsPromptBlock(claims: SponsorClaim[]): string {
  if (claims.length === 0) {
    return [
      "VERIFIED CLUB FIGURES: none are currently available.",
      "Do NOT state any follower count, attendance, audience, reach, member count, population or similar number about the club. Describe its audience and reach in qualitative terms only.",
    ].join("\n");
  }
  const lines = claims.map(
    (c) => `- ${c.label}: ${displayValue(c)} (source: ${c.source}; as of ${c.asOf})`,
  );
  return [
    "VERIFIED CLUB FIGURES (the ONLY club numbers you may state; copy them exactly, do not round, combine or extend them):",
    ...lines,
    "Any other number about the club's audience, reach, attendance, members or market is unverified. Do not state it; describe it qualitatively instead.",
  ].join("\n");
}

/** Loads a tenant's usable claims and renders the AI prompt block for them. */
export async function loadVerifiedClaimsBlock(sb: Sb, tenantId: string, now: Date = new Date()): Promise<string> {
  const { claims } = await loadSponsorClaims(sb, tenantId, now);
  return verifiedClaimsPromptBlock(Object.values(claims));
}
