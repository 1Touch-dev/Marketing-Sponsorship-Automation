/**
 * Configurable Coritiba KPI sets for proposal landing pages (James: standardize per proposal type).
 */

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
};

const BASE_HERO = {
  founded: "1909",
  stadium: "Estádio Couto Pereira",
  city: "Curitiba",
  broadcasts: "Globo, SporTV, Paramount+",
};

export const KPI_TEMPLATES: Record<string, KpiTemplate> = {
  sponsorship_standard: {
    id: "sponsorship_standard",
    label: "Patrocínio padrão",
    description: "Reach, stadium, digital, members",
    heroStats: [
      { label: "Fundado em", value: BASE_HERO.founded, sub: `${BASE_HERO.stadium} · ${BASE_HERO.city}` },
      { label: "Sócios + Seguidores", value: "1,5M+", sub: "38.000+ sócios torcedores" },
      { label: "Transmissão", value: "3 torneios", sub: BASE_HERO.broadcasts },
      { label: "Couto Pereira", value: "40.502", sub: "torcedores por partida" },
    ],
    metrics: [
      { icon: "users", value: "25.000–36.000", label: "Média Público/Jogo" },
      { icon: "globe", value: "1,5M+", label: "Seguidores Digitais" },
      { icon: "mappin", value: "3,7M hab.", label: "Metro Curitiba" },
      { icon: "shield", value: "38.000+", label: "Sócios Torcedores" },
    ],
  },
  awareness: {
    id: "awareness",
    label: "Awareness / mídia",
    description: "TV, digital, broadcast emphasis",
    heroStats: [
      { label: "Transmissão", value: "Nacional", sub: BASE_HERO.broadcasts },
      { label: "Sócios + Seguidores", value: "1,5M+", sub: "Alcance digital Coxa" },
      { label: "Couto Pereira", value: "40.502", sub: "capacidade" },
      { label: "Fundado em", value: BASE_HERO.founded, sub: BASE_HERO.stadium },
    ],
    metrics: [
      { icon: "tv", value: "Globo + SporTV", label: "TV aberta e fechada" },
      { icon: "users", value: "25.000–36.000", label: "Público ao vivo/jogo" },
      { icon: "globe", value: "1,5M+", label: "Redes sociais" },
      { icon: "trophy", value: "Série A 2026", label: "Competição principal" },
    ],
  },
  regional: {
    id: "regional",
    label: "Regional Paraná",
    description: "Curitiba metro & IDH",
    heroStats: [
      { label: "Metro Curitiba", value: "3,7M hab.", sub: "8ª maior do Brasil" },
      { label: "IDH Curitiba", value: "0,823", sub: "Maior IDH do Sul" },
      { label: "Couto Pereira", value: "40.502", sub: BASE_HERO.stadium },
      { label: "Fundado em", value: BASE_HERO.founded, sub: "Coritiba FC" },
    ],
    metrics: [
      { icon: "mappin", value: "3,7M hab.", label: "Metro Curitiba" },
      { icon: "users", value: "25.000–36.000", label: "Público médio" },
      { icon: "shield", value: "38.000+", label: "Sócios" },
      { icon: "globe", value: "1,5M+", label: "Digital" },
    ],
  },
};

export function resolveKpiTemplate(templateId?: string | null): KpiTemplate {
  if (templateId && KPI_TEMPLATES[templateId]) return KPI_TEMPLATES[templateId];
  return KPI_TEMPLATES.sponsorship_standard;
}
