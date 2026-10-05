-- Migration 0052: immutable proposal revisions + frozen quote-line terms (Task 3).
--
-- Additive only: every change is a new column or a new table, so the running
-- app keeps working before and after this is applied.

-- 1. Quote-line terms that were not captured anywhere before.
ALTER TABLE public.proposal_inventory_items
  ADD COLUMN IF NOT EXISTS tax_treatment text NOT NULL DEFAULT 'unspecified'
    CHECK (tax_treatment IN ('unspecified', 'tax_inclusive', 'tax_exclusive')),
  ADD COLUMN IF NOT EXISTS discount_pct numeric(5,2)
    CHECK (discount_pct IS NULL OR (discount_pct >= 0 AND discount_pct <= 100)),
  ADD COLUMN IF NOT EXISTS discount_authorized_by uuid,
  ADD COLUMN IF NOT EXISTS period_label text;

-- 2. Immutable revisions: a frozen copy of the commercial terms, with a checksum.
CREATE TABLE IF NOT EXISTS public.proposal_revisions (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001'::uuid,
  proposal_id     uuid NOT NULL REFERENCES public.proposals(id) ON DELETE CASCADE,
  revision_number integer NOT NULL,
  content         jsonb NOT NULL,
  lines           jsonb NOT NULL DEFAULT '[]'::jsonb,
  total_brl       numeric(14,2) NOT NULL DEFAULT 0,
  currency        text NOT NULL DEFAULT 'BRL',
  checksum        text NOT NULL,
  reason          text,
  created_by      uuid,
  created_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (proposal_id, revision_number)
);

CREATE INDEX IF NOT EXISTS idx_proposal_revisions_proposal
  ON public.proposal_revisions (proposal_id, revision_number DESC);

-- Rows can never be edited. They can only disappear together with their
-- proposal (the cascade runs after the proposal row is already gone).
CREATE OR REPLACE FUNCTION public.proposal_revisions_immutable() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    RAISE EXCEPTION 'proposal_revisions rows are immutable';
  END IF;
  IF TG_OP = 'DELETE' THEN
    IF EXISTS (SELECT 1 FROM public.proposals WHERE id = OLD.proposal_id) THEN
      RAISE EXCEPTION 'proposal_revisions rows cannot be deleted while their proposal exists';
    END IF;
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_proposal_revisions_immutable ON public.proposal_revisions;
CREATE TRIGGER trg_proposal_revisions_immutable
  BEFORE UPDATE OR DELETE ON public.proposal_revisions
  FOR EACH ROW EXECUTE FUNCTION public.proposal_revisions_immutable();

ALTER TABLE public.proposal_revisions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "service_all_proposal_revisions" ON public.proposal_revisions;
CREATE POLICY "service_all_proposal_revisions" ON public.proposal_revisions
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- 3. Bind approvals to the exact revision that was approved.
ALTER TABLE public.proposals
  ADD COLUMN IF NOT EXISTS approved_revision_id uuid
    REFERENCES public.proposal_revisions(id) ON DELETE SET NULL;

ALTER TABLE public.approvals
  ADD COLUMN IF NOT EXISTS revision_id uuid
    REFERENCES public.proposal_revisions(id) ON DELETE SET NULL;

NOTIFY pgrst, 'reload schema';
