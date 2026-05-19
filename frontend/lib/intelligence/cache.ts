/**
 * Intelligence Cache
 * Prevents duplicate Apify runs, reduces costs.
 * Uses companies.full_intelligence as the backing store.
 * TTL: 7 days default.
 */

import { supabaseAdmin } from "@/lib/supabase/server";
import { logger } from "@/lib/monitoring/logger";

export const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

export type CacheEntry<T> = {
  data: T;
  cached_at: string;
  ttl_ms: number;
  cache_key: string;
};

/**
 * Read from cache (stored in companies.full_intelligence[cacheKey])
 */
export async function readIntelCache<T>(
  companyId: string,
  cacheKey: string,
  ttlMs = CACHE_TTL_MS
): Promise<T | null> {
  const sb = supabaseAdmin();
  const { data } = await sb.from("companies")
    .select("full_intelligence")
    .eq("id", companyId)
    .maybeSingle();

  const intel = data?.full_intelligence as Record<string, unknown> | null;
  if (!intel) return null;

  const entry = intel[cacheKey] as CacheEntry<T> | undefined;
  if (!entry?.data || !entry.cached_at) return null;

  const age = Date.now() - new Date(entry.cached_at).getTime();
  if (age > ttlMs) {
    logger.info("Cache expired", { company_id: companyId, cache_key: cacheKey, age_ms: age });
    return null;
  }

  logger.info("Cache hit", { company_id: companyId, cache_key: cacheKey, age_ms: age });
  return entry.data;
}

/**
 * Write to cache (merges into companies.full_intelligence[cacheKey])
 */
export async function writeIntelCache<T>(
  companyId: string,
  cacheKey: string,
  data: T,
  ttlMs = CACHE_TTL_MS
): Promise<void> {
  const sb = supabaseAdmin();
  const { data: existing } = await sb.from("companies")
    .select("full_intelligence")
    .eq("id", companyId)
    .maybeSingle();

  const currentIntel = (existing?.full_intelligence ?? {}) as Record<string, unknown>;

  const entry: CacheEntry<T> = {
    data,
    cached_at: new Date().toISOString(),
    ttl_ms: ttlMs,
    cache_key: cacheKey,
  };

  await sb.from("companies").update({
    full_intelligence: { ...currentIntel, [cacheKey]: entry },
    intelligence: { ...currentIntel, [cacheKey]: entry },
  }).eq("id", companyId);
}

/**
 * Invalidate a specific cache key
 */
export async function invalidateIntelCache(companyId: string, cacheKey: string): Promise<void> {
  const sb = supabaseAdmin();
  const { data: existing } = await sb.from("companies")
    .select("full_intelligence")
    .eq("id", companyId)
    .maybeSingle();

  const intel = (existing?.full_intelligence ?? {}) as Record<string, unknown>;
  delete intel[cacheKey];

  await sb.from("companies").update({ full_intelligence: intel }).eq("id", companyId);
}
