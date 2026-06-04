-- =========================================================================
-- 5th June Migrations — Apply ALL in Supabase Dashboard SQL Editor
-- =========================================================================
-- Copy this entire file and paste into:
-- https://supabase.com/dashboard/project/lmjwjztokzombtstmume/sql/new
-- Then click Run.
-- =========================================================================

-- ─── MIGRATION 0023: Fix campaigns (strategy column + active status) ──────
ALTER TABLE public.campaigns
  ADD COLUMN IF NOT EXISTS strategy TEXT;

ALTER TYPE campaign_status ADD VALUE IF NOT EXISTS 'active';

CREATE INDEX IF NOT EXISTS campaigns_strategy_idx ON public.campaigns(strategy)
  WHERE strategy IS NOT NULL;

-- ─── MIGRATION 0024: Campaign Inventory Items + Team Members ──────────────

-- 1. campaign_inventory_items
CREATE TABLE IF NOT EXISTS public.campaign_inventory_items (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id     UUID NOT NULL REFERENCES public.campaigns(id) ON DELETE CASCADE,
  inventory_id    UUID REFERENCES public.inventory_items(id) ON DELETE SET NULL,
  name            TEXT NOT NULL,
  category        TEXT,
  inventory_type  TEXT,
  quantity        INTEGER NOT NULL DEFAULT 1,
  unit            TEXT,
  unit_price      NUMERIC(12,2) NOT NULL DEFAULT 0,
  notes           TEXT,
  included        BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order      INTEGER NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS campaign_inv_items_campaign_idx
  ON public.campaign_inventory_items(campaign_id);

DROP TRIGGER IF EXISTS trg_campaign_inv_items_updated_at
  ON public.campaign_inventory_items;
CREATE TRIGGER trg_campaign_inv_items_updated_at
  BEFORE UPDATE ON public.campaign_inventory_items
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 2. activation_brief column on campaigns
ALTER TABLE public.campaigns
  ADD COLUMN IF NOT EXISTS activation_brief JSONB;

-- 3. team_members
CREATE TABLE IF NOT EXISTS public.team_members (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name       TEXT NOT NULL,
  title           TEXT,
  email           TEXT NOT NULL,
  phone           TEXT,
  active          BOOLEAN NOT NULL DEFAULT TRUE,
  default_sender  BOOLEAN NOT NULL DEFAULT FALSE,
  bio             TEXT,
  signature       TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS team_members_email_idx
  ON public.team_members(email);

DROP TRIGGER IF EXISTS trg_team_members_updated_at ON public.team_members;
CREATE TRIGGER trg_team_members_updated_at
  BEFORE UPDATE ON public.team_members
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Seed default team member
INSERT INTO public.team_members (full_name, title, email, default_sender)
VALUES ('Departamento Comercial', 'Gerente de Patrocínios', 'comercial@coritiba.com.br', TRUE)
ON CONFLICT (email) DO NOTHING;

-- ─── MIGRATION 0025: Email Templates + Proposal Packages ──────────────────

-- 1. email_templates
CREATE TABLE IF NOT EXISTS public.email_templates (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL,
  description TEXT,
  subject     TEXT NOT NULL DEFAULT '',
  body_html   TEXT NOT NULL DEFAULT '',
  body_text   TEXT,
  variables   JSONB NOT NULL DEFAULT '[]',
  active      BOOLEAN NOT NULL DEFAULT TRUE,
  is_default  BOOLEAN NOT NULL DEFAULT FALSE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DROP TRIGGER IF EXISTS trg_email_templates_updated_at ON public.email_templates;
CREATE TRIGGER trg_email_templates_updated_at
  BEFORE UPDATE ON public.email_templates
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 2. proposal_templates
CREATE TABLE IF NOT EXISTS public.proposal_templates (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL,
  description TEXT,
  content     JSONB NOT NULL DEFAULT '{}',
  variables   JSONB NOT NULL DEFAULT '[]',
  active      BOOLEAN NOT NULL DEFAULT TRUE,
  is_default  BOOLEAN NOT NULL DEFAULT FALSE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DROP TRIGGER IF EXISTS trg_proposal_templates_updated_at ON public.proposal_templates;
CREATE TRIGGER trg_proposal_templates_updated_at
  BEFORE UPDATE ON public.proposal_templates
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 3. proposal_packages
CREATE TABLE IF NOT EXISTS public.proposal_packages (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  proposal_id     UUID REFERENCES public.proposals(id) ON DELETE CASCADE,
  name            TEXT NOT NULL,
  description     TEXT,
  price_brl       NUMERIC(12,2),
  benefits        JSONB NOT NULL DEFAULT '[]',
  inventory_items JSONB NOT NULL DEFAULT '[]',
  sort_order      INTEGER NOT NULL DEFAULT 0,
  active          BOOLEAN NOT NULL DEFAULT TRUE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS proposal_packages_proposal_idx
  ON public.proposal_packages(proposal_id);

DROP TRIGGER IF EXISTS trg_proposal_packages_updated_at ON public.proposal_packages;
CREATE TRIGGER trg_proposal_packages_updated_at
  BEFORE UPDATE ON public.proposal_packages
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 4. Seed default email template
INSERT INTO public.email_templates (
  name, description, subject, body_html, body_text, variables, is_default
) VALUES (
  'Outreach Padrão — Patrocínio Coritiba FC',
  'Template padrão de email de prospecção de patrocinadores.',
  'Proposta de Patrocínio — Coritiba Foot Ball Club × {{company_name}}',
  '<p>Prezado(a) {{contact_name}},</p>
<p>É com prazer que apresentamos uma proposta exclusiva de patrocínio junto ao <strong>Coritiba Foot Ball Club</strong>.</p>
<p>{{proposal_summary}}</p>
<p>Confira a proposta: <a href="{{proposal_link}}">{{proposal_link}}</a></p>
<p>Atenciosamente,<br/>{{sender_name}}<br/>{{sender_title}}</p>',
  'Prezado(a) {{contact_name}},\n\nÉ com prazer que apresentamos uma proposta exclusiva de patrocínio.\n\n{{proposal_summary}}\n\nConfira: {{proposal_link}}\n\nAtenciosamente,\n{{sender_name}}\n{{sender_title}}',
  '["company_name","contact_name","proposal_summary","proposal_link","sender_name","sender_title"]',
  TRUE
) ON CONFLICT DO NOTHING;
