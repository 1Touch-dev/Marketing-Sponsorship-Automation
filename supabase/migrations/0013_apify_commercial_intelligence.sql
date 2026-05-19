-- =============================================================================
-- 0013 — Apify Commercial Intelligence Infrastructure
-- =============================================================================
-- Adds:
--   companies.full_intelligence  → already exists from 0009, add IF NOT EXISTS
--   crm_sync_queue → extended job types for Apify jobs
--   apify_search_cache → Supabase-backed search cache (7-day TTL)
-- =============================================================================

-- ── companies: ensure all intelligence columns exist (idempotent) ─────────────
ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS segment        TEXT DEFAULT 'local',
  ADD COLUMN IF NOT EXISTS company_size   TEXT DEFAULT 'medium',
  ADD COLUMN IF NOT EXISTS business_type  TEXT DEFAULT 'B2C',
  ADD COLUMN IF NOT EXISTS full_intelligence JSONB DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS last_discovery_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS discovery_method  TEXT;

-- ── crm_sync_queue: extend status set for Apify job types ─────────────────────
-- (operation column already TEXT, so no migration needed for new job types)

-- ── apify_search_cache: cache Google/Apify search results for 7 days ──────────
CREATE TABLE IF NOT EXISTS public.apify_search_cache (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cache_key     TEXT NOT NULL UNIQUE,   -- hash of query+options
  query         TEXT NOT NULL,
  actor_id      TEXT NOT NULL,
  results       JSONB NOT NULL DEFAULT '[]',
  item_count    INT DEFAULT 0,
  ttl_ms        BIGINT DEFAULT 604800000,  -- 7 days in ms
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at    TIMESTAMPTZ NOT NULL DEFAULT now() + INTERVAL '7 days'
);

CREATE INDEX IF NOT EXISTS idx_apify_cache_key   ON public.apify_search_cache(cache_key);
CREATE INDEX IF NOT EXISTS idx_apify_cache_exp   ON public.apify_search_cache(expires_at);

-- RLS: service role only
ALTER TABLE public.apify_search_cache ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "service_role_all_apify_cache" ON public.apify_search_cache;
CREATE POLICY "service_role_all_apify_cache"
  ON public.apify_search_cache FOR ALL
  USING (auth.role() = 'service_role');

-- ── Clean up expired cache entries (manual cleanup trigger) ──────────────────
-- Run periodically: DELETE FROM apify_search_cache WHERE expires_at < now();
