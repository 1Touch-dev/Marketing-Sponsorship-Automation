export type InventoryLike = {
  id?: string | null;
  name?: string | null;
  availability?: string | null;
  total_quantity?: number | null;
  quantity_sold?: number | null;
  quantity_reserved?: number | null;
  unit?: string | null;
  unit_type?: string | null;
  price_min?: number | string | null;
  price_max?: number | string | null;
  price_small?: number | string | null;
  price_medium?: number | string | null;
  price_large?: number | string | null;
  price_enterprise?: number | string | null;
};

export type AvailabilityState = "available" | "limited" | "sold_out";

export type EffectiveAvailability = {
  state: AvailabilityState;
  total: number;
  remaining: number;
  reason: string;
};

export function effectiveAvailability(item: InventoryLike): EffectiveAvailability {
  const total = Math.max(0, Number(item.total_quantity ?? 1));
  const committed = Number(item.quantity_sold ?? 0) + Number(item.quantity_reserved ?? 0);
  const remaining = Math.max(0, total - committed);

  if (item.availability === "sold") {
    return { state: "sold_out", total, remaining: 0, reason: "Marked sold in the catalog" };
  }
  if (remaining <= 0) {
    return { state: "sold_out", total, remaining: 0, reason: "No units remaining" };
  }
  if (item.availability === "limited") {
    return { state: "limited", total, remaining, reason: "Marked limited in the catalog" };
  }
  return { state: "available", total, remaining, reason: "Available" };
}

export type CanonicalUnit =
  | "per_season"
  | "per_month"
  | "per_game"
  | "per_post"
  | "per_video"
  | "per_reel"
  | "per_story"
  | "per_campaign"
  | "per_send";

const UNIT_LABELS: Record<CanonicalUnit, string> = {
  per_season: "per season",
  per_month: "per month",
  per_game: "per match",
  per_post: "per post",
  per_video: "per video",
  per_reel: "per reel",
  per_story: "per story",
  per_campaign: "per campaign",
  per_send: "per send",
};

export function unitLabel(unit: string | null | undefined): string {
  return (unit && (UNIT_LABELS as Record<string, string>)[unit]) || (unit ?? "").replace(/_/g, " ");
}

const UNIT_PATTERNS: Array<[RegExp, CanonicalUnit]> = [
  [/\b(ano|year|season|temporada|anual)\b/i, "per_season"],
  [/\b(m[eê]s|month|mensal)\b/i, "per_month"],
  [/\b(jogo|match|game|partida)\b/i, "per_game"],
  [/\b(v[ií]deo)\b/i, "per_video"],
  [/\b(reel)s?\b/i, "per_reel"],
  [/\b(stor(y|ies)|stories)\b/i, "per_story"],
  [/\b(post)s?\b/i, "per_post"],
  [/\b(campaign|campanha)\b/i, "per_campaign"],
  [/\b(send|envio|disparo)\b/i, "per_send"],
];

export type ResolvedUnit = {
  unit: CanonicalUnit;
  label: string;
  /** true when no explicit unit text exists and we only have the schema default */
  assumed: boolean;
};

export function resolveUnit(item: InventoryLike): ResolvedUnit {
  const text = (item.unit ?? "").trim();
  if (text) {
    for (const [re, unit] of UNIT_PATTERNS) {
      if (re.test(text)) return { unit, label: UNIT_LABELS[unit], assumed: false };
    }
  }
  const t = (item.unit_type ?? "per_season") as CanonicalUnit;
  const unit: CanonicalUnit = t in UNIT_LABELS ? t : "per_season";
  return { unit, label: UNIT_LABELS[unit], assumed: !text };
}

export type CompanySize = "small" | "medium" | "large" | "enterprise" | string | null | undefined;

export type ResolvedRate = {
  amount: number | null;
  basis: "tier" | "catalog_min" | "none";
  unit: ResolvedUnit;
  range: { min: number | null; max: number | null };
  /** the tier price lies outside the catalog min-max range, so the two prices disagree */
  outsideCatalogRange: boolean;
};

function num(v: number | string | null | undefined): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

export function resolveRate(item: InventoryLike, size: CompanySize): ResolvedRate {
  const small = num(item.price_small);
  const medium = num(item.price_medium);
  const large = num(item.price_large);
  const enterprise = num(item.price_enterprise);
  const min = num(item.price_min);
  const max = num(item.price_max);

  let amount: number | null = null;
  let basis: ResolvedRate["basis"] = "none";
  if (size === "small" && small) { amount = small; basis = "tier"; }
  else if (size === "large" && large) { amount = large; basis = "tier"; }
  else if (size === "enterprise" && enterprise) { amount = enterprise; basis = "tier"; }
  else if (medium) { amount = medium; basis = "tier"; }
  else if (min !== null) { amount = min; basis = "catalog_min"; }

  const outsideCatalogRange =
    basis === "tier" &&
    amount !== null &&
    ((min !== null && amount < min) || (max !== null && amount > max));

  return { amount, basis, unit: resolveUnit(item), range: { min, max }, outsideCatalogRange };
}

export type LineConflict = {
  inventory_id: string;
  name: string;
  reason: string;
};

/** Lines that cannot be sold right now. Quantity-over-capacity is enforced separately (Task 2). */
export function soldOutLines(
  lines: Array<{ inventory_id: string; name?: string }>,
  rowsById: Map<string, InventoryLike>,
): LineConflict[] {
  const conflicts: LineConflict[] = [];
  for (const line of lines) {
    const row = rowsById.get(line.inventory_id);
    if (!row) {
      conflicts.push({ inventory_id: line.inventory_id, name: line.name ?? line.inventory_id, reason: "Inventory item not found" });
      continue;
    }
    const eff = effectiveAvailability(row);
    if (eff.state === "sold_out") {
      conflicts.push({ inventory_id: line.inventory_id, name: row.name ?? line.name ?? line.inventory_id, reason: eff.reason });
    }
  }
  return conflicts;
}
