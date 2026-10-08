-- Migration 0064: contract-to-obligation handoff (Task 16).
--
-- A signed commitment used to end as a loose checklist stored inside the proposal's JSON:
-- no owner, no due date, no proof, and nothing to say which part of the contract each item
-- came from. An obligation is one thing the club has promised the sponsor, with:
--
--   a contract and (for sold inventory) an allocation it came from
--   an owner, and the rule that chose the owner
--   a due date, and the rule that chose the date
--   an append-only history of delivery, proof, acceptance, waiver and reopening
--
-- Its status (open, delivered, evidenced, accepted, waived) is derived from that history and
-- never stored. The handoff is idempotent: (contract_id, source_key) is unique, so running it
-- twice cannot double the work. What defines an obligation cannot change afterwards; moving a
-- date is a recorded act (Task 17). Obligations stay canonical here whichever outside task tool
-- is chosen (X-13); a project may point at them but does not own them.
--
-- Additive only. Nothing is converted automatically: the handoff runs when a contract is
-- created, or on request for an existing one.

CREATE TABLE IF NOT EXISTS public.obligations (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001'::uuid,
  contract_id   uuid NOT NULL REFERENCES public.contracts(id),
  company_id    uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  project_id    uuid REFERENCES public.projects(id) ON DELETE SET NULL,
  allocation_id uuid,
  -- stable identity of the commitment inside its contract, so a rerun finds what it already made
  source_key    text NOT NULL CHECK (length(btrim(source_key)) > 0),
  kind          text NOT NULL CHECK (kind IN ('deliverable', 'onboarding')),
  title         text NOT NULL CHECK (length(btrim(title)) > 0),
  description   text,
  quantity      integer CHECK (quantity IS NULL OR quantity > 0),
  unit          text,
  due_date      date NOT NULL,
  due_basis     text NOT NULL CHECK (length(btrim(due_basis)) > 0),
  owner_email   text NOT NULL CHECK (length(btrim(owner_email)) > 0),
  owner_basis   text NOT NULL CHECK (owner_basis IN ('opportunity_owner', 'handoff_actor', 'tenant_admin', 'assigned')),
  created_by    text NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_obligations_source UNIQUE (contract_id, source_key)
);
CREATE INDEX IF NOT EXISTS idx_obligations_company ON public.obligations (tenant_id, company_id);
CREATE INDEX IF NOT EXISTS idx_obligations_project ON public.obligations (project_id) WHERE project_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_obligations_owner ON public.obligations (tenant_id, owner_email, due_date);

CREATE TABLE IF NOT EXISTS public.obligation_events (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001'::uuid,
  obligation_id uuid NOT NULL REFERENCES public.obligations(id) ON DELETE CASCADE,
  event_type    text NOT NULL CHECK (event_type IN ('delivered', 'evidenced', 'accepted', 'waived', 'reopened')),
  -- proof of delivery: a link, an uploaded file, or a person's written statement
  evidence_kind text CHECK (evidence_kind IN ('link', 'file', 'statement')),
  evidence_ref  text,
  note          text,
  reason        text,
  actor_email   text NOT NULL CHECK (length(btrim(actor_email)) > 0),
  created_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT obligation_events_evidence_chk CHECK (
    event_type <> 'evidenced'
    OR (evidence_kind IS NOT NULL AND evidence_ref IS NOT NULL AND length(btrim(evidence_ref)) > 0
        AND (evidence_kind <> 'statement' OR length(btrim(evidence_ref)) >= 20))
  ),
  CONSTRAINT obligation_events_reason_chk CHECK (
    event_type NOT IN ('waived', 'reopened') OR (reason IS NOT NULL AND length(btrim(reason)) > 4)
  )
);
CREATE INDEX IF NOT EXISTS idx_obligation_events_obligation ON public.obligation_events (obligation_id, created_at DESC);

-- What defines an obligation is fixed; who owns it, its wording and the project it sits under are not.
CREATE OR REPLACE FUNCTION public.obligations_guard() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF EXISTS (SELECT 1 FROM public.companies WHERE id = OLD.company_id) THEN
      RAISE EXCEPTION 'obligations cannot be deleted while their company exists';
    END IF;
    RETURN OLD;
  END IF;
  IF NEW.contract_id IS DISTINCT FROM OLD.contract_id OR NEW.company_id IS DISTINCT FROM OLD.company_id
     OR NEW.allocation_id IS DISTINCT FROM OLD.allocation_id OR NEW.source_key IS DISTINCT FROM OLD.source_key
     OR NEW.kind IS DISTINCT FROM OLD.kind OR NEW.title IS DISTINCT FROM OLD.title
     OR NEW.quantity IS DISTINCT FROM OLD.quantity OR NEW.unit IS DISTINCT FROM OLD.unit
     OR NEW.due_date IS DISTINCT FROM OLD.due_date OR NEW.due_basis IS DISTINCT FROM OLD.due_basis
     OR NEW.created_by IS DISTINCT FROM OLD.created_by OR NEW.tenant_id IS DISTINCT FROM OLD.tenant_id
     OR NEW.created_at IS DISTINCT FROM OLD.created_at
     -- the project link may be set once, or cleared when its project is removed, never re-pointed
     OR (OLD.project_id IS NOT NULL AND NEW.project_id IS NOT NULL AND NEW.project_id IS DISTINCT FROM OLD.project_id) THEN
    RAISE EXCEPTION 'an obligation''s contract, wording, quantity and due date cannot be changed after it is created';
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_obligations_guard ON public.obligations;
CREATE TRIGGER trg_obligations_guard
  BEFORE UPDATE OR DELETE ON public.obligations
  FOR EACH ROW EXECUTE FUNCTION public.obligations_guard();

-- Events are a ledger. A person cannot accept work they marked delivered themselves.
CREATE OR REPLACE FUNCTION public.obligation_events_guard() RETURNS trigger AS $$
DECLARE
  last_deliverer text;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    RAISE EXCEPTION 'obligation_events rows are immutable';
  END IF;
  IF TG_OP = 'DELETE' THEN
    IF EXISTS (SELECT 1 FROM public.obligations WHERE id = OLD.obligation_id) THEN
      RAISE EXCEPTION 'obligation_events rows cannot be deleted while their obligation exists';
    END IF;
    RETURN OLD;
  END IF;
  -- INSERT
  IF NEW.event_type = 'accepted' THEN
    SELECT actor_email INTO last_deliverer FROM public.obligation_events
      WHERE obligation_id = NEW.obligation_id AND event_type IN ('delivered', 'evidenced')
      ORDER BY created_at DESC LIMIT 1;
    IF last_deliverer IS NOT NULL AND lower(last_deliverer) = lower(NEW.actor_email) THEN
      RAISE EXCEPTION 'a different person has to accept delivery than the one who recorded it';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_obligation_events_guard ON public.obligation_events;
CREATE TRIGGER trg_obligation_events_guard
  BEFORE INSERT OR UPDATE OR DELETE ON public.obligation_events
  FOR EACH ROW EXECUTE FUNCTION public.obligation_events_guard();

ALTER TABLE public.obligations       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.obligation_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "service_all_obligations" ON public.obligations;
CREATE POLICY "service_all_obligations" ON public.obligations FOR ALL TO service_role USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "service_all_obligation_events" ON public.obligation_events;
CREATE POLICY "service_all_obligation_events" ON public.obligation_events FOR ALL TO service_role USING (true) WITH CHECK (true);

NOTIFY pgrst, 'reload schema';
