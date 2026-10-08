import { kpiClaimKeys } from "../proposals/kpi-templates";
import type { SponsorClaims, WithheldClaim } from "./sponsor-claims";

/**
 * Which claims the sponsor-facing documents can show, and what became of each
 * one (Task 8). Used by the deck page to lay out its tiles and by the approval
 * step to tell the approver which figures a sponsor will and will not see.
 */

export const DECK_AUDIENCE_STATS: Array<{ key: string; label: string }> = [
  { key: "club.avg_attendance", label: "PÚBLICO MÉDIO POR PARTIDA" },
  { key: "club.members", label: "SÓCIOS TORCEDORES" },
  { key: "club.coxa_id_fans", label: "TORCEDORES IDENTIFICADOS NO COXA iD" },
  { key: "club.social_reach_cumulative", label: "ALCANCE ACUMULADO NAS REDES OFICIAIS" },
  { key: "club.matchday_views", label: "VIEWS ACUMULADOS NO MATCHDAY" },
];

export const DECK_STADIUM_KEYS = ["club.stadium_capacity", "club.vip_boxes", "club.points_of_sale"];

/** Shown on the landing page outside the KPI cards. */
export const LANDING_EXTRA_KEYS = ["city.idh", "club.competitions_season", "club.broadcast_partners", "club.partner_brands"];

/** Every claim key the documents of a proposal can rely on. */
export function documentClaimKeys(kpiTemplateId?: string | null): string[] {
  return Array.from(
    new Set([...kpiClaimKeys(kpiTemplateId), ...DECK_AUDIENCE_STATS.map((a) => a.key), ...DECK_STADIUM_KEYS, ...LANDING_EXTRA_KEYS]),
  ).sort();
}

export interface DocumentClaimsReport {
  shown: Array<{ key: string; value: string; source: string; as_of: string; expires_at: string }>;
  /** Registered but not usable right now, with the reasons. */
  withheld: WithheldClaim[];
  /** Used by a document but not in the registry at all, so no figure is shown. */
  unregistered: string[];
}

export function documentClaimsReport(sponsor: SponsorClaims, keys: string[]): DocumentClaimsReport {
  const withheldByKey = new Map(sponsor.withheld.map((w) => [w.key, w]));
  const report: DocumentClaimsReport = { shown: [], withheld: [], unregistered: [] };
  for (const key of keys) {
    const c = sponsor.claims[key];
    const w = withheldByKey.get(key);
    if (c) report.shown.push({ key, value: c.value, source: c.source, as_of: c.asOf, expires_at: c.expiresAt });
    else if (w) report.withheld.push(w);
    else report.unregistered.push(key);
  }
  return report;
}
