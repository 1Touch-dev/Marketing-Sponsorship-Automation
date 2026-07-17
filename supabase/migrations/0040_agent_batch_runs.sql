-- Migration 0040: Pre-approved campaigns + Outreach Agent batch runner
-- James: "Potentially look at integrating outreach agents for pre-approved campaigns."
--
-- 1. `campaigns.is_preapproved` — when true, agent runs against this campaign
--    skip the proposal-approval pause (auto-run mode) since a human has already
--    blessed the underlying strategy/template for this industry/segment.
-- 2. `agent_batch_runs` — tracks a single "launch" (campaign + N companies),
--    parent of many `agent_runs` rows (one per company) via `batch_id`.

ALTER TABLE public.campaigns
  ADD COLUMN IF NOT EXISTS is_preapproved   BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS preapproved_by   UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS preapproved_at   TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS campaigns_preapproved_idx
  ON public.campaigns(is_preapproved) WHERE is_preapproved = TRUE;

CREATE TABLE IF NOT EXISTS public.agent_batch_runs (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id    UUID REFERENCES public.campaigns(id) ON DELETE SET NULL,
  created_by     UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  mode           TEXT NOT NULL DEFAULT 'auto' CHECK (mode IN ('auto','supervised')),
  company_ids    JSONB NOT NULL DEFAULT '[]',
  total_count    INTEGER NOT NULL DEFAULT 0,
  queued_count   INTEGER NOT NULL DEFAULT 0,
  running_count  INTEGER NOT NULL DEFAULT 0,
  done_count     INTEGER NOT NULL DEFAULT 0,
  failed_count   INTEGER NOT NULL DEFAULT 0,
  status         TEXT NOT NULL DEFAULT 'running' CHECK (status IN ('running','completed','failed','cancelled')),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS agent_batch_runs_campaign_idx ON public.agent_batch_runs(campaign_id);
CREATE INDEX IF NOT EXISTS agent_batch_runs_created_at_idx ON public.agent_batch_runs(created_at DESC);

-- Link each per-company agent_runs row back to its parent batch (nullable — normal
-- single-company runs from the company page have no batch).
ALTER TABLE public.agent_runs
  ADD COLUMN IF NOT EXISTS batch_id UUID REFERENCES public.agent_batch_runs(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS agent_runs_batch_id_idx ON public.agent_runs(batch_id);

-- Auto-update updated_at on agent_batch_runs
CREATE OR REPLACE FUNCTION public.set_agent_batch_runs_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

DROP TRIGGER IF EXISTS agent_batch_runs_updated_at ON public.agent_batch_runs;
CREATE TRIGGER agent_batch_runs_updated_at
  BEFORE UPDATE ON public.agent_batch_runs
  FOR EACH ROW EXECUTE FUNCTION public.set_agent_batch_runs_updated_at();

ALTER TABLE public.agent_batch_runs ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename='agent_batch_runs' AND policyname='service_role_all'
  ) THEN
    CREATE POLICY "service_role_all" ON public.agent_batch_runs FOR ALL TO service_role USING (true);
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
