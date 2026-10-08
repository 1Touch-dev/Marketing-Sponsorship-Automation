-- Migration 0063: commercial and delivery projects (Task 15).
--
-- One project schema, two types with different rules:
--
--   commercial   the sales side of one opportunity. Needs the opportunity, an
--                objective, a target date and a next action. Completes only when the
--                deal has an outcome (won, lost or closed) and the outcome is written down.
--   delivery     the fulfilment side of one signed contract. Needs the contract and a
--                delivery period. Completes only when every delivery task is done and
--                the period has ended (or someone says why it ends early).
--
-- A project's status (planned, active, on hold, completed, cancelled) is derived from
-- its append-only events, never stored. Its core fields cannot be changed after it is
-- created: moving a date is a separate, recorded act (Task 17). The external reference
-- points at whatever system runs the day-to-day tasks (Pipedrive, Plane, ...), so the
-- sponsorship domain stays canonical whichever is chosen.
--
-- Additive only. No existing data is converted: a project is an explicit act, and the
-- contract-to-obligation handoff (Task 16) is what creates delivery projects.

CREATE TABLE IF NOT EXISTS public.projects (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001'::uuid,
  project_type    text NOT NULL CHECK (project_type IN ('commercial', 'delivery')),
  title           text NOT NULL CHECK (length(btrim(title)) > 0),
  description     text,
  company_id      uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  opportunity_id  uuid REFERENCES public.opportunities(id),
  proposal_id     uuid REFERENCES public.proposals(id) ON DELETE SET NULL,
  contract_id     uuid REFERENCES public.contracts(id),
  owner_email     text NOT NULL CHECK (length(btrim(owner_email)) > 0),
  created_by      text NOT NULL,
  -- commercial fields
  objective       text,
  target_date     date,
  next_action     text,
  -- delivery fields
  period_start    date,
  period_end      date,
  -- where the day-to-day tasks live, if anywhere
  external_system text,
  external_id     text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),

  -- Each type must carry its own required fields...
  CONSTRAINT projects_commercial_fields_chk CHECK (
    project_type <> 'commercial'
    OR (opportunity_id IS NOT NULL
        AND objective IS NOT NULL AND length(btrim(objective)) > 0
        AND target_date IS NOT NULL
        AND next_action IS NOT NULL AND length(btrim(next_action)) > 0)
  ),
  CONSTRAINT projects_delivery_fields_chk CHECK (
    project_type <> 'delivery'
    OR (contract_id IS NOT NULL AND period_start IS NOT NULL AND period_end IS NOT NULL AND period_end >= period_start)
  ),
  -- ...and must not carry the other type's.
  CONSTRAINT projects_commercial_only_chk CHECK (
    project_type <> 'commercial' OR (contract_id IS NULL AND period_start IS NULL AND period_end IS NULL)
  ),
  CONSTRAINT projects_delivery_only_chk CHECK (
    project_type <> 'delivery' OR (objective IS NULL AND target_date IS NULL AND next_action IS NULL)
  ),
  CONSTRAINT projects_external_pair_chk CHECK ((external_system IS NULL) = (external_id IS NULL))
);

CREATE INDEX IF NOT EXISTS idx_projects_company ON public.projects (tenant_id, company_id);
CREATE INDEX IF NOT EXISTS idx_projects_opportunity ON public.projects (opportunity_id) WHERE opportunity_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_projects_contract ON public.projects (contract_id) WHERE contract_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_projects_external ON public.projects (tenant_id, external_system, external_id) WHERE external_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.project_events (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    uuid NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001'::uuid,
  project_id   uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  event_type   text NOT NULL CHECK (event_type IN ('started', 'paused', 'resumed', 'completed', 'cancelled')),
  reason       text,
  outcome_note text,
  actor_email  text NOT NULL CHECK (length(btrim(actor_email)) > 0),
  created_at   timestamptz NOT NULL DEFAULT now(),
  CHECK (event_type NOT IN ('paused', 'cancelled') OR (reason IS NOT NULL AND length(btrim(reason)) > 4))
);
CREATE INDEX IF NOT EXISTS idx_project_events_project ON public.project_events (project_id, created_at DESC);

-- Only the day-to-day fields of a project can change; everything that defines it is fixed.
CREATE OR REPLACE FUNCTION public.projects_guard() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF EXISTS (SELECT 1 FROM public.companies WHERE id = OLD.company_id) THEN
      RAISE EXCEPTION 'projects cannot be deleted while their company exists';
    END IF;
    RETURN OLD;
  END IF;
  IF NEW.project_type IS DISTINCT FROM OLD.project_type OR NEW.company_id IS DISTINCT FROM OLD.company_id
     OR NEW.opportunity_id IS DISTINCT FROM OLD.opportunity_id
     -- the proposal link may only be cleared (ON DELETE SET NULL when the proposal is removed), never re-pointed
     OR (NEW.proposal_id IS DISTINCT FROM OLD.proposal_id AND NEW.proposal_id IS NOT NULL)
     OR NEW.contract_id IS DISTINCT FROM OLD.contract_id OR NEW.objective IS DISTINCT FROM OLD.objective
     OR NEW.target_date IS DISTINCT FROM OLD.target_date OR NEW.period_start IS DISTINCT FROM OLD.period_start
     OR NEW.period_end IS DISTINCT FROM OLD.period_end OR NEW.created_by IS DISTINCT FROM OLD.created_by
     OR NEW.tenant_id IS DISTINCT FROM OLD.tenant_id OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'a project''s type, links and dates cannot be changed after it is created';
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_projects_guard ON public.projects;
CREATE TRIGGER trg_projects_guard
  BEFORE UPDATE OR DELETE ON public.projects
  FOR EACH ROW EXECUTE FUNCTION public.projects_guard();

CREATE OR REPLACE FUNCTION public.project_events_immutable() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    RAISE EXCEPTION 'project_events rows are immutable';
  END IF;
  IF TG_OP = 'DELETE' THEN
    IF EXISTS (SELECT 1 FROM public.projects WHERE id = OLD.project_id) THEN
      RAISE EXCEPTION 'project_events rows cannot be deleted while their project exists';
    END IF;
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_project_events_immutable ON public.project_events;
CREATE TRIGGER trg_project_events_immutable
  BEFORE UPDATE OR DELETE ON public.project_events
  FOR EACH ROW EXECUTE FUNCTION public.project_events_immutable();

ALTER TABLE public.projects       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "service_all_projects" ON public.projects;
CREATE POLICY "service_all_projects" ON public.projects FOR ALL TO service_role USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "service_all_project_events" ON public.project_events;
CREATE POLICY "service_all_project_events" ON public.project_events FOR ALL TO service_role USING (true) WITH CHECK (true);

NOTIFY pgrst, 'reload schema';
