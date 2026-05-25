-- 0015: Pipedrive CRM columns on companies + proposals
-- Originally only in apply-sql route; moved to migrations/ for runner parity

ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS pipedrive_org_id    BIGINT,
  ADD COLUMN IF NOT EXISTS pipedrive_synced_at TIMESTAMPTZ;

ALTER TABLE public.proposals
  ADD COLUMN IF NOT EXISTS pipedrive_deal_id      BIGINT,
  ADD COLUMN IF NOT EXISTS pipedrive_pipeline_id  INTEGER,
  ADD COLUMN IF NOT EXISTS pipedrive_synced_at    TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_companies_pipedrive_org  ON public.companies(pipedrive_org_id) WHERE pipedrive_org_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_proposals_pipedrive_deal ON public.proposals(pipedrive_deal_id) WHERE pipedrive_deal_id IS NOT NULL;
