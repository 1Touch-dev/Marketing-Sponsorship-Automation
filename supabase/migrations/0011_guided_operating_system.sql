-- ─────────────────────────────────────────────────────────────────────────────
-- Migration 0011: Guided Commercial Operating System
-- Adds: proposal_wizard_drafts, proposal_sections, proposal_modules,
--       image_generation_jobs, company_logos, crm_sync_queue
-- ─────────────────────────────────────────────────────────────────────────────

-- ─────────────────────────────────────────────────────────────────────────────
-- proposal_wizard_drafts: persist wizard state across sessions
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.proposal_wizard_drafts (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_key      TEXT UNIQUE NOT NULL,   -- browser-generated UUID, no auth needed
  current_step     INT DEFAULT 1,          -- 1-6
  proposal_type    TEXT,                   -- 'sponsorship' | 'barter' | 'lei_de_incentivo' | 'mixed'
  company_id       UUID REFERENCES public.companies(id) ON DELETE SET NULL,
  campaign_id      UUID REFERENCES public.campaigns(id) ON DELETE SET NULL,
  selected_components JSONB DEFAULT '[]',  -- [{type, id, name, category}]
  selected_strategies JSONB DEFAULT '[]',  -- [{key, label, description}]
  custom_brief     TEXT,
  generation_options JSONB DEFAULT '{}',   -- {tone, length, include_pricing, include_visuals}
  generated_proposal_id UUID REFERENCES public.proposals(id) ON DELETE SET NULL,
  status           TEXT DEFAULT 'in_progress', -- 'in_progress' | 'completed' | 'abandoned'
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_wizard_drafts_session ON public.proposal_wizard_drafts(session_key);
CREATE INDEX IF NOT EXISTS idx_wizard_drafts_company ON public.proposal_wizard_drafts(company_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- proposal_sections: modular editable blocks per proposal
-- Inspired by PandaDoc/Proposify block-based editing
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.proposal_sections (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  proposal_id      UUID NOT NULL REFERENCES public.proposals(id) ON DELETE CASCADE,
  section_type     TEXT NOT NULL,   -- 'executive_summary' | 'campaign_rationale' | 'sponsorship_value'
                                    -- | 'activation_plan' | 'investment_overview' | 'cta'
                                    -- | 'deliverables' | 'pricing_table' | 'strategy_block'
                                    -- | 'visual_block' | 'social_proof' | 'team_block' | 'custom'
  title            TEXT,
  content          TEXT,            -- markdown/plain text content
  content_json     JSONB,           -- structured content (pricing table rows, etc.)
  sort_order       INT DEFAULT 0,
  is_visible       BOOLEAN DEFAULT TRUE,
  is_locked        BOOLEAN DEFAULT FALSE,  -- locked sections can't be regenerated
  generation_prompt TEXT,                  -- the prompt used to generate this section
  ai_model         TEXT,
  version          INT DEFAULT 1,
  last_regenerated_at TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_proposal_sections_proposal ON public.proposal_sections(proposal_id);
CREATE INDEX IF NOT EXISTS idx_proposal_sections_type ON public.proposal_sections(section_type);
CREATE INDEX IF NOT EXISTS idx_proposal_sections_order ON public.proposal_sections(proposal_id, sort_order);

-- ─────────────────────────────────────────────────────────────────────────────
-- image_generation_jobs: approval-first AI image pipeline
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.image_generation_jobs (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  proposal_id      UUID REFERENCES public.proposals(id) ON DELETE SET NULL,
  company_id       UUID REFERENCES public.companies(id) ON DELETE SET NULL,
  mockup_id        UUID REFERENCES public.visual_mockups(id) ON DELETE SET NULL,

  -- Job metadata
  job_type         TEXT NOT NULL,  -- 'jersey_mockup' | 'led_board' | 'stadium_banner'
                                   -- | 'social_post' | 'press_backdrop' | 'scoreboard'
  status           TEXT DEFAULT 'pending_approval',
                                   -- 'pending_approval' | 'approved' | 'queued'
                                   -- | 'generating' | 'completed' | 'failed' | 'rejected'

  -- Prompt
  prompt           TEXT NOT NULL,
  negative_prompt  TEXT,
  style_notes      TEXT,

  -- Generation config
  provider         TEXT DEFAULT 'dall-e-3',  -- 'dall-e-3' | 'gpt-image-1' | 'stability' | 'manual'
  model            TEXT DEFAULT 'dall-e-3',
  size             TEXT DEFAULT '1024x1024',
  quality          TEXT DEFAULT 'standard',  -- 'standard' | 'hd'
  n_images         INT DEFAULT 1,

  -- Approval
  approved_by      TEXT,
  approved_at      TIMESTAMPTZ,
  rejection_reason TEXT,

  -- Output
  output_urls      JSONB DEFAULT '[]',  -- [{url, revised_prompt, index}]
  selected_url     TEXT,               -- final chosen image
  error_message    TEXT,
  generation_ms    INT,

  -- Audit
  triggered_by     TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_img_jobs_proposal ON public.image_generation_jobs(proposal_id);
CREATE INDEX IF NOT EXISTS idx_img_jobs_status ON public.image_generation_jobs(status);
CREATE INDEX IF NOT EXISTS idx_img_jobs_company ON public.image_generation_jobs(company_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- company_logos: auto-scraped and uploaded logo assets
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.company_logos (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id       UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,

  source           TEXT NOT NULL,  -- 'logo_dev' | 'favicon' | 'opengraph' | 'manual_upload' | 'clearbit'
  original_url     TEXT,           -- original scraped URL
  stored_url       TEXT,           -- our Supabase Storage URL (after upload)
  format           TEXT,           -- 'png' | 'svg' | 'jpg' | 'webp' | 'ico'
  width            INT,
  height           INT,
  has_transparency BOOLEAN DEFAULT FALSE,
  is_primary       BOOLEAN DEFAULT FALSE,
  fetch_status     TEXT DEFAULT 'pending',  -- 'pending' | 'fetched' | 'failed' | 'manual'
  fetch_error      TEXT,

  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_company_logos_company ON public.company_logos(company_id);
CREATE INDEX IF NOT EXISTS idx_company_logos_primary ON public.company_logos(company_id, is_primary);

-- Add logo_url shortcut to companies table
ALTER TABLE public.companies ADD COLUMN IF NOT EXISTS logo_url TEXT;
ALTER TABLE public.companies ADD COLUMN IF NOT EXISTS logo_source TEXT;
ALTER TABLE public.companies ADD COLUMN IF NOT EXISTS logo_fetched_at TIMESTAMPTZ;

-- ─────────────────────────────────────────────────────────────────────────────
-- crm_sync_queue: Pipedrive/CRM sync abstraction layer
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.crm_sync_queue (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type      TEXT NOT NULL,   -- 'company' | 'proposal' | 'pipeline_lead' | 'campaign'
  entity_id        UUID NOT NULL,
  operation        TEXT NOT NULL,   -- 'create' | 'update' | 'delete' | 'status_change'
  crm_provider     TEXT DEFAULT 'pipedrive',
  crm_entity_id    TEXT,            -- the ID in the external CRM (once synced)
  crm_entity_type  TEXT,            -- 'deal' | 'person' | 'organization' | 'note'
  payload          JSONB DEFAULT '{}',
  status           TEXT DEFAULT 'pending',  -- 'pending' | 'synced' | 'failed' | 'skipped'
  attempts         INT DEFAULT 0,
  last_attempt_at  TIMESTAMPTZ,
  synced_at        TIMESTAMPTZ,
  error_message    TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_crm_sync_status ON public.crm_sync_queue(status);
CREATE INDEX IF NOT EXISTS idx_crm_sync_entity ON public.crm_sync_queue(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_crm_sync_provider ON public.crm_sync_queue(crm_provider, crm_entity_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- Add wizard_draft_id to proposals for traceability
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.proposals ADD COLUMN IF NOT EXISTS wizard_draft_id UUID REFERENCES public.proposal_wizard_drafts(id) ON DELETE SET NULL;
ALTER TABLE public.proposals ADD COLUMN IF NOT EXISTS proposal_type TEXT DEFAULT 'sponsorship';
ALTER TABLE public.proposals ADD COLUMN IF NOT EXISTS selected_components JSONB DEFAULT '[]';
ALTER TABLE public.proposals ADD COLUMN IF NOT EXISTS selected_strategies JSONB DEFAULT '[]';

-- ─────────────────────────────────────────────────────────────────────────────
-- RLS
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.proposal_wizard_drafts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.proposal_sections      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.image_generation_jobs  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.company_logos          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crm_sync_queue         ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'proposal_wizard_drafts','proposal_sections','image_generation_jobs',
    'company_logos','crm_sync_queue'
  ]
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS "service_all_%s" ON public.%I', t, t);
    EXECUTE format('CREATE POLICY "service_all_%s" ON public.%I FOR ALL TO service_role USING (true) WITH CHECK (true)', t, t);
    EXECUTE format('DROP POLICY IF EXISTS "auth_read_%s" ON public.%I', t, t);
    EXECUTE format('CREATE POLICY "auth_read_%s" ON public.%I FOR SELECT TO authenticated USING (true)', t, t);
    EXECUTE format('DROP POLICY IF EXISTS "auth_write_%s" ON public.%I', t, t);
    EXECUTE format('CREATE POLICY "auth_write_%s" ON public.%I FOR INSERT TO authenticated WITH CHECK (true)', t, t);
    EXECUTE format('DROP POLICY IF EXISTS "auth_upd_%s" ON public.%I', t, t);
    EXECUTE format('CREATE POLICY "auth_upd_%s" ON public.%I FOR UPDATE TO authenticated USING (true)', t, t);
  END LOOP;
END $$;

-- updated_at triggers
DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'proposal_wizard_drafts','proposal_sections','image_generation_jobs',
    'company_logos','crm_sync_queue'
  ]
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_%s_updated_at ON public.%I', t, t);
    EXECUTE format('CREATE TRIGGER trg_%s_updated_at BEFORE UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.set_updated_at()', t, t);
  END LOOP;
END $$;

NOTIFY pgrst, 'reload schema';
