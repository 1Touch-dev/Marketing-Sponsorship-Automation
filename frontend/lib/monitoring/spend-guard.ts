/**
 * Spend guard — real-time cost tracking + a hard daily cap on paid AI calls.
 *
 * Hardening pass (master_report.md Section 8, Pattern 5 — "runaway
 * automation cost", citing a real $47,000/11-day LangChain retry-loop
 * incident). Request-rate limiting (lib/rate-limit.ts) already protects
 * against bursts, but a sustained, rate-limit-compliant loop could still run
 * indefinitely with zero dollar-cost ceiling and no visibility until the
 * monthly invoice. This is that ceiling.
 *
 * Two independent halves:
 *  - `checkDailySpendCap()` — call BEFORE an expensive operation. Refuses if
 *    today's recorded spend already meets/exceeds DAILY_SPEND_CAP_USD. This
 *    is the kill switch — it does not trust the caller's own logic.
 *  - `recordSpend()` — call AFTER a successful paid call, to log what it
 *    actually (or estimatedly) cost. Never throws — a logging failure must
 *    never block or crash the operation it's recording.
 *
 * Cost figures for image generation are published-list-price ESTIMATES
 * (OpenAI's Images API doesn't return exact per-call billing) — see
 * IMAGE_COST_ESTIMATES_USD below and keep it updated if pricing changes.
 * Bedrock costs are computed exactly from real input/output token counts.
 */

import { supabaseAdmin } from "@/lib/supabase/server";
import { logger } from "@/lib/monitoring/logger";

/** Default ceiling if DAILY_SPEND_CAP_USD isn't set — well above normal
 * observed usage (~$271/mo total per the Aug 2026 cost audit, i.e. ~$9/day
 * average) but a real, finite circuit breaker rather than no limit at all. */
const DEFAULT_DAILY_CAP_USD = 25;

/** Published OpenAI gpt-image-2 list-price estimates by quality tier, for a
 * standard single-image generation. Approximate — update if pricing changes. */
export const IMAGE_COST_ESTIMATES_USD: Record<string, number> = {
  low: 0.02,
  medium: 0.07,
  high: 0.19,
  standard: 0.07,
};

/** Bedrock Claude Sonnet pricing per the Aug 2026 cost audit — $3/1M input
 * tokens, $15/1M output tokens. */
const BEDROCK_INPUT_USD_PER_TOKEN = 3 / 1_000_000;
const BEDROCK_OUTPUT_USD_PER_TOKEN = 15 / 1_000_000;

export function bedrockCallCostUsd(inputTokens: number, outputTokens: number): number {
  return inputTokens * BEDROCK_INPUT_USD_PER_TOKEN + outputTokens * BEDROCK_OUTPUT_USD_PER_TOKEN;
}

function dailyCapUsd(): number {
  const raw = process.env.DAILY_SPEND_CAP_USD;
  const parsed = raw ? Number(raw) : NaN;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_DAILY_CAP_USD;
}

export type SpendCapCheck = {
  ok: boolean;
  todaySpendUsd: number;
  capUsd: number;
};

/**
 * Checks today's (UTC calendar day) recorded spend against the hard cap.
 * Fails OPEN (allows the call) if the check itself errors — a monitoring
 * outage must not silently take down the whole platform's paid features;
 * the failure is logged loudly so it's not a silent gap.
 */
export async function checkDailySpendCap(): Promise<SpendCapCheck> {
  const cap = dailyCapUsd();
  try {
    const sb = supabaseAdmin();
    const startOfDayUtc = new Date();
    startOfDayUtc.setUTCHours(0, 0, 0, 0);

    const { data, error } = await sb
      .from("spend_ledger" as "companies")
      .select("amount_usd")
      .gte("created_at", startOfDayUtc.toISOString());

    if (error) throw new Error(error.message);

    const todaySpendUsd = ((data ?? []) as Array<{ amount_usd: number }>).reduce(
      (sum, row) => sum + Number(row.amount_usd ?? 0),
      0
    );

    return { ok: todaySpendUsd < cap, todaySpendUsd, capUsd: cap };
  } catch (err) {
    logger.warn("Spend cap check failed — failing open (allowing the call)", { error: String(err) });
    return { ok: true, todaySpendUsd: -1, capUsd: cap };
  }
}

/**
 * Records a paid call's cost. Fire-and-forget by design — never throws, and
 * callers should not await-block their response on this if latency matters,
 * though awaiting it is fine for the routes wired up so far.
 */
export async function recordSpend(entry: {
  category: string;
  provider: string;
  amountUsd: number;
  entityType?: string;
  entityId?: string | null;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  try {
    const sb = supabaseAdmin();
    await sb.from("spend_ledger" as "companies").insert({
      category: entry.category,
      provider: entry.provider,
      amount_usd: entry.amountUsd,
      entity_type: entry.entityType ?? null,
      entity_id: entry.entityId ?? null,
      metadata: entry.metadata ?? {},
    } as unknown as Record<string, unknown>);
  } catch (err) {
    logger.warn("Failed to record spend ledger entry", { error: String(err), category: entry.category });
  }
}
