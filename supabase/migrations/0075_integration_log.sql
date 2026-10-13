-- Migration 0075: one health record, a log of every push, and who was allowed to trigger it, for the Pipedrive link.
--
--   external_refs (from 0069) already is the link between a record here and its ID in an outside system. This adds what kind
--   of outside object the ID is (deal, organization, person), so the next push uses a stored ID instead of searching
--   Pipedrive by name.
--
--   integration_health   one row per club and outside system: did it accept the key, when did a push last succeed, what was
--                        the last error. The three screens that show the connection all read this one record.
--   integration_actions  "ApprovedAction": who was allowed to trigger a push, and on what basis (a person approving a
--                        proposal, a person pressing sync, an agent run...). Written before the push. Never edited.
--   integration_events   "IntegrationEvent": what each call to the outside system did and how it ended. Never edited.
--
-- Additive only. The running app keeps working before and after this is applied. It copies no data.

ALTER TABLE public.external_refs ADD COLUMN IF NOT EXISTS external_type text;

-- ═══ health ═══════════════════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.integration_health (
  tenant_id       uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  system          text NOT NULL CHECK (length(btrim(system)) > 0),
  -- did the outside system accept the key: true or false once it has answered, null while that is not known
  key_accepted    boolean,
  key_checked_at  timestamptz,
  last_push_ok_at timestamptz,
  last_error      text,
  last_error_at   timestamptz,
  -- whether that error came from a push or from checking the key: a later good key check does not clear a failed push
  last_error_kind text CHECK (last_error_kind IS NULL OR last_error_kind IN ('push', 'check')),
  updated_at      timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (tenant_id, system)
);

-- ═══ who was allowed to trigger a push ════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.integration_actions (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  system          text NOT NULL CHECK (length(btrim(system)) > 0),
  operation       text NOT NULL CHECK (operation IN ('push', 'remove_link', 'log_activity', 'backfill')),
  entity_type     text NOT NULL CHECK (length(btrim(entity_type)) > 0),
  entity_id       text NOT NULL CHECK (length(btrim(entity_id)) > 0),
  basis           text NOT NULL CHECK (basis IN ('proposal_decision', 'proposal_status', 'proposal_created', 'company_created', 'manual_sync', 'scheduled_sync', 'retry', 'email_logged', 'sponsor_view', 'agent_run', 'record_deleted', 'backfill')),
  -- the thing that gave the permission: the approval, the run, the email
  basis_ref       text,
  authorized_kind text NOT NULL CHECK (authorized_kind IN ('human', 'agent', 'service')),
  authorized_by   text NOT NULL CHECK (length(btrim(authorized_by)) > 0),
  created_at      timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX IF NOT EXISTS idx_integration_actions_entity ON public.integration_actions (tenant_id, system, entity_type, entity_id, created_at DESC);

-- ═══ what each call did ═════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.integration_events (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  action_id     uuid NOT NULL REFERENCES public.integration_actions(id) ON DELETE CASCADE,
  system        text NOT NULL CHECK (length(btrim(system)) > 0),
  entity_type   text NOT NULL,
  entity_id     text NOT NULL,
  external_type text,
  external_id   text,
  operation     text NOT NULL CHECK (operation IN ('create', 'update', 'link_removed', 'log_activity', 'backfill', 'check_key')),
  outcome       text NOT NULL CHECK (outcome IN ('succeeded', 'failed', 'skipped')),
  http_status   integer,
  error         text,
  detail        jsonb NOT NULL DEFAULT '{}'::jsonb,
  duration_ms   integer,
  created_at    timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX IF NOT EXISTS idx_integration_events_recent ON public.integration_events (tenant_id, system, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_integration_events_entity ON public.integration_events (tenant_id, system, entity_type, entity_id, created_at DESC);

-- Both logs are append-only. They go only together with their club.
CREATE OR REPLACE FUNCTION public.integration_log_guard() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN RAISE EXCEPTION '% rows are immutable', TG_TABLE_NAME; END IF;
  IF EXISTS (SELECT 1 FROM public.tenants WHERE id = OLD.tenant_id) THEN RAISE EXCEPTION '% rows cannot be deleted', TG_TABLE_NAME; END IF;
  RETURN OLD;
END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS trg_integration_actions_guard ON public.integration_actions;
CREATE TRIGGER trg_integration_actions_guard BEFORE UPDATE OR DELETE ON public.integration_actions FOR EACH ROW EXECUTE FUNCTION public.integration_log_guard();
DROP TRIGGER IF EXISTS trg_integration_events_guard ON public.integration_events;
CREATE TRIGGER trg_integration_events_guard BEFORE UPDATE OR DELETE ON public.integration_events FOR EACH ROW EXECUTE FUNCTION public.integration_log_guard();

ALTER TABLE public.integration_health  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.integration_actions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.integration_events  ENABLE ROW LEVEL SECURITY;
DO $$
DECLARE
  tbl text;
BEGIN
  FOREACH tbl IN ARRAY ARRAY['integration_health', 'integration_actions', 'integration_events'] LOOP
    EXECUTE format('DROP POLICY IF EXISTS "service_all_%s" ON public.%I', tbl, tbl);
    EXECUTE format('CREATE POLICY "service_all_%s" ON public.%I FOR ALL TO service_role USING (true) WITH CHECK (true)', tbl, tbl);
  END LOOP;
END $$;

-- ═══ the IDs that already exist are NOT copied in here ════════════════════════════════════════════
-- Before this, a proposal's deal ID lived in a column (`proposals.pipedrive_deal_id`) or inside its JSON, and a company's
-- organization ID in `companies.pipedrive_org_id` or its intelligence JSON. A database cannot tell whether those IDs still
-- exist in Pipedrive, and checking showed they often do not: on 13 Oct 2026 none of the 44 stored deal IDs existed in the
-- club's Pipedrive (every one answered "not found"), while all 35 stored organization IDs did, 4 of them under a different
-- name. Copying them as links would have made every future push of those proposals fail. They are linked by a person,
-- after each one is checked against Pipedrive: POST /api/crm/link-existing (lib/pipedrive/link-existing.ts).

NOTIFY pgrst, 'reload schema';
