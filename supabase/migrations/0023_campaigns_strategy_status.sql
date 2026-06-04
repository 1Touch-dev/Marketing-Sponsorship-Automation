-- Migration 0023: Fix campaigns table — add strategy column + extend status enum
-- Root cause of Outreach Agent Phase 1 failure: generate_personalized_proposal
-- inserts { strategy: "awareness", status: "active" } but neither column/value exists.
-- Apply in Supabase SQL Editor.

-- 1. Add strategy column to campaigns
ALTER TABLE public.campaigns
  ADD COLUMN IF NOT EXISTS strategy TEXT;

-- 2. Extend campaign_status enum to include 'active'
--    (ALTER TYPE ... ADD VALUE is DDL and cannot be inside a transaction with other DDL in Postgres 14-)
ALTER TYPE campaign_status ADD VALUE IF NOT EXISTS 'active';

-- 3. Backfill: treat any campaign with status='draft' that was agent-created as 'active'
--    (safe no-op if no rows match)
-- No backfill needed — new column is nullable, existing rows unaffected.

-- 4. Index for strategy queries (optional perf)
CREATE INDEX IF NOT EXISTS campaigns_strategy_idx ON public.campaigns(strategy)
  WHERE strategy IS NOT NULL;
