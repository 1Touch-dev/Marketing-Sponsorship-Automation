/**
 * Pure name guards for product-discovery auto-save.
 * Skip aggregate / group / cluster labels so they never become companies.
 */

const AGGREGATE_MARKERS = ["cluster", "rede de", "patrocinadores", "network of"] as const;

// s.a. / s.a end on a non-word char, so do not require a trailing \b after the dots.
const LEGAL_SUFFIX_RE = /(?:\b(?:ltda|eireli|me|sa)\b|\bs\.a\.?|\bs\/a\b)/;

const PLURAL_COLLECTIVE_RE = /\b(?:distribuidoras|empresas|fabricantes)\s+de\b/;

/** Filler + geography + plural industry tokens — not a brand on their own. */
const NON_BRAND_TOKENS = new Set([
  "de",
  "da",
  "do",
  "dos",
  "das",
  "e",
  "em",
  "no",
  "na",
  "nos",
  "nas",
  "a",
  "o",
  "as",
  "os",
  "distribuidoras",
  "empresas",
  "fabricantes",
  "bebidas",
  "alimentos",
  "produtos",
  "produto",
  "servicos",
  "comercio",
  "centro",
  "cidade",
  "regiao",
  "metropolitana",
  "estado",
  "brasil",
  "sul",
  "norte",
  "leste",
  "oeste",
  "grande",
  "local",
  "locais",
  "area",
  "zona",
  "bairro",
  "curitiba",
  "parana",
  "sao",
  "paulo",
  "rio",
  "janeiro",
  "minas",
  "gerais",
  "bahia",
  "recife",
  "fortaleza",
  "brasilia",
  "porto",
  "alegre",
  "belo",
  "horizonte",
  "salvador",
  "manaus",
  "belem",
  "goiania",
  "campinas",
  "santos",
  "florianopolis",
  "vitoria",
  "natal",
  "maceio",
  "joao",
  "pessoa",
  "cuiaba",
  "campo",
  "grande",
  "teresina",
]);

export function normalizeSellerName(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "");
}

function hasLegalSuffix(normalized: string): boolean {
  return LEGAL_SUFFIX_RE.test(normalized);
}

/**
 * After stripping plural-collective + non-brand tokens, anything left is a brand-like name.
 */
function hasBrandLikeProperName(normalized: string): boolean {
  const tokens = normalized
    .replace(/[()[\],.;:/\\|+]+/g, " ")
    .split(/\s+/)
    .filter(Boolean);
  return tokens.some((t) => t.length > 1 && !NON_BRAND_TOKENS.has(t));
}

export function isAggregateSellerName(name: string): boolean {
  const normalized = normalizeSellerName(name);
  if (!normalized) return true;

  if (AGGREGATE_MARKERS.some((m) => normalized.includes(m))) return true;

  // Plural industry collectives ("distribuidoras de…") only when no legal suffix and no brand.
  if (PLURAL_COLLECTIVE_RE.test(normalized)) {
    if (hasLegalSuffix(normalized)) return false;
    if (hasBrandLikeProperName(normalized)) return false;
    return true;
  }

  return false;
}

export function filterRealSellers<T extends { name: string }>(sellers: T[]): T[] {
  return sellers.filter((s) => {
    const name = typeof s.name === "string" ? s.name.trim() : "";
    if (!name) return false;
    return !isAggregateSellerName(name);
  });
}
