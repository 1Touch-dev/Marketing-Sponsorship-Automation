/**
 * Configurable KPI sets for proposal landing pages (James: standardize per proposal type).
 *
 * Task 8 — these templates no longer carry figures. Each stat names a claim
 * in the claims registry (lib/claims) and takes its value, source and date
 * from there. A stat whose claim is not usable (unverified, unsourced,
 * expired, disputed...) is left out rather than shown, so a stale or
 * unsupported figure cannot reach a sponsor through a template.
 */

import { displayValue, sourcesFootnote, type SponsorClaim, type SponsorClaimMap } from "../claims/sponsor-claims";

export type KpiMetric = {
  icon: "users" | "globe" | "mappin" | "shield" | "tv" | "trophy";
  value: string;
  label: string;
};

export type KpiTemplate = {
  id: string;
  label: string;
  description: string;
  heroStats: Array<{ label: string; value: string; sub: string }>;
  metrics: KpiMetric[];
  /** "Fontes: ..." line for the figures actually shown; empty when there are none. */
  sourcesNote: string;
};

export type KpiTenantFacts = {
  /** Unused since Task 8: templates apply to any tenant that has registered the claims. */
  isCoritiba?: boolean;
  clubName: string;
  founded_year?: number;
  stadium_name?: string;
};

type HeroSkeleton = { label: string; claim: string; sub: string };
type MetricSkeleton = { icon: KpiMetric["icon"]; claim: string; label: string };
type Skeleton = { id: string; label: string; description: string; hero: HeroSkeleton[]; metrics: MetricSkeleton[] };

/** `{stadium}` / `{clubName}` in a sub-line are replaced with the tenant's own names. */
export const KPI_TEMPLATES: Record<string, Skeleton> = {
  sponsorship_standard: {
    id: "sponsorship_standard",
    label: "Patrocínio padrão",
    description: "Reach, stadium, digital, members",
    hero: [
      { label: "Fundado em", claim: "club.founded_year", sub: "{stadium}" },
      { label: "Seguidores", claim: "club.social_followers_total", sub: "Redes oficiais" },
      { label: "Transmissão", claim: "club.broadcast_partners", sub: "Parceiros de transmissão" },
      { label: "Estádio", claim: "club.stadium_capacity", sub: "capacidade · {stadium}" },
    ],
    metrics: [
      { icon: "users", claim: "club.avg_attendance", label: "Média Público/Jogo" },
      { icon: "globe", claim: "club.social_followers_total", label: "Seguidores Digitais" },
      { icon: "mappin", claim: "city.metro_population", label: "Região Metropolitana" },
      { icon: "shield", claim: "club.members", label: "Sócios Torcedores" },
    ],
  },
  awareness: {
    id: "awareness",
    label: "Awareness / mídia",
    description: "TV, digital, broadcast emphasis",
    hero: [
      { label: "Transmissão", claim: "club.broadcast_partners", sub: "Parceiros de transmissão" },
      { label: "Seguidores", claim: "club.social_followers_total", sub: "Alcance digital" },
      { label: "Estádio", claim: "club.stadium_capacity", sub: "capacidade" },
      { label: "Fundado em", claim: "club.founded_year", sub: "{stadium}" },
    ],
    metrics: [
      { icon: "tv", claim: "club.broadcast_partners", label: "TV aberta e fechada" },
      { icon: "users", claim: "club.avg_attendance", label: "Público ao vivo/jogo" },
      { icon: "globe", claim: "club.social_followers_total", label: "Redes sociais" },
      { icon: "trophy", claim: "club.competitions_season", label: "Competições" },
    ],
  },
  regional: {
    id: "regional",
    label: "Regional Paraná",
    description: "Curitiba metro & IDH",
    hero: [
      { label: "Região metropolitana", claim: "city.metro_population", sub: "População" },
      { label: "IDH", claim: "city.idh", sub: "Índice de Desenvolvimento Humano" },
      { label: "Estádio", claim: "club.stadium_capacity", sub: "{stadium}" },
      { label: "Fundado em", claim: "club.founded_year", sub: "{clubName}" },
    ],
    metrics: [
      { icon: "mappin", claim: "city.metro_population", label: "Região Metropolitana" },
      { icon: "users", claim: "club.avg_attendance", label: "Público médio" },
      { icon: "shield", claim: "club.members", label: "Sócios" },
      { icon: "globe", claim: "club.social_followers_total", label: "Digital" },
    ],
  },
};

/** Minimal template for a tenant with no usable claim: identity facts only (founding
 *  year, stadium), never an audience figure. Used so the page is never blank. */
function buildGenericTemplate(tenant: KpiTenantFacts): KpiTemplate {
  const heroStats: Array<{ label: string; value: string; sub: string }> = [];
  if (tenant.founded_year) {
    heroStats.push({ label: "Fundado em", value: String(tenant.founded_year), sub: tenant.stadium_name ?? tenant.clubName });
  }
  return {
    id: "generic",
    label: "Padrão",
    description: "Identity facts only; no verified figures available",
    heroStats,
    metrics: [],
    sourcesNote: "",
  };
}

export function resolveKpiTemplate(
  templateId: string | null | undefined,
  tenant: KpiTenantFacts,
  claims: SponsorClaimMap = {},
): KpiTemplate {
  const skeleton = (templateId && KPI_TEMPLATES[templateId]) || KPI_TEMPLATES.sponsorship_standard;
  const subFor = (sub: string) =>
    sub.replace("{stadium}", tenant.stadium_name ?? tenant.clubName).replace("{clubName}", tenant.clubName);

  const used = new Map<string, SponsorClaim>();
  const heroStats = skeleton.hero.flatMap((h) => {
    const c = claims[h.claim];
    if (!c) return [];
    used.set(c.key, c);
    return [{ label: h.label, value: displayValue(c), sub: subFor(h.sub) }];
  });
  const metrics = skeleton.metrics.flatMap((m): KpiMetric[] => {
    const c = claims[m.claim];
    if (!c) return [];
    used.set(c.key, c);
    return [{ icon: m.icon, value: displayValue(c), label: m.label }];
  });

  if (heroStats.length === 0 && metrics.length === 0) return buildGenericTemplate(tenant);

  return {
    id: skeleton.id,
    label: skeleton.label,
    description: skeleton.description,
    heroStats,
    metrics,
    sourcesNote: sourcesFootnote(Array.from(used.values())),
  };
}

/** Every claim key a KPI template can show; tells an approver which figures a document relies on. */
export function kpiClaimKeys(templateId?: string | null): string[] {
  const skeleton = (templateId && KPI_TEMPLATES[templateId]) || KPI_TEMPLATES.sponsorship_standard;
  return Array.from(new Set([...skeleton.hero.map((h) => h.claim), ...skeleton.metrics.map((m) => m.claim)]));
}
