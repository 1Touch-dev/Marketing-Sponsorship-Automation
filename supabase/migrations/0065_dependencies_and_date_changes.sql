-- Migration 0065: dependencies between obligations and recorded date changes (Task 17).
--
-- Obligations (0064) and projects (0063) have fixed dates. Real delivery moves: a kickoff slips,
-- a match is rescheduled. Until now a date could only be wrong or immutable. Two additions:
--
--   obligation_dependencies   "this cannot finish before that": one obligation waits on another
--                             in the same contract. A dependency is ended, never deleted, and
--                             cannot create a loop.
--   date_changes              an append-only ledger of every move of a date: what it was, what
--                             it became, who moved it, why, and which downstream work and owners
--                             were affected at that moment. The date in force is the latest
--                             change, else the original; the original is never overwritten.
--
-- Additive only. Existing obligations and projects keep their dates and have no dependencies
-- until the handoff (re-run on a contract) or a person adds them.

CREATE TABLE IF NOT EXISTS public.obligation_dependencies (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      uuid NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001'::uuid,
  contract_id    uuid NOT NULL REFERENCES public.contracts(id),
  obligation_id  uuid NOT NULL REFERENCES public.obligations(id) ON DELETE CASCADE,
  predecessor_id uuid NOT NULL REFERENCES public.obligations(id) ON DELETE CASCADE,
  basis          text NOT NULL CHECK (basis IN ('standard', 'manual')),
  created_by     text NOT NULL,
  created_at     timestamptz NOT NULL DEFAULT now(),
  removed_at     timestamptz,
  removed_by     text,
  removed_reason text,
  CHECK (obligation_id <> predecessor_id),
  CHECK ((removed_at IS NULL) = (removed_by IS NULL)),
  CHECK (removed_at IS NULL OR (removed_reason IS NOT NULL AND length(btrim(removed_reason)) > 4))
);
-- one live dependency per pair; an ended one may be added again later
CREATE UNIQUE INDEX IF NOT EXISTS uq_obligation_dependencies_live ON public.obligation_dependencies (obligation_id, predecessor_id) WHERE removed_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_obligation_dependencies_contract ON public.obligation_dependencies (contract_id);
CREATE INDEX IF NOT EXISTS idx_obligation_dependencies_pred ON public.obligation_dependencies (predecessor_id);

CREATE OR REPLACE FUNCTION public.obligation_dependencies_guard() RETURNS trigger AS $$
DECLARE
  a record;
  b record;
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF EXISTS (SELECT 1 FROM public.obligations WHERE id = OLD.obligation_id) THEN
      RAISE EXCEPTION 'obligation_dependencies rows cannot be deleted while their obligation exists';
    END IF;
    RETURN OLD;
  END IF;
  IF TG_OP = 'UPDATE' THEN
    IF OLD.removed_at IS NOT NULL THEN
      RAISE EXCEPTION 'this dependency has already been ended';
    END IF;
    IF NEW.removed_at IS NULL OR NEW.obligation_id IS DISTINCT FROM OLD.obligation_id OR NEW.predecessor_id IS DISTINCT FROM OLD.predecessor_id
       OR NEW.contract_id IS DISTINCT FROM OLD.contract_id OR NEW.basis IS DISTINCT FROM OLD.basis OR NEW.created_by IS DISTINCT FROM OLD.created_by
       OR NEW.tenant_id IS DISTINCT FROM OLD.tenant_id OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
      RAISE EXCEPTION 'a dependency can only be ended; its history cannot be changed';
    END IF;
    RETURN NEW;
  END IF;
  -- INSERT: both obligations belong to the same contract and tenant, and the new link makes no loop.
  SELECT contract_id, tenant_id INTO a FROM public.obligations WHERE id = NEW.obligation_id;
  SELECT contract_id, tenant_id INTO b FROM public.obligations WHERE id = NEW.predecessor_id;
  IF a.contract_id IS NULL OR b.contract_id IS NULL OR a.contract_id <> b.contract_id OR a.contract_id <> NEW.contract_id
     OR a.tenant_id <> NEW.tenant_id OR b.tenant_id <> NEW.tenant_id THEN
    RAISE EXCEPTION 'a dependency links two obligations of the same contract';
  END IF;
  IF EXISTS (
    WITH RECURSIVE walk(id) AS (
      SELECT NEW.predecessor_id
      UNION
      SELECT d.predecessor_id FROM public.obligation_dependencies d JOIN walk w ON d.obligation_id = w.id WHERE d.removed_at IS NULL
    )
    SELECT 1 FROM walk WHERE id = NEW.obligation_id
  ) THEN
    RAISE EXCEPTION 'this dependency would make the work wait on itself';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_obligation_dependencies_guard ON public.obligation_dependencies;
CREATE TRIGGER trg_obligation_dependencies_guard
  BEFORE INSERT OR UPDATE OR DELETE ON public.obligation_dependencies
  FOR EACH ROW EXECUTE FUNCTION public.obligation_dependencies_guard();

-- Every move of a date. subject_id points at an obligation or a project (no foreign key, as it is
-- one of two tables); company_id ties the row to the account and clears it when the account goes.
CREATE TABLE IF NOT EXISTS public.date_changes (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        uuid NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001'::uuid,
  company_id       uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  subject_kind     text NOT NULL CHECK (subject_kind IN ('obligation', 'project')),
  subject_id       uuid NOT NULL,
  field            text NOT NULL CHECK (field IN ('due_date', 'period_start', 'period_end', 'target_date')),
  old_value        date NOT NULL,
  new_value        date NOT NULL,
  reason           text NOT NULL CHECK (length(btrim(reason)) > 4),
  changed_by       text NOT NULL CHECK (length(btrim(changed_by)) > 0),
  -- set when this move was made automatically to keep downstream work after the one that moved
  parent_change_id uuid REFERENCES public.date_changes(id),
  -- the downstream work and owners affected, as they were when the date moved
  impact           jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at       timestamptz NOT NULL DEFAULT clock_timestamp(),
  CHECK (old_value <> new_value),
  CHECK ((subject_kind = 'obligation' AND field = 'due_date') OR (subject_kind = 'project' AND field IN ('period_start', 'period_end', 'target_date')))
);
CREATE INDEX IF NOT EXISTS idx_date_changes_subject ON public.date_changes (subject_kind, subject_id, field, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_date_changes_company ON public.date_changes (tenant_id, company_id, created_at DESC);

CREATE OR REPLACE FUNCTION public.date_changes_guard() RETURNS trigger AS $$
DECLARE
  current_value date;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    RAISE EXCEPTION 'date_changes rows are immutable';
  END IF;
  IF TG_OP = 'DELETE' THEN
    IF EXISTS (SELECT 1 FROM public.companies WHERE id = OLD.company_id) THEN
      RAISE EXCEPTION 'date_changes rows cannot be deleted while their company exists';
    END IF;
    RETURN OLD;
  END IF;
  -- INSERT: a move starts from the date in force, so two people cannot both "move it from" a stale date.
  SELECT new_value INTO current_value FROM public.date_changes
    WHERE subject_kind = NEW.subject_kind AND subject_id = NEW.subject_id AND field = NEW.field
    ORDER BY created_at DESC, id DESC LIMIT 1;
  IF current_value IS NULL THEN
    IF NEW.subject_kind = 'obligation' THEN
      SELECT due_date INTO current_value FROM public.obligations WHERE id = NEW.subject_id AND company_id = NEW.company_id;
    ELSE
      SELECT CASE NEW.field WHEN 'period_start' THEN period_start WHEN 'period_end' THEN period_end ELSE target_date END
        INTO current_value FROM public.projects WHERE id = NEW.subject_id AND company_id = NEW.company_id;
    END IF;
  END IF;
  IF current_value IS NULL THEN
    RAISE EXCEPTION 'that date does not exist for this record';
  END IF;
  IF current_value <> NEW.old_value THEN
    RAISE EXCEPTION 'the date has already moved: it is % now, not %', current_value, NEW.old_value;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_date_changes_guard ON public.date_changes;
CREATE TRIGGER trg_date_changes_guard
  BEFORE INSERT OR UPDATE OR DELETE ON public.date_changes
  FOR EACH ROW EXECUTE FUNCTION public.date_changes_guard();

ALTER TABLE public.obligation_dependencies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.date_changes            ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "service_all_obligation_dependencies" ON public.obligation_dependencies;
CREATE POLICY "service_all_obligation_dependencies" ON public.obligation_dependencies FOR ALL TO service_role USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "service_all_date_changes" ON public.date_changes;
CREATE POLICY "service_all_date_changes" ON public.date_changes FOR ALL TO service_role USING (true) WITH CHECK (true);

NOTIFY pgrst, 'reload schema';
