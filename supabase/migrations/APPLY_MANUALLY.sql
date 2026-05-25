-- ============================================================
-- MIGRATION INSTRUCTIONS FOR SUPABASE DASHBOARD
-- ============================================================
-- 
-- Because this server cannot connect directly to the Supabase
-- database pooler (requires IPv4 add-on not enabled on this project),
-- these migrations must be applied manually via:
--
-- 1. Go to: https://supabase.com/dashboard/project/lmjwjztokzombtstmume/sql/new
-- 2. Copy and paste the SQL below
-- 3. Click "Run"
--
-- ============================================================

-- MIGRATION 0017: Inventory operational fields
-- Digital: avg_views, content_hours, team_required
-- Physical: production_cost, setup_hours, line_items
-- ============================================================
ALTER TABLE public.inventory_items
  ADD COLUMN IF NOT EXISTS avg_views        INTEGER       DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS content_hours    NUMERIC(6,2)  DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS team_required    TEXT          DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS production_cost  NUMERIC(12,2) DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS setup_hours      NUMERIC(6,2)  DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS line_items       JSONB         DEFAULT '[]';

COMMENT ON COLUMN public.inventory_items.avg_views       IS 'Average views/impressions per post or campaign unit (digital)';
COMMENT ON COLUMN public.inventory_items.content_hours   IS 'Hours of content production required per unit (digital)';
COMMENT ON COLUMN public.inventory_items.team_required   IS 'Team roles/assets required (e.g. player, videographer)';
COMMENT ON COLUMN public.inventory_items.production_cost IS 'Estimated production cost in BRL (physical)';
COMMENT ON COLUMN public.inventory_items.setup_hours     IS 'Setup hours required (physical)';
COMMENT ON COLUMN public.inventory_items.line_items      IS 'Line items/requirements breakdown [{name, cost, hours}]';


-- MIGRATION 0018: Add active_contract to proposal_status enum
-- ============================================================
DO $$ 
BEGIN
  -- Check if value already exists before adding
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum e
    JOIN pg_type t ON e.enumtypid = t.oid
    WHERE t.typname = 'proposal_status' AND e.enumlabel = 'active_contract'
  ) THEN
    ALTER TYPE public.proposal_status ADD VALUE 'active_contract' AFTER 'sent';
  END IF;
EXCEPTION WHEN others THEN
  RAISE NOTICE 'Migration 0018: %', SQLERRM;
END $$;


-- MIGRATION 0015: Pipedrive columns (safe/idempotent)
-- ============================================================
ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS pipedrive_org_id    BIGINT,
  ADD COLUMN IF NOT EXISTS pipedrive_synced_at TIMESTAMPTZ;

ALTER TABLE public.proposals
  ADD COLUMN IF NOT EXISTS pipedrive_deal_id      BIGINT,
  ADD COLUMN IF NOT EXISTS pipedrive_pipeline_id  INTEGER,
  ADD COLUMN IF NOT EXISTS pipedrive_synced_at    TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_companies_pipedrive_org  ON public.companies(pipedrive_org_id) WHERE pipedrive_org_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_proposals_pipedrive_deal ON public.proposals(pipedrive_deal_id) WHERE pipedrive_deal_id IS NOT NULL;


-- NOTIFY PostgREST to reload schema cache
NOTIFY pgrst, 'reload schema';

-- Verify
SELECT 
  'inventory_items cols' AS check,
  string_agg(column_name, ', ' ORDER BY column_name) AS value
FROM information_schema.columns
WHERE table_schema = 'public' 
  AND table_name = 'inventory_items'
  AND column_name IN ('avg_views','content_hours','team_required','production_cost','setup_hours','line_items');

SELECT 
  'proposal_status enum' AS check,
  string_agg(e.enumlabel, ', ' ORDER BY e.enumsortorder) AS value
FROM pg_type t
JOIN pg_enum e ON t.oid = e.enumtypid
WHERE t.typname = 'proposal_status';
