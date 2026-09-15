-- Migration 0047: Multi-tenancy foundation (Phase 4)
--
-- Additive and backward-compatible by design: creates a `tenants` table,
-- seeds a single row for the existing Coritiba FC operation (fixed UUID
-- '00000000-0000-0000-0000-000000000001' so it's referenceable from this
-- migration and from application code), then adds a `tenant_id` column
-- to every business table with DEFAULT pointing at that Coritiba row.
-- Every existing row across the whole schema is automatically assigned
-- to the Coritiba tenant — zero data loss, zero breakage, the app
-- continues working exactly as before until tenant-scoped queries are
-- added on top of this.
--
-- RLS is not the isolation boundary here (the app exclusively uses the
-- service-role client — see lib/supabase/server.ts's supabaseAdmin() —
-- same as the rest of this schema); tenant isolation is enforced at the
-- application query layer, same pattern as the existing RBAC model
-- (requirePermission() at the route level, not Postgres RLS policies).

CREATE TABLE IF NOT EXISTS public.tenants (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug          TEXT NOT NULL UNIQUE,
  name          TEXT NOT NULL,
  status        TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended', 'trial')),
  branding      JSONB NOT NULL DEFAULT '{}'::jsonb,   -- logo_url, primary_color, secondary_color, crest_url
  club_facts    JSONB NOT NULL DEFAULT '{}'::jsonb,   -- club_name, stadium_name, city, state, market_context, follower_count, etc. — replaces hardcoded Coritiba facts in AI prompts
  plan          TEXT NOT NULL DEFAULT 'internal',      -- 'internal' | 'trial' | 'starter' | 'growth' | 'pro' — real plan definitions land with billing (Stripe keys still pending)
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.tenants ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='tenants' AND policyname='service_role_all') THEN
    CREATE POLICY "service_role_all" ON public.tenants FOR ALL TO service_role USING (true);
  END IF;
END $$;

INSERT INTO public.tenants (id, slug, name, status, branding, club_facts, plan)
VALUES (
  '00000000-0000-0000-0000-000000000001',
  'coritiba',
  'Coritiba Foot Ball Club',
  'active',
  '{"primary_color": "#1a8f3c", "secondary_color": "#ffffff", "crest_url": "/brand/coritiba-crest.svg"}'::jsonb,
  '{"club_name": "Coritiba Foot Ball Club", "short_name": "Coritiba FC", "nickname": "Coxa", "stadium_name": "Estádio Major Antônio Couto Pereira", "city": "Curitiba", "state": "Paraná", "country": "Brasil", "founded_year": 1909}'::jsonb,
  'internal'
)
ON CONFLICT (id) DO NOTHING;

-- Every business table gets tenant_id, defaulted to the Coritiba row so
-- 100% of existing data is automatically scoped correctly with no manual
-- backfill needed. NOT VALID + separate validation would be the move for
-- an enormous table under write load; every table here is small enough
-- (largest is audit_logs at ~1,134 rows) that a single-pass ADD COLUMN is
-- fine.
DO $$
DECLARE
  t TEXT;
  tables TEXT[] := ARRAY[
    'users', 'companies', 'campaigns', 'proposals', 'proposal_versions',
    'approvals', 'email_threads', 'emails', 'followups', 'audit_logs',
    'workflow_events', 'brand_asset_packs', 'brand_assets', 'coritiba_metrics',
    'inventory_items', 'barter_items', 'social_projects', 'pipeline_leads',
    'visual_mockups', 'proposal_wizard_drafts', 'proposal_sections',
    'image_generation_jobs', 'company_logos', 'crm_sync_queue',
    'apify_search_cache', 'proposal_inventory_items', 'platform_users',
    'agent_runs', 'contacts', 'campaign_inventory_items', 'team_members',
    'email_templates', 'proposal_templates', 'proposal_packages',
    'newsletters', 'contracts', 'sender_profiles', 'newsletter_segments',
    'email_sequences', 'email_sequence_enrollments', 'agent_batch_runs',
    'template_renders', 'matches', 'match_media_reach', 'warmup_sequences',
    'warmup_enrollments', 'spend_ledger', 'proposal_views', 'proposal_variants'
  ];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    EXECUTE format(
      'ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS tenant_id UUID NOT NULL DEFAULT %L REFERENCES public.tenants(id)',
      t, '00000000-0000-0000-0000-000000000001'
    );
    EXECUTE format(
      'CREATE INDEX IF NOT EXISTS %I ON public.%I(tenant_id)',
      t || '_tenant_id_idx', t
    );
  END LOOP;
END $$;

NOTIFY pgrst, 'reload schema';
