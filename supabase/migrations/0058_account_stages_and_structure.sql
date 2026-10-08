-- Migration 0058: three account stages and company structure (Task 10).
--
-- A directory organization, a researched prospect and a qualified sales
-- opportunity are three different things:
--
--   directory   an organization the platform knows about; nobody has researched it
--   researched  a cited research record reached a conclusion (pursue, park or
--               not_a_fit); 'needs_more_research' keeps the trail but does not count
--   qualified   a PERSON decided it is a real sales opportunity
--
-- The stage is derived from facts, never set: company_research rows (cited
-- evidence is mandatory) and company_qualifications rows (a human actor is
-- mandatory). Agents can write research; they cannot qualify, because the
-- actor_kind of a qualification can only be 'human' or the one-off
-- 'grandfathered' used below.
--
-- Structure: a parent and its subsidiary are two accounts linked by
-- parent_company_id, never merged just because the names look alike; the CNPJ
-- root (first 8 digits) identifies one legal entity; duplicate_of_id marks a
-- record as the same entity as another without deleting anything.
--
-- Additive only.

-- 1. Structure columns on companies.
ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS parent_company_id     uuid REFERENCES public.companies(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS relationship_to_parent text,
  ADD COLUMN IF NOT EXISTS cnpj                  text,
  ADD COLUMN IF NOT EXISTS duplicate_of_id       uuid REFERENCES public.companies(id) ON DELETE SET NULL;

ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS cnpj_root text GENERATED ALWAYS AS (left(cnpj, 8)) STORED;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'companies_relationship_to_parent_chk') THEN
    ALTER TABLE public.companies ADD CONSTRAINT companies_relationship_to_parent_chk
      CHECK (relationship_to_parent IS NULL OR relationship_to_parent IN ('subsidiary', 'division', 'operation', 'brand', 'branch'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'companies_parent_not_self_chk') THEN
    ALTER TABLE public.companies ADD CONSTRAINT companies_parent_not_self_chk
      CHECK (parent_company_id IS NULL OR parent_company_id <> id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'companies_duplicate_not_self_chk') THEN
    ALTER TABLE public.companies ADD CONSTRAINT companies_duplicate_not_self_chk
      CHECK (duplicate_of_id IS NULL OR duplicate_of_id <> id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'companies_cnpj_digits_chk') THEN
    ALTER TABLE public.companies ADD CONSTRAINT companies_cnpj_digits_chk
      CHECK (cnpj IS NULL OR cnpj ~ '^[0-9]{14}$');
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_companies_cnpj_root ON public.companies (tenant_id, cnpj_root) WHERE cnpj_root IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_companies_parent    ON public.companies (tenant_id, parent_company_id) WHERE parent_company_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_companies_domain    ON public.companies (tenant_id, domain) WHERE domain IS NOT NULL;

-- 2. Cited research. At least one evidence item is required: research without a
--    citation is not a research record.
CREATE TABLE IF NOT EXISTS public.company_research (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        uuid NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001'::uuid,
  company_id       uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  authored_by_kind text NOT NULL CHECK (authored_by_kind IN ('agent', 'human')),
  authored_by      text NOT NULL,
  summary          text NOT NULL,
  recommendation   text NOT NULL CHECK (recommendation IN ('pursue', 'park', 'not_a_fit', 'needs_more_research')),
  evidence         jsonb NOT NULL CHECK (jsonb_typeof(evidence) = 'array' AND jsonb_array_length(evidence) >= 1),
  unverified       jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(unverified) = 'array'),
  created_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_company_research_company ON public.company_research (company_id, created_at DESC);

-- 3. Human qualification. 'grandfathered' exists only for the backfill below.
CREATE TABLE IF NOT EXISTS public.company_qualifications (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id          uuid NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001'::uuid,
  company_id         uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  decision           text NOT NULL CHECK (decision IN ('qualified', 'disqualified', 'revoked')),
  actor_kind         text NOT NULL CHECK (actor_kind IN ('human', 'grandfathered')),
  qualified_by_email text NOT NULL,
  qualified_by_user  uuid,
  reason             text NOT NULL,
  research_id        uuid REFERENCES public.company_research(id) ON DELETE SET NULL,
  created_at         timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_company_qualifications_company ON public.company_qualifications (company_id, created_at DESC);

-- 4. Append-only: no edits, and no deletes unless the company itself is gone.
CREATE OR REPLACE FUNCTION public.company_stage_ledger_immutable() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    RAISE EXCEPTION '% rows are immutable', TG_TABLE_NAME;
  END IF;
  IF TG_OP = 'DELETE' THEN
    IF EXISTS (SELECT 1 FROM public.companies WHERE id = OLD.company_id) THEN
      RAISE EXCEPTION '% rows cannot be deleted while their company exists', TG_TABLE_NAME;
    END IF;
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_company_research_immutable ON public.company_research;
CREATE TRIGGER trg_company_research_immutable
  BEFORE UPDATE OR DELETE ON public.company_research
  FOR EACH ROW EXECUTE FUNCTION public.company_stage_ledger_immutable();

DROP TRIGGER IF EXISTS trg_company_qualifications_immutable ON public.company_qualifications;
CREATE TRIGGER trg_company_qualifications_immutable
  BEFORE UPDATE OR DELETE ON public.company_qualifications
  FOR EACH ROW EXECUTE FUNCTION public.company_stage_ledger_immutable();

ALTER TABLE public.company_research       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.company_qualifications ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "service_all_company_research" ON public.company_research;
CREATE POLICY "service_all_company_research" ON public.company_research
  FOR ALL TO service_role USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "service_all_company_qualifications" ON public.company_qualifications;
CREATE POLICY "service_all_company_qualifications" ON public.company_qualifications
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- 5. The stage, derived. Newest research and newest qualification decide.
--    security_invoker plus the REVOKE keep this view from exposing company
--    rows through the public API (a view runs with its owner's rights otherwise).
CREATE OR REPLACE VIEW public.company_account_stage
  WITH (security_invoker = true) AS
SELECT
  c.id        AS company_id,
  c.tenant_id AS tenant_id,
  CASE
    WHEN q.decision = 'qualified' THEN 'qualified'
    WHEN r.id IS NOT NULL AND r.recommendation <> 'needs_more_research' THEN 'researched'
    ELSE 'directory'
  END                  AS stage,
  r.id                 AS research_id,
  r.created_at         AS researched_at,
  r.recommendation     AS recommendation,
  q.id                 AS qualification_id,
  q.decision           AS qualification_decision,
  q.actor_kind         AS qualified_actor_kind,
  q.created_at         AS qualification_at
FROM public.companies c
LEFT JOIN LATERAL (
  SELECT * FROM public.company_research x WHERE x.company_id = c.id ORDER BY x.created_at DESC LIMIT 1
) r ON true
LEFT JOIN LATERAL (
  SELECT * FROM public.company_qualifications y WHERE y.company_id = c.id ORDER BY y.created_at DESC LIMIT 1
) q ON true;

REVOKE ALL ON public.company_account_stage FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.company_account_stage TO service_role;

-- 6. Backfill. An account that already has a proposal, a contract or an advanced
--    pipeline stage was worked by a person before this model existed, so it is
--    recorded as qualified, labelled 'grandfathered' so it is never mistaken for
--    a fresh human decision. Competitors are not sales opportunities.
INSERT INTO public.company_qualifications (tenant_id, company_id, decision, actor_kind, qualified_by_email, reason)
SELECT c.tenant_id, c.id, 'qualified', 'grandfathered', 'migration-0058',
       'Already had a proposal, a contract or an advanced pipeline stage before the three-stage model existed.'
FROM public.companies c
WHERE c.status::text <> 'competitor'
  AND COALESCE(c.pipeline_stage, '') <> 'competitor'
  AND (
    EXISTS (SELECT 1 FROM public.proposals p WHERE p.company_id = c.id)
    OR EXISTS (SELECT 1 FROM public.contracts k WHERE k.company_id = c.id)
    OR c.pipeline_stage IN ('qualified', 'diagnosis', 'prepare_proposal', 'proposal_sent', 'negotiation', 'closed_won')
  )
  AND NOT EXISTS (SELECT 1 FROM public.company_qualifications q WHERE q.company_id = c.id);

NOTIFY pgrst, 'reload schema';
