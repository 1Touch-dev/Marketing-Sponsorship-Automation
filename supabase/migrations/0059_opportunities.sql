-- Migration 0059: multiple opportunities per account (Task 11).
--
-- One company can run a cash sponsorship, a barter deal and a renewal at the
-- same time. Until now the only "deal" was a proposal, so three parallel deals
-- were three unrelated proposals and a company-level stage had to stand for all
-- of them. An opportunity is the account-level deal between a company and its
-- proposals and contracts.
--
--   opportunities        who/what/which kind; created by a person, by one named
--                        rule (a signed contract's renewal), or grandfathered
--   opportunity_events   append-only: a person closed or reopened it, with a reason
--   proposals / contracts .opportunity_id  which opportunity they belong to
--
-- An opportunity's status (draft, open, won, lost, closed) is derived in code
-- from its proposals, its contract and the newest event; it is never stored.
-- An agent cannot create an opportunity: created_by_kind has no 'agent' value.
--
-- Additive only.

CREATE TABLE IF NOT EXISTS public.opportunities (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id          uuid NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001'::uuid,
  company_id         uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  kind               text NOT NULL CHECK (kind IN ('cash', 'barter', 'hybrid', 'incentive', 'renewal', 'other')),
  title              text NOT NULL,
  owner_email        text,
  renews_contract_id uuid REFERENCES public.contracts(id) ON DELETE SET NULL,
  created_by_kind    text NOT NULL CHECK (created_by_kind IN ('human', 'rule', 'grandfathered')),
  created_by         text NOT NULL,
  rule_name          text,
  pipedrive_deal_id  integer,
  created_at         timestamptz NOT NULL DEFAULT now(),
  CHECK (created_by_kind <> 'rule' OR rule_name IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS idx_opportunities_company ON public.opportunities (tenant_id, company_id);

CREATE TABLE IF NOT EXISTS public.opportunity_events (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      uuid NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001'::uuid,
  opportunity_id uuid NOT NULL REFERENCES public.opportunities(id) ON DELETE CASCADE,
  event_type     text NOT NULL CHECK (event_type IN ('closed', 'reopened')),
  reason         text NOT NULL,
  actor_email    text NOT NULL,
  created_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_opportunity_events_opp ON public.opportunity_events (opportunity_id, created_at DESC);

CREATE OR REPLACE FUNCTION public.opportunity_events_immutable() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    RAISE EXCEPTION 'opportunity_events rows are immutable';
  END IF;
  IF TG_OP = 'DELETE' THEN
    IF EXISTS (SELECT 1 FROM public.opportunities WHERE id = OLD.opportunity_id) THEN
      RAISE EXCEPTION 'opportunity_events rows cannot be deleted while their opportunity exists';
    END IF;
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_opportunity_events_immutable ON public.opportunity_events;
CREATE TRIGGER trg_opportunity_events_immutable
  BEFORE UPDATE OR DELETE ON public.opportunity_events
  FOR EACH ROW EXECUTE FUNCTION public.opportunity_events_immutable();

ALTER TABLE public.opportunities       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.opportunity_events  ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "service_all_opportunities" ON public.opportunities;
CREATE POLICY "service_all_opportunities" ON public.opportunities
  FOR ALL TO service_role USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "service_all_opportunity_events" ON public.opportunity_events;
CREATE POLICY "service_all_opportunity_events" ON public.opportunity_events
  FOR ALL TO service_role USING (true) WITH CHECK (true);

ALTER TABLE public.proposals ADD COLUMN IF NOT EXISTS opportunity_id uuid REFERENCES public.opportunities(id) ON DELETE SET NULL;
ALTER TABLE public.contracts ADD COLUMN IF NOT EXISTS opportunity_id uuid REFERENCES public.opportunities(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_proposals_opportunity ON public.proposals (opportunity_id) WHERE opportunity_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_contracts_opportunity ON public.contracts (opportunity_id) WHERE opportunity_id IS NOT NULL;

-- Backfill: one opportunity per (company, kind) for the proposals that already
-- exist, labelled 'grandfathered'. Each proposal keeps its own Pipedrive deal id.
-- The kind comes from the proposal type (no type counts as a cash sponsorship),
-- the same mapping as lib/opportunities/model.ts.
INSERT INTO public.opportunities (tenant_id, company_id, kind, title, created_by_kind, created_by)
SELECT s.tenant_id, s.company_id, s.kind,
       CASE s.kind
         WHEN 'cash' THEN 'Cash sponsorship' WHEN 'barter' THEN 'Barter deal' WHEN 'hybrid' THEN 'Cash and barter deal'
         WHEN 'incentive' THEN 'Lei de Incentivo deal' WHEN 'renewal' THEN 'Renewal' ELSE 'Other deal'
       END || ' (migrated)',
       'grandfathered', 'migration-0059'
FROM (
  SELECT DISTINCT p.tenant_id, p.company_id,
         CASE COALESCE(p.proposal_type, 'sponsorship')
           WHEN 'barter'           THEN 'barter'
           WHEN 'mixed'            THEN 'hybrid'
           WHEN 'lei_de_incentivo' THEN 'incentive'
           WHEN 'sponsorship'      THEN 'cash'
           WHEN 'national_brand'   THEN 'cash'
           ELSE 'other'
         END AS kind
  FROM public.proposals p
  WHERE p.opportunity_id IS NULL AND p.company_id IS NOT NULL
) s
WHERE NOT EXISTS (
  SELECT 1 FROM public.opportunities o
  WHERE o.company_id = s.company_id AND o.kind = s.kind AND o.created_by = 'migration-0059'
);

UPDATE public.proposals p
SET opportunity_id = o.id
FROM public.opportunities o
WHERE p.opportunity_id IS NULL
  AND o.company_id = p.company_id
  AND o.created_by = 'migration-0059'
  AND o.kind = CASE COALESCE(p.proposal_type, 'sponsorship')
        WHEN 'barter' THEN 'barter' WHEN 'mixed' THEN 'hybrid' WHEN 'lei_de_incentivo' THEN 'incentive'
        WHEN 'sponsorship' THEN 'cash' WHEN 'national_brand' THEN 'cash' ELSE 'other'
      END;

UPDATE public.contracts c
SET opportunity_id = p.opportunity_id
FROM public.proposals p
WHERE c.opportunity_id IS NULL AND c.proposal_id = p.id AND p.opportunity_id IS NOT NULL;

NOTIFY pgrst, 'reload schema';
