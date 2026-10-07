-- Migration 0060: buyer brief and discovery gate (Task 12).
--
-- Before a proposal is generated, the platform needs a durable record of what
-- the buyer wants: objective, period, point of contact and next action (the
-- discovery gate). A full brief adds the research: why this sponsor, why this
-- package, cited evidence, and an explicit list of what is still unverified.
--
--   quick  the four discovery fields, written by a person
--   full   the quick fields plus why-sponsor, why-package and at least one citation
--
-- A brief is written by a person (author_email is mandatory) because the buyer's
-- objective has to come from a conversation, not from a model. Agent research
-- stays in company_research (Task 10). Briefs are append-only: a new brief
-- supersedes the last, and the proposal records which brief backed it.
--
-- Additive only.

CREATE TABLE IF NOT EXISTS public.proposal_briefs (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        uuid NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001'::uuid,
  company_id       uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  opportunity_id   uuid REFERENCES public.opportunities(id) ON DELETE SET NULL,
  level            text NOT NULL CHECK (level IN ('quick', 'full')),
  author_email     text NOT NULL,
  objective        text NOT NULL CHECK (length(btrim(objective)) > 0),
  period_start     date NOT NULL,
  period_end       date NOT NULL,
  contact_name     text NOT NULL CHECK (length(btrim(contact_name)) > 0),
  contact_email    text,
  next_action      text NOT NULL CHECK (length(btrim(next_action)) > 0),
  next_action_due  date,
  why_sponsor      text,
  why_package      text,
  evidence         jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(evidence) = 'array'),
  unverified       jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(unverified) = 'array'),
  research_id      uuid REFERENCES public.company_research(id) ON DELETE SET NULL,
  created_at       timestamptz NOT NULL DEFAULT now(),
  CHECK (period_end >= period_start),
  CHECK (
    level = 'quick'
    OR (
      why_sponsor IS NOT NULL AND length(btrim(why_sponsor)) > 0
      AND why_package IS NOT NULL AND length(btrim(why_package)) > 0
      AND jsonb_array_length(evidence) >= 1
    )
  )
);
CREATE INDEX IF NOT EXISTS idx_proposal_briefs_company ON public.proposal_briefs (company_id, created_at DESC);

CREATE OR REPLACE FUNCTION public.proposal_briefs_immutable() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    RAISE EXCEPTION 'proposal_briefs rows are immutable; write a new brief instead';
  END IF;
  IF TG_OP = 'DELETE' THEN
    IF EXISTS (SELECT 1 FROM public.companies WHERE id = OLD.company_id) THEN
      RAISE EXCEPTION 'proposal_briefs rows cannot be deleted while their company exists';
    END IF;
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_proposal_briefs_immutable ON public.proposal_briefs;
CREATE TRIGGER trg_proposal_briefs_immutable
  BEFORE UPDATE OR DELETE ON public.proposal_briefs
  FOR EACH ROW EXECUTE FUNCTION public.proposal_briefs_immutable();

ALTER TABLE public.proposal_briefs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "service_all_proposal_briefs" ON public.proposal_briefs;
CREATE POLICY "service_all_proposal_briefs" ON public.proposal_briefs
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Which brief a proposal was generated from.
ALTER TABLE public.proposals ADD COLUMN IF NOT EXISTS brief_id uuid REFERENCES public.proposal_briefs(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_proposals_brief ON public.proposals (brief_id) WHERE brief_id IS NOT NULL;

NOTIFY pgrst, 'reload schema';
