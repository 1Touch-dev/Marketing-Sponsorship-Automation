-- Migration 0068: company delivery statuses (Task 20).
--
-- A company's delivery status (no commitments, promised, scheduled, delivered, evidence accepted) and
-- whether it is at risk are DERIVED, in one place, from its contracts, obligations, proof, projects and
-- recap; they are not a field anyone sets. This table is only the history of what was derived:
--
--   company_status_log   append-only. A row is added when the derived status, the at-risk flag or the
--                        set of risk reasons CHANGES, with the counts behind it and what triggered the
--                        refresh. The newest row is the recorded status; the first row of the current
--                        run says since when. Nothing here can be edited.
--
-- Additive only. Until it is applied the statuses are still derived and shown, just without history.

CREATE TABLE IF NOT EXISTS public.company_status_log (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001'::uuid,
  company_id      uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  delivery_status text NOT NULL CHECK (delivery_status IN ('no_commitments', 'promised', 'scheduled', 'delivered', 'evidence_accepted')),
  at_risk         boolean NOT NULL,
  risk_reasons    jsonb NOT NULL DEFAULT '[]'::jsonb,
  counts          jsonb NOT NULL DEFAULT '{}'::jsonb,
  source          text NOT NULL CHECK (length(btrim(source)) > 0),
  created_at      timestamptz NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT company_status_log_reasons_chk CHECK (jsonb_typeof(risk_reasons) = 'array'),
  -- being at risk always comes with at least one named reason, and a reason always means at risk
  CONSTRAINT company_status_log_risk_chk CHECK (at_risk = (jsonb_array_length(risk_reasons) > 0))
);
CREATE INDEX IF NOT EXISTS idx_company_status_log_company ON public.company_status_log (tenant_id, company_id, created_at DESC);

CREATE OR REPLACE FUNCTION public.company_status_log_guard() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    RAISE EXCEPTION 'company_status_log rows are immutable';
  END IF;
  IF TG_OP = 'DELETE' THEN
    IF EXISTS (SELECT 1 FROM public.companies WHERE id = OLD.company_id) THEN
      RAISE EXCEPTION 'company_status_log rows cannot be deleted while their company exists';
    END IF;
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_company_status_log_guard ON public.company_status_log;
CREATE TRIGGER trg_company_status_log_guard
  BEFORE INSERT OR UPDATE OR DELETE ON public.company_status_log
  FOR EACH ROW EXECUTE FUNCTION public.company_status_log_guard();

ALTER TABLE public.company_status_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "service_all_company_status_log" ON public.company_status_log;
CREATE POLICY "service_all_company_status_log" ON public.company_status_log FOR ALL TO service_role USING (true) WITH CHECK (true);

NOTIFY pgrst, 'reload schema';
