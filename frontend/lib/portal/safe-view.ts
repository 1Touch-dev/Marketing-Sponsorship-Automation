/**
 * What a sponsor may see. Every projection here is an ALLOW-list: a field reaches a sponsor only because it is named
 * below, never because it was not filtered out. That matters because the AI-output schemas keep unknown keys
 * (`.passthrough()`), so anything an agent or an old feature stored next to the proposal text, including the club's
 * internal cost estimates (`execution_brief`), would otherwise travel with it to the sponsor's browser.
 *
 * Used by the sponsor portal and by the public proposal page, the two places a sponsor can read.
 */

type Rec = Record<string, unknown>;
const rec = (v: unknown): Rec => (v && typeof v === "object" && !Array.isArray(v) ? (v as Rec) : {});
const pick = (o: Rec, keys: readonly string[]): Rec => Object.fromEntries(keys.filter((k) => o[k] !== undefined).map((k) => [k, o[k]]));
const list = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);

/** Statuses a sponsor may see. A draft or a proposal still under the club's review is not theirs to see yet. */
export const SPONSOR_VISIBLE_PROPOSAL_STATUSES = ["approved", "sent", "active_contract"] as const;
/** Contracts a sponsor sees: signed ones. */
export const SPONSOR_VISIBLE_CONTRACT_STATUSES = ["active", "completed", "expired"] as const;

const CONTENT_TEXT_KEYS = ["title", "executive_summary", "campaign_rationale", "sponsorship_value", "activation_plan", "deliverables", "investment_note", "cta", "video_intro_url", "video_intro_caption", "campaign_video_url", "kpi_template_id"] as const;

export function sponsorContent(content: unknown): Rec {
  const c = rec(content);
  const out = pick(c, CONTENT_TEXT_KEYS);
  if (Array.isArray(c.document_bundle)) out.document_bundle = c.document_bundle.map((d) => pick(rec(d), ["url", "name", "size", "path"]));
  if (Array.isArray(c.fulfillment_tasks)) out.fulfillment_tasks = c.fulfillment_tasks.map((t) => pick(rec(t), ["id", "title", "status", "completed_at"]));
  return out;
}

export const sponsorPricingTiers = (tiers: unknown): Rec[] => list(tiers).map((t) => pick(rec(t), ["tier", "label", "price_range", "activations", "deliverables", "visibility", "digital_exposure", "stadium_exposure", "highlight"]));
export const sponsorVariants = (v: unknown): Rec[] => list(v).map((x) => pick(rec(x), ["id", "label", "tagline", "description", "key_activations", "audience_fit", "estimated_reach", "differentiator"]));
export const sponsorPackages = (p: unknown): Rec[] => list(p).map((x) => pick(rec(x), ["id", "name", "description", "price_brl", "benefits", "inventory_items", "sort_order"]));
/** The AI's read of the sponsor's own brand, shown back to them: its named parts only. */
export const sponsorIntelligence = (i: unknown): Rec | null => (i && typeof i === "object" ? pick(rec(i), ["marketing_goals", "brand_positioning", "audience_alignment", "loyalty_strategy", "sponsorship_fit_score", "sponsorship_fit_rationale", "recommended_direction", "local_context", "global_inspiration"]) : null);

export function sponsorProposal(row: Rec): Rec {
  return {
    ...pick(row, ["id", "title", "status", "version", "created_at", "approved_at", "share_token", "expires_at"]),
    content: sponsorContent(row.content),
    pricing_tiers: sponsorPricingTiers(row.pricing_tiers),
    strategy_variants: sponsorVariants(row.strategy_variants),
  };
}

export const sponsorContract = (row: Rec): Rec => pick(row, ["id", "contract_number", "title", "status", "deal_type", "start_date", "end_date", "total_value_brl", "currency", "signature_status"]);

/** Delivery progress without who inside the club owns it, how it is tracked, or anything about cost. */
export function sponsorObligation(row: Rec): Rec {
  const proven = row.status === "accepted";
  return {
    ...pick(row, ["id", "contract_id", "title", "description", "quantity", "unit", "due_date", "status", "timing"]),
    // proof is shown once the club's own second person has accepted it
    proof: proven ? (row.proof ?? "attached") : "pending",
  };
}

/** An issued recap as the sponsor reads it: what was promised, delivered and measured, never the club's finances or its internal gap notes. */
export function sponsorRecap(issued: Rec, content?: unknown): Rec {
  const c = rec(content);
  const out: Rec = {
    ...pick(issued, ["id", "contract_id", "version", "issued_at", "period_start", "period_end", "status"]),
    open_items: typeof issued.gap_count === "number" ? issued.gap_count : 0,
  };
  if (content !== undefined) {
    out.contract = pick(rec(c.contract), ["contract_number", "title", "start_date", "end_date"]);
    out.commitments = c.commitments ?? null;
    out.measured = list(c.measured).map((f) => pick(rec(f), ["label", "value", "unit", "source", "period"]));
  }
  return out;
}

/** Field names that mean the club's own money or people; nothing a sponsor receives may carry one. */
export const INTERNAL_FIELD_PATTERN = /(^|_)(cost|margin|markup|savings|floor|owner|created_by|approved_by|internal|execution_brief|production|spend|tenant|financial)(_|$)/i;

/** Every internal-looking key found anywhere inside a value, for tests and for a last check before sending. */
export function internalKeys(value: unknown, path = ""): string[] {
  if (Array.isArray(value)) return value.flatMap((v, i) => internalKeys(v, `${path}[${i}]`));
  if (value && typeof value === "object") {
    return Object.entries(value as Rec).flatMap(([k, v]) => [...(INTERNAL_FIELD_PATTERN.test(k) ? [`${path}.${k}`] : []), ...internalKeys(v, `${path}.${k}`)]);
  }
  return [];
}
