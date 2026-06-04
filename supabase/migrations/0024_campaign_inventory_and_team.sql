-- Migration 0024: Campaign inventory items (proper table), activation brief, team members
-- Apply in Supabase SQL Editor.

-- ─── 1. campaign_inventory_items ──────────────────────────────────────────────
-- Replaces the JSON-in-campaigns.summary approach.
CREATE TABLE IF NOT EXISTS public.campaign_inventory_items (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id     UUID NOT NULL REFERENCES public.campaigns(id) ON DELETE CASCADE,
  inventory_id    UUID REFERENCES public.inventory_items(id) ON DELETE SET NULL,
  name            TEXT NOT NULL,               -- snapshot of item name at time of selection
  category        TEXT,
  inventory_type  TEXT,                        -- physical | digital
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

-- ─── 2. activation_brief on campaigns ─────────────────────────────────────────
ALTER TABLE public.campaigns
  ADD COLUMN IF NOT EXISTS activation_brief JSONB;

-- ─── 3. team_members ──────────────────────────────────────────────────────────
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

-- Only one default sender at a time (enforced in application layer)
CREATE INDEX IF NOT EXISTS team_members_default_idx
  ON public.team_members(default_sender)
  WHERE default_sender = TRUE;

DROP TRIGGER IF EXISTS trg_team_members_updated_at ON public.team_members;
CREATE TRIGGER trg_team_members_updated_at
  BEFORE UPDATE ON public.team_members
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ─── 4. Seed one default team member from env (if table is empty) ──────────────
-- This is a best-effort seed; won't fail if rows already exist.
INSERT INTO public.team_members (full_name, title, email, default_sender)
VALUES ('Departamento Comercial', 'Gerente de Patrocínios', 'comercial@coritiba.com.br', TRUE)
ON CONFLICT (email) DO NOTHING;
