-- Migration: 0027_agent_runs_table.sql
-- Stores Outreach Agent run state, steps, and results.
-- Run this in Supabase SQL Editor → New Query

CREATE TABLE IF NOT EXISTS public.agent_runs (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id   uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  created_by   uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  status       text NOT NULL DEFAULT 'running'
               CHECK (status IN ('running','completed','failed','paused_for_approval','paused_for_proposal_approval','cancelled')),
  mode         text NOT NULL DEFAULT 'supervised'
               CHECK (mode IN ('supervised','auto')),
  steps        jsonb NOT NULL DEFAULT '[]'::jsonb,
  result       jsonb,
  error        text,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS agent_runs_company_id_idx  ON public.agent_runs(company_id);
CREATE INDEX IF NOT EXISTS agent_runs_status_idx      ON public.agent_runs(status);
CREATE INDEX IF NOT EXISTS agent_runs_created_at_idx  ON public.agent_runs(created_at DESC);

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION public.set_agent_runs_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

DROP TRIGGER IF EXISTS agent_runs_updated_at ON public.agent_runs;
CREATE TRIGGER agent_runs_updated_at
  BEFORE UPDATE ON public.agent_runs
  FOR EACH ROW EXECUTE FUNCTION public.set_agent_runs_updated_at();

-- RLS
ALTER TABLE public.agent_runs ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename='agent_runs' AND policyname='service_role_all'
  ) THEN
    CREATE POLICY "service_role_all" ON public.agent_runs FOR ALL TO service_role USING (true);
  END IF;
END $$;
