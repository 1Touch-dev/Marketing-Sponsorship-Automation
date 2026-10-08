import type { WriteResult } from "../accounts/store";
import { isMissingMigration } from "../proposals/revision-store";

type Sb = any;

/**
 * What a bulk job may do before it starts: how many items a person can sensibly review, and the most it may cost.
 * Every accepted or refused batch is written down, and the database refuses to record an accepted batch outside
 * these limits, so a gate that was skipped or wrong cannot leave a record saying it passed.
 */
export const DEFAULT_LIMITS = { max_review_batch: 10, max_batch_cost_usd: 5 };

/** Estimated cost of one item, in US dollars, by kind of job. Deliberately on the high side: a ceiling is a safety margin. */
export const PER_ITEM_ESTIMATE_USD: Record<string, number> = {
  outreach_run: 0.25,
  campaign_generation: 0.15,
  proposal_generation: 0.15,
  image_generation: 0.2,
};

export interface Limits { max_review_batch: number; max_batch_cost_usd: number; isDefault: boolean; enforced: boolean }

export interface Decision {
  decision: "accepted" | "refused";
  reason: string | null;
  items: number;
  perItemUsd: number;
  estimatedUsd: number;
  maxItems: number;
  ceilingUsd: number;
}

/** The decision itself, free of any I/O. */
export function decideBatch(i: { items: number; perItemUsd: number; maxItems: number; ceilingUsd: number; todaySpendUsd?: number; dailyCapUsd?: number }): Decision {
  const estimatedUsd = Math.round(i.items * i.perItemUsd * 10_000) / 10_000;
  const base = { items: i.items, perItemUsd: i.perItemUsd, estimatedUsd, maxItems: i.maxItems, ceilingUsd: i.ceilingUsd };
  if (i.items < 1) return { ...base, decision: "refused", reason: "There is nothing in this batch." };
  if (i.items > i.maxItems) return { ...base, decision: "refused", reason: `Too many to review at once: ${i.items} items, and the limit is ${i.maxItems}. Send a smaller batch.` };
  if (estimatedUsd > i.ceilingUsd) return { ...base, decision: "refused", reason: `Estimated cost $${estimatedUsd.toFixed(2)} is above the batch ceiling of $${i.ceilingUsd.toFixed(2)}.` };
  if (i.dailyCapUsd !== undefined && i.todaySpendUsd !== undefined && i.todaySpendUsd + estimatedUsd > i.dailyCapUsd) {
    return { ...base, decision: "refused", reason: `Today's spend so far ($${i.todaySpendUsd.toFixed(2)}) plus this batch ($${estimatedUsd.toFixed(2)}) would pass the daily cap of $${i.dailyCapUsd.toFixed(2)}.` };
  }
  return { ...base, decision: "accepted", reason: null };
}

export async function loadLimits(sb: Sb, tenantId: string): Promise<WriteResult<Limits>> {
  const { data, error } = await sb.from("batch_limits").select("max_review_batch, max_batch_cost_usd").eq("tenant_id", tenantId).maybeSingle();
  if (error) {
    // before migration 0070 there are no limits to enforce: bulk jobs run as they always did
    if (isMissingMigration(error)) return { ok: true, value: { ...DEFAULT_LIMITS, isDefault: true, enforced: false } };
    return { ok: false, status: 500, error: error.message };
  }
  if (!data) return { ok: true, value: { ...DEFAULT_LIMITS, isDefault: true, enforced: true } };
  return { ok: true, value: { max_review_batch: Number(data.max_review_batch), max_batch_cost_usd: Number(data.max_batch_cost_usd), isDefault: false, enforced: true } };
}

export async function saveLimits(sb: Sb, tenantId: string, patch: { max_review_batch?: number; max_batch_cost_usd?: number }, actorEmail: string): Promise<WriteResult<Limits>> {
  if (!actorEmail) return { ok: false, status: 403, error: "A signed-in person is required." };
  const cur = await loadLimits(sb, tenantId);
  if (!cur.ok) return cur;
  const next = { max_review_batch: patch.max_review_batch ?? cur.value.max_review_batch, max_batch_cost_usd: patch.max_batch_cost_usd ?? cur.value.max_batch_cost_usd };
  if (!Number.isInteger(next.max_review_batch) || next.max_review_batch < 1 || next.max_review_batch > 200) return { ok: false, status: 400, error: "max_review_batch must be a whole number from 1 to 200." };
  if (!(next.max_batch_cost_usd > 0) || next.max_batch_cost_usd > 1000) return { ok: false, status: 400, error: "max_batch_cost_usd must be more than 0 and at most 1000." };
  const { error } = await sb.from("batch_limits").upsert({ tenant_id: tenantId, ...next, updated_by: actorEmail, updated_at: new Date().toISOString() }, { onConflict: "tenant_id" });
  if (error) return isMissingMigration(error) ? { ok: false, status: 503, error: "Batch limits are not set up yet (migration 0070)." } : { ok: false, status: 500, error: error.message };
  return { ok: true, value: { ...next, isDefault: false, enforced: true } };
}

export type GateResult = { ok: true; decisionId: string | null; decision: Decision } | { ok: false; status: number; error: string; decision?: Decision };

/**
 * Called before a bulk job does anything that costs money. Records the decision either way. A refusal stops the job
 * before a single paid call is made.
 */
export async function gateBatch(sb: Sb, tenantId: string, requestedBy: string, i: { kind: string; items: number; perItemUsd?: number; dailyCheck?: () => Promise<{ todaySpendUsd: number; capUsd: number }> }): Promise<GateResult> {
  const limits = await loadLimits(sb, tenantId);
  if (!limits.ok) return limits;
  const perItem = i.perItemUsd ?? PER_ITEM_ESTIMATE_USD[i.kind] ?? 0.25;
  let daily: { todaySpendUsd: number; capUsd: number } | null = null;
  try { daily = i.dailyCheck ? await i.dailyCheck() : null; } catch { daily = null; }
  const d = decideBatch({ items: i.items, perItemUsd: perItem, maxItems: limits.value.max_review_batch, ceilingUsd: limits.value.max_batch_cost_usd, todaySpendUsd: daily?.todaySpendUsd, dailyCapUsd: daily?.capUsd });
  if (!limits.value.enforced) return { ok: true, decisionId: null, decision: d };

  const { data, error } = await sb.from("batch_decisions").insert({
    tenant_id: tenantId, kind: i.kind, requested_by: requestedBy, items: Math.max(1, i.items), per_item_estimate_usd: d.perItemUsd, estimated_cost_usd: d.estimatedUsd,
    max_items: d.maxItems, ceiling_usd: d.ceilingUsd, decision: d.decision, reason: d.reason,
  }).select("id").single();
  if (error && !isMissingMigration(error)) return { ok: false, status: 500, error: `The batch could not be recorded, so it was not started: ${error.message}` };
  if (d.decision === "refused") return { ok: false, status: 409, error: d.reason!, decision: d };
  return { ok: true, decisionId: data?.id ?? null, decision: d };
}
