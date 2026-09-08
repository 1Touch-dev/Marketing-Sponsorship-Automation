-- Migration 0044: Spend ledger + hard daily cap infrastructure
-- Hardening pass (master_report.md Section 8, Pattern 5 — "runaway automation
-- cost", citing the real $47,000/11-day LangChain retry-loop incident).
--
-- Before this: request-rate limiting exists on the paid image-generation
-- routes (lib/rate-limit.ts — 20/min jersey, 20/min stadium, 10/min campaign
-- creative), but that only throttles request *count*, not dollar spend, and
-- has no cross-request memory — a sustained-but-rate-limit-compliant loop
-- (a bug, a retry storm, or genuine misuse) could run 24/7 with no ceiling
-- and no visibility until the monthly invoice. Nothing tracked actual cost
-- anywhere in the schema.
--
-- This adds a real-time spend ledger every paid AI call records itself into
-- (see frontend/lib/monitoring/spend-guard.ts), and a hard daily cap that
-- gates new paid calls once today's recorded spend crosses it — independent
-- of the calling code's own logic, so a bug in the caller can't bypass it.

CREATE TABLE IF NOT EXISTS public.spend_ledger (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category      TEXT NOT NULL,        -- e.g. 'openai_image', 'bedrock_text'
  provider      TEXT NOT NULL,        -- e.g. 'openai', 'aws_bedrock'
  amount_usd    NUMERIC(10, 4) NOT NULL CHECK (amount_usd >= 0),
  entity_type   TEXT,                 -- 'proposal' | 'company' | 'agent_run' | ...
  entity_id     UUID,
  metadata      JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS spend_ledger_created_at_idx ON public.spend_ledger(created_at DESC);
CREATE INDEX IF NOT EXISTS spend_ledger_category_idx ON public.spend_ledger(category);

ALTER TABLE public.spend_ledger ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename='spend_ledger' AND policyname='service_role_all'
  ) THEN
    CREATE POLICY "service_role_all" ON public.spend_ledger FOR ALL TO service_role USING (true);
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
