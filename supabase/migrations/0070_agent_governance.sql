-- Migration 0070: agent governance and batch gating (Tasks 25, 26, 27, 28, 29).
--
-- TASK 26  an agent is a registered definition with immutable versions. A version is promoted with evidence
--          and retired with a reason. An ASSIGNMENT gives an agent authority over a stated scope (all companies,
--          one company, one campaign), for stated effects, up to a stated cost, until it is revoked or expires.
--          Being assigned somewhere never means authority everywhere.
-- TASK 27  anything with a real effect outside the platform is first a PLAN: scope, tools, inputs, expected
--          effects, cost ceiling and stop conditions, sealed with a hash. It runs only after a person with
--          standing approves that exact plan.
-- TASK 28  the plan moves through a state machine kept in the database: planned, validated, awaiting approval,
--          authorized, executing, provider accepted, reconciled, with failed, uncertain, cancelled and blocked.
--          Illegal moves are refused here, whatever the application does. Executing can be claimed once, and only
--          after permissions and the plan's identity are rechecked. An outcome nobody knows is "uncertain", and
--          an uncertain action is never run again by itself.
-- TASK 25  when the person who should approve has left, or the review is overdue, the action is BLOCKED but
--          recoverable: it names the reviewer, why, when, and who it escalates to. Someone removed from the club
--          cannot approve or resume anything.
-- TASK 29  a batch of work is accepted only within a review-size limit and a cost ceiling, and the decision is
--          recorded; an accepted decision outside the limits cannot exist.
--
-- Existing agents are registered and assigned workspace-wide, marked grandfathered, so nothing changes on day
-- one except that their authority is now written down and can be narrowed or revoked.

-- ═══ the effects an agent can have ════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.agent_effects (
  effect          text PRIMARY KEY CHECK (effect ~ '^[a-z][a-z_]{2,40}$'),
  label           text NOT NULL,
  -- reaches outside the platform: a person's inbox, a CRM, a paid service
  external        boolean NOT NULL,
  requires_approval boolean NOT NULL,
  approver_roles  text[] NOT NULL DEFAULT '{}',
  CHECK (NOT requires_approval OR cardinality(approver_roles) > 0)
);
INSERT INTO public.agent_effects (effect, label, external, requires_approval, approver_roles) VALUES
  ('send_email',          'Send an email to a recipient and log it in the CRM', true,  true,  ARRAY['admin', 'approver']),
  ('log_crm_activity',    'Write an activity to the CRM',                       true,  true,  ARRAY['admin', 'approver']),
  ('enrich_contacts',     'Look up contacts with paid third-party services',    true,  false, '{}'),
  ('scrape_intelligence', 'Gather public intelligence about a company',         true,  false, '{}'),
  ('generate_proposal',   'Draft a proposal for human review',                  false, false, '{}'),
  ('draft_email',         'Draft an email for human approval',                  false, false, '{}'),
  ('draft_renewal',       'Draft a renewal proposal for human review',          false, false, '{}'),
  ('draft_report_email',  'Draft a sponsor report email for human approval',    false, false, '{}'),
  ('flag_pipeline',       'Flag stale deals for a person to look at',           false, false, '{}')
ON CONFLICT (effect) DO NOTHING;

-- Is this person, right now, an active member of the club with one of these roles?
CREATE OR REPLACE FUNCTION public.approval_standing(p_tenant uuid, p_email text, p_roles text[]) RETURNS boolean AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.platform_users u
     WHERE u.tenant_id = p_tenant AND lower(u.email) = lower(p_email) AND u.is_active AND u.role = ANY (p_roles)
  );
$$ LANGUAGE sql STABLE;

-- ═══ definitions, versions, promotion ════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.agent_definitions (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  key           text NOT NULL CHECK (key ~ '^[a-z][a-z0-9-]{2,60}$'),
  name          text NOT NULL CHECK (length(btrim(name)) > 0),
  description   text,
  runtime       text NOT NULL CHECK (runtime IN ('orchestrator', 'langgraph', 'service')),
  created_by    text NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  retired_at    timestamptz,
  retired_by    text,
  retire_reason text,
  CONSTRAINT uq_agent_definitions UNIQUE (tenant_id, key),
  CHECK ((retired_at IS NULL) = (retired_by IS NULL)),
  CHECK (retired_at IS NULL OR (retire_reason IS NOT NULL AND length(btrim(retire_reason)) > 4))
);

CREATE OR REPLACE FUNCTION public.agent_definitions_guard() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF EXISTS (SELECT 1 FROM public.tenants WHERE id = OLD.tenant_id) THEN RAISE EXCEPTION 'agent definitions cannot be deleted; retire them'; END IF;
    RETURN OLD;
  END IF;
  IF OLD.retired_at IS NOT NULL OR NEW.retired_at IS NULL OR NEW.key IS DISTINCT FROM OLD.key OR NEW.tenant_id IS DISTINCT FROM OLD.tenant_id
     OR NEW.runtime IS DISTINCT FROM OLD.runtime OR NEW.created_by IS DISTINCT FROM OLD.created_by THEN
    RAISE EXCEPTION 'an agent definition can only be retired, once';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS trg_agent_definitions_guard ON public.agent_definitions;
CREATE TRIGGER trg_agent_definitions_guard BEFORE UPDATE OR DELETE ON public.agent_definitions FOR EACH ROW EXECUTE FUNCTION public.agent_definitions_guard();

CREATE TABLE IF NOT EXISTS public.agent_versions (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  definition_id uuid NOT NULL REFERENCES public.agent_definitions(id) ON DELETE CASCADE,
  version       integer NOT NULL CHECK (version >= 1),
  model         text,
  prompt_ref    text,
  tools         text[] NOT NULL DEFAULT '{}',
  effects       text[] NOT NULL DEFAULT '{}',
  max_cost_usd  numeric(10, 4) NOT NULL CHECK (max_cost_usd > 0),
  config        jsonb NOT NULL DEFAULT '{}'::jsonb,
  notes         text,
  created_by    text NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_agent_versions UNIQUE (definition_id, version)
);

CREATE OR REPLACE FUNCTION public.agent_versions_guard() RETURNS trigger AS $$
DECLARE
  e text;
BEGIN
  IF TG_OP = 'UPDATE' THEN RAISE EXCEPTION 'agent versions are immutable; add a new version'; END IF;
  IF TG_OP = 'DELETE' THEN
    IF EXISTS (SELECT 1 FROM public.agent_definitions WHERE id = OLD.definition_id) THEN RAISE EXCEPTION 'agent versions cannot be deleted'; END IF;
    RETURN OLD;
  END IF;
  FOREACH e IN ARRAY NEW.effects LOOP
    IF NOT EXISTS (SELECT 1 FROM public.agent_effects WHERE effect = e) THEN RAISE EXCEPTION 'unknown effect "%"', e; END IF;
  END LOOP;
  IF (SELECT tenant_id FROM public.agent_definitions WHERE id = NEW.definition_id) IS DISTINCT FROM NEW.tenant_id THEN
    RAISE EXCEPTION 'that definition belongs to another tenant';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS trg_agent_versions_guard ON public.agent_versions;
CREATE TRIGGER trg_agent_versions_guard BEFORE INSERT OR UPDATE OR DELETE ON public.agent_versions FOR EACH ROW EXECUTE FUNCTION public.agent_versions_guard();

CREATE TABLE IF NOT EXISTS public.agent_version_events (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  seq         bigint GENERATED ALWAYS AS IDENTITY,
  tenant_id   uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  version_id  uuid NOT NULL REFERENCES public.agent_versions(id) ON DELETE CASCADE,
  event_type  text NOT NULL CHECK (event_type IN ('promoted', 'retired')),
  -- what justified it: an evaluation run, a review, or "grandfathered"
  evidence    jsonb NOT NULL DEFAULT '{}'::jsonb,
  reason      text,
  actor_kind  text NOT NULL CHECK (actor_kind IN ('human', 'approver', 'service')),
  actor_id    text NOT NULL CHECK (length(btrim(actor_id)) > 0),
  created_at  timestamptz NOT NULL DEFAULT clock_timestamp(),
  CHECK (event_type <> 'promoted' OR evidence <> '{}'::jsonb),
  CHECK (event_type <> 'retired' OR (reason IS NOT NULL AND length(btrim(reason)) > 4))
);

-- The version of an agent that is live: the newest promoted one that has not been retired.
CREATE OR REPLACE FUNCTION public.agent_active_version(p_definition uuid) RETURNS uuid AS $$
  SELECT e.version_id
    FROM public.agent_version_events e
    JOIN public.agent_versions v ON v.id = e.version_id
   WHERE v.definition_id = p_definition AND e.event_type = 'promoted'
     AND NOT EXISTS (SELECT 1 FROM public.agent_version_events r WHERE r.version_id = e.version_id AND r.event_type = 'retired' AND r.seq > e.seq)
   ORDER BY e.seq DESC LIMIT 1;
$$ LANGUAGE sql STABLE;

CREATE OR REPLACE FUNCTION public.agent_version_events_guard() RETURNS trigger AS $$
DECLARE
  def uuid;
BEGIN
  IF TG_OP = 'UPDATE' THEN RAISE EXCEPTION 'agent_version_events rows are immutable'; END IF;
  IF TG_OP = 'DELETE' THEN
    IF EXISTS (SELECT 1 FROM public.agent_versions WHERE id = OLD.version_id) THEN RAISE EXCEPTION 'agent_version_events rows cannot be deleted'; END IF;
    RETURN OLD;
  END IF;
  SELECT definition_id INTO def FROM public.agent_versions WHERE id = NEW.version_id;
  IF NEW.event_type = 'promoted' THEN
    IF EXISTS (SELECT 1 FROM public.agent_definitions WHERE id = def AND retired_at IS NOT NULL) THEN RAISE EXCEPTION 'a retired agent cannot have a version promoted'; END IF;
    IF public.agent_active_version(def) IS NOT NULL THEN RAISE EXCEPTION 'another version is live; retire it first (or promote through agent_version_promote)'; END IF;
  ELSIF public.agent_active_version(def) IS DISTINCT FROM NEW.version_id THEN
    RAISE EXCEPTION 'that version is not live, so there is nothing to retire';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS trg_agent_version_events_guard ON public.agent_version_events;
CREATE TRIGGER trg_agent_version_events_guard BEFORE INSERT OR UPDATE OR DELETE ON public.agent_version_events FOR EACH ROW EXECUTE FUNCTION public.agent_version_events_guard();

-- Promote a version with evidence, retiring the one it replaces, in one step.
CREATE OR REPLACE FUNCTION public.agent_version_promote(p_version uuid, p_actor_kind text, p_actor_id text, p_evidence jsonb) RETURNS uuid AS $$
DECLARE
  v public.agent_versions;
  live uuid;
BEGIN
  SELECT * INTO v FROM public.agent_versions WHERE id = p_version;
  IF NOT FOUND THEN RAISE EXCEPTION 'version not found'; END IF;
  live := public.agent_active_version(v.definition_id);
  IF live = p_version THEN RAISE EXCEPTION 'that version is already live'; END IF;
  IF live IS NOT NULL THEN
    INSERT INTO public.agent_version_events (tenant_id, version_id, event_type, reason, actor_kind, actor_id)
    VALUES (v.tenant_id, live, 'retired', 'Superseded by version ' || v.version, p_actor_kind, p_actor_id);
  END IF;
  INSERT INTO public.agent_version_events (tenant_id, version_id, event_type, evidence, actor_kind, actor_id)
  VALUES (v.tenant_id, p_version, 'promoted', coalesce(p_evidence, '{}'::jsonb), p_actor_kind, p_actor_id);
  RETURN p_version;
END;
$$ LANGUAGE plpgsql;

-- ═══ assignments: authority over a stated scope ══════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.agent_assignments (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  definition_id   uuid NOT NULL REFERENCES public.agent_definitions(id) ON DELETE CASCADE,
  scope_kind      text NOT NULL CHECK (scope_kind IN ('all_companies', 'company', 'campaign')),
  scope_id        uuid,
  allowed_effects text[] NOT NULL,
  max_cost_usd    numeric(10, 4) NOT NULL CHECK (max_cost_usd > 0),
  starts_at       timestamptz NOT NULL DEFAULT clock_timestamp(),
  expires_at      timestamptz,
  justification   text,
  grandfathered   boolean NOT NULL DEFAULT false,
  assigned_by     text NOT NULL CHECK (length(btrim(assigned_by)) > 0),
  created_at      timestamptz NOT NULL DEFAULT clock_timestamp(),
  revoked_at      timestamptz,
  revoked_by      text,
  revoke_reason   text,
  CHECK ((scope_kind = 'all_companies') = (scope_id IS NULL)),
  -- authority everywhere has to be asked for in words
  CHECK (scope_kind <> 'all_companies' OR (justification IS NOT NULL AND length(btrim(justification)) >= 10)),
  CHECK (cardinality(allowed_effects) > 0),
  CHECK (expires_at IS NULL OR expires_at > starts_at),
  CHECK ((revoked_at IS NULL) = (revoked_by IS NULL)),
  CHECK (revoked_at IS NULL OR (revoke_reason IS NOT NULL AND length(btrim(revoke_reason)) > 4))
);
CREATE INDEX IF NOT EXISTS idx_agent_assignments_lookup ON public.agent_assignments (tenant_id, definition_id) WHERE revoked_at IS NULL;

CREATE OR REPLACE FUNCTION public.agent_assignments_guard() RETURNS trigger AS $$
DECLARE
  d public.agent_definitions;
  live uuid;
  v public.agent_versions;
  e text;
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF EXISTS (SELECT 1 FROM public.agent_definitions WHERE id = OLD.definition_id) THEN RAISE EXCEPTION 'assignments cannot be deleted; revoke them'; END IF;
    RETURN OLD;
  END IF;
  IF TG_OP = 'UPDATE' THEN
    IF OLD.revoked_at IS NOT NULL OR NEW.revoked_at IS NULL OR NEW.scope_kind IS DISTINCT FROM OLD.scope_kind OR NEW.scope_id IS DISTINCT FROM OLD.scope_id
       OR NEW.allowed_effects IS DISTINCT FROM OLD.allowed_effects OR NEW.max_cost_usd IS DISTINCT FROM OLD.max_cost_usd OR NEW.definition_id IS DISTINCT FROM OLD.definition_id
       OR NEW.expires_at IS DISTINCT FROM OLD.expires_at OR NEW.assigned_by IS DISTINCT FROM OLD.assigned_by THEN
      RAISE EXCEPTION 'an assignment can only be revoked, once; assign again to change it';
    END IF;
    RETURN NEW;
  END IF;
  SELECT * INTO d FROM public.agent_definitions WHERE id = NEW.definition_id;
  IF d.tenant_id IS DISTINCT FROM NEW.tenant_id THEN RAISE EXCEPTION 'that agent belongs to another tenant'; END IF;
  IF d.retired_at IS NOT NULL THEN RAISE EXCEPTION 'a retired agent cannot be assigned'; END IF;
  live := public.agent_active_version(NEW.definition_id);
  IF live IS NULL THEN RAISE EXCEPTION 'the agent has no live version to assign'; END IF;
  SELECT * INTO v FROM public.agent_versions WHERE id = live;
  FOREACH e IN ARRAY NEW.allowed_effects LOOP
    IF NOT (e = ANY (v.effects)) THEN RAISE EXCEPTION 'the live version cannot "%": it is not one of its effects', e; END IF;
  END LOOP;
  IF NEW.max_cost_usd > v.max_cost_usd THEN RAISE EXCEPTION 'the cost limit cannot exceed the version''s own limit (%)', v.max_cost_usd; END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS trg_agent_assignments_guard ON public.agent_assignments;
CREATE TRIGGER trg_agent_assignments_guard BEFORE INSERT OR UPDATE OR DELETE ON public.agent_assignments FOR EACH ROW EXECUTE FUNCTION public.agent_assignments_guard();

-- May this agent act on this target, for this effect, right now? The most specific assignment wins.
CREATE OR REPLACE FUNCTION public.agent_assignment_for(p_tenant uuid, p_key text, p_company uuid, p_campaign uuid, p_effect text)
RETURNS TABLE (assignment_id uuid, definition_id uuid, version_id uuid, version integer, max_cost_usd numeric, scope_kind text, grandfathered boolean) AS $$
  SELECT a.id, d.id, v.id, v.version, LEAST(a.max_cost_usd, v.max_cost_usd), a.scope_kind, a.grandfathered
    FROM public.agent_definitions d
    JOIN public.agent_assignments a ON a.definition_id = d.id
    JOIN public.agent_versions v ON v.id = public.agent_active_version(d.id)
   WHERE d.tenant_id = p_tenant AND d.key = p_key AND d.retired_at IS NULL
     AND a.revoked_at IS NULL AND a.starts_at <= clock_timestamp() AND (a.expires_at IS NULL OR a.expires_at > clock_timestamp())
     AND (p_effect IS NULL OR (p_effect = ANY (a.allowed_effects) AND p_effect = ANY (v.effects)))
     AND (a.scope_kind = 'all_companies'
          OR (a.scope_kind = 'company' AND a.scope_id = p_company)
          OR (a.scope_kind = 'campaign' AND a.scope_id = p_campaign))
   ORDER BY CASE a.scope_kind WHEN 'company' THEN 1 WHEN 'campaign' THEN 2 ELSE 3 END, a.created_at DESC
   LIMIT 1;
$$ LANGUAGE sql STABLE;

-- ═══ actions: the plan, and the state machine it moves through ═══════════════════════════════

CREATE TABLE IF NOT EXISTS public.agent_actions (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  definition_id     uuid NOT NULL REFERENCES public.agent_definitions(id) ON DELETE CASCADE,
  version_id        uuid NOT NULL REFERENCES public.agent_versions(id),
  assignment_id     uuid NOT NULL REFERENCES public.agent_assignments(id),
  effect            text NOT NULL REFERENCES public.agent_effects(effect),
  target_type       text NOT NULL CHECK (length(btrim(target_type)) > 0),
  target_id         uuid NOT NULL,
  plan              jsonb NOT NULL,
  plan_hash         text NOT NULL,
  requested_by_kind text NOT NULL CHECK (requested_by_kind IN ('agent', 'human', 'service')),
  requested_by      text NOT NULL CHECK (length(btrim(requested_by)) > 0),
  on_behalf_of      text,
  reviewer_email    text,
  review_due_at     timestamptz,
  idem_key          text NOT NULL CHECK (length(idem_key) BETWEEN 8 AND 200),
  retry_of          uuid REFERENCES public.agent_actions(id),
  state             text NOT NULL DEFAULT 'planned' CHECK (state IN ('planned', 'validated', 'awaiting_approval', 'blocked', 'authorized', 'executing', 'provider_accepted', 'reconciled', 'failed', 'uncertain', 'cancelled')),
  created_at        timestamptz NOT NULL DEFAULT clock_timestamp(),
  state_changed_at  timestamptz NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT uq_agent_actions_idem UNIQUE (tenant_id, idem_key)
);
-- One live action per effect and target: a second send of the same email cannot start, even after the first was reconciled.
CREATE UNIQUE INDEX IF NOT EXISTS uq_agent_actions_open ON public.agent_actions (tenant_id, effect, target_id) WHERE state NOT IN ('failed', 'cancelled');
CREATE INDEX IF NOT EXISTS idx_agent_actions_state ON public.agent_actions (tenant_id, state, state_changed_at);

CREATE TABLE IF NOT EXISTS public.agent_action_events (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  seq          bigint GENERATED ALWAYS AS IDENTITY,
  tenant_id    uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  action_id    uuid NOT NULL REFERENCES public.agent_actions(id) ON DELETE CASCADE,
  from_state   text,
  to_state     text NOT NULL,
  actor_kind   text NOT NULL CHECK (actor_kind IN ('human', 'approver', 'agent', 'service')),
  actor_id     text NOT NULL CHECK (length(btrim(actor_id)) > 0),
  actor_email  text,
  detail       jsonb NOT NULL DEFAULT '{}'::jsonb,
  payload_hash text,
  created_at   timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX IF NOT EXISTS idx_agent_action_events_action ON public.agent_action_events (action_id, seq);
-- executing can be claimed once per action
CREATE UNIQUE INDEX IF NOT EXISTS uq_agent_action_events_executing ON public.agent_action_events (action_id) WHERE to_state = 'executing';

CREATE TABLE IF NOT EXISTS public.approval_blocks (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  subject_type    text NOT NULL CHECK (subject_type IN ('agent_action', 'agent_run')),
  subject_id      uuid NOT NULL,
  reviewer_email  text,
  reason          text NOT NULL CHECK (length(btrim(reason)) > 4),
  due_at          timestamptz,
  escalated_to    text NOT NULL CHECK (length(btrim(escalated_to)) > 0),
  status          text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'resolved')),
  created_at      timestamptz NOT NULL DEFAULT clock_timestamp(),
  resolved_at     timestamptz,
  resolved_by     text,
  resolution      text CHECK (resolution IN ('reassigned', 'cancelled', 'dismissed')),
  resolution_note text,
  CHECK ((status = 'open') = (resolved_at IS NULL)),
  CHECK (status = 'open' OR (resolved_by IS NOT NULL AND resolution IS NOT NULL))
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_approval_blocks_open ON public.approval_blocks (subject_type, subject_id) WHERE status = 'open';

CREATE OR REPLACE FUNCTION public.approval_blocks_guard() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF EXISTS (SELECT 1 FROM public.tenants WHERE id = OLD.tenant_id) THEN RAISE EXCEPTION 'approval_blocks rows cannot be deleted'; END IF;
    RETURN OLD;
  END IF;
  IF TG_OP = 'INSERT' THEN
    -- the escalation path has to be a real person who can act on it
    IF NOT public.approval_standing(NEW.tenant_id, NEW.escalated_to, ARRAY['admin']) THEN
      RAISE EXCEPTION 'a blocked approval must be escalated to an active administrator';
    END IF;
    RETURN NEW;
  END IF;
  IF OLD.status <> 'open' OR NEW.status <> 'resolved' OR NEW.subject_id IS DISTINCT FROM OLD.subject_id OR NEW.subject_type IS DISTINCT FROM OLD.subject_type
     OR NEW.reason IS DISTINCT FROM OLD.reason OR NEW.escalated_to IS DISTINCT FROM OLD.escalated_to OR NEW.tenant_id IS DISTINCT FROM OLD.tenant_id THEN
    RAISE EXCEPTION 'a blocked approval can only be resolved, once';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS trg_approval_blocks_guard ON public.approval_blocks;
CREATE TRIGGER trg_approval_blocks_guard BEFORE INSERT OR UPDATE OR DELETE ON public.approval_blocks FOR EACH ROW EXECUTE FUNCTION public.approval_blocks_guard();

-- Only the transition functions below may write events or move an action's state.
CREATE OR REPLACE FUNCTION public.agent_actions_guard() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF EXISTS (SELECT 1 FROM public.tenants WHERE id = OLD.tenant_id) THEN RAISE EXCEPTION 'agent actions cannot be deleted'; END IF;
    RETURN OLD;
  END IF;
  IF TG_OP = 'INSERT' THEN
    IF coalesce(current_setting('app.agent_tx', true), '') <> 'on' THEN RAISE EXCEPTION 'agent actions are created through agent_action_request'; END IF;
    RETURN NEW;
  END IF;
  IF coalesce(current_setting('app.agent_tx', true), '') <> 'on' THEN RAISE EXCEPTION 'an action moves only through agent_action_transition'; END IF;
  IF NEW.plan IS DISTINCT FROM OLD.plan OR NEW.plan_hash IS DISTINCT FROM OLD.plan_hash OR NEW.effect IS DISTINCT FROM OLD.effect OR NEW.target_id IS DISTINCT FROM OLD.target_id
     OR NEW.target_type IS DISTINCT FROM OLD.target_type OR NEW.requested_by IS DISTINCT FROM OLD.requested_by OR NEW.assignment_id IS DISTINCT FROM OLD.assignment_id
     OR NEW.version_id IS DISTINCT FROM OLD.version_id OR NEW.idem_key IS DISTINCT FROM OLD.idem_key OR NEW.tenant_id IS DISTINCT FROM OLD.tenant_id THEN
    RAISE EXCEPTION 'a plan cannot be changed after it is made';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS trg_agent_actions_guard ON public.agent_actions;
CREATE TRIGGER trg_agent_actions_guard BEFORE INSERT OR UPDATE OR DELETE ON public.agent_actions FOR EACH ROW EXECUTE FUNCTION public.agent_actions_guard();

CREATE OR REPLACE FUNCTION public.agent_action_events_guard() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN RAISE EXCEPTION 'agent_action_events rows are immutable'; END IF;
  IF TG_OP = 'DELETE' THEN
    IF EXISTS (SELECT 1 FROM public.agent_actions WHERE id = OLD.action_id) THEN RAISE EXCEPTION 'agent_action_events rows cannot be deleted'; END IF;
    RETURN OLD;
  END IF;
  IF coalesce(current_setting('app.agent_tx', true), '') <> 'on' THEN RAISE EXCEPTION 'events are written only by agent_action_transition'; END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS trg_agent_action_events_guard ON public.agent_action_events;
CREATE TRIGGER trg_agent_action_events_guard BEFORE INSERT OR UPDATE OR DELETE ON public.agent_action_events FOR EACH ROW EXECUTE FUNCTION public.agent_action_events_guard();

-- The legal moves.
CREATE OR REPLACE FUNCTION public.agent_action_allowed(p_from text, p_to text) RETURNS boolean AS $$
  SELECT CASE p_from
    WHEN 'planned'           THEN p_to IN ('validated', 'failed', 'cancelled')
    WHEN 'validated'         THEN p_to IN ('awaiting_approval', 'authorized', 'failed', 'cancelled')
    WHEN 'awaiting_approval' THEN p_to IN ('authorized', 'blocked', 'failed', 'cancelled')
    WHEN 'blocked'           THEN p_to IN ('awaiting_approval', 'failed', 'cancelled')
    WHEN 'authorized'        THEN p_to IN ('executing', 'failed', 'cancelled')
    WHEN 'executing'         THEN p_to IN ('provider_accepted', 'uncertain', 'failed')
    WHEN 'provider_accepted' THEN p_to IN ('reconciled', 'uncertain')
    WHEN 'uncertain'         THEN p_to IN ('reconciled', 'failed')
    ELSE false
  END;
$$ LANGUAGE sql IMMUTABLE;

-- Make a plan. Safe to repeat with the same key. Refused unless the agent is assigned this scope and effect.
CREATE OR REPLACE FUNCTION public.agent_action_request(
  p_tenant uuid, p_assignment uuid, p_effect text, p_company uuid, p_campaign uuid, p_target_type text, p_target_id uuid,
  p_plan jsonb, p_requested_by_kind text, p_requested_by text, p_on_behalf_of text, p_idem text, p_retry_of uuid DEFAULT NULL
) RETURNS uuid AS $$
DECLARE
  asg public.agent_assignments;
  d public.agent_definitions;
  live uuid;
  ver public.agent_versions;
  existing uuid;
  old public.agent_actions;
  new_id uuid := gen_random_uuid();
  hash text;
  ceiling numeric;
BEGIN
  PERFORM set_config('app.agent_tx', 'on', true);
  SELECT id INTO existing FROM public.agent_actions WHERE tenant_id = p_tenant AND idem_key = p_idem;
  IF existing IS NOT NULL THEN RETURN existing; END IF;

  SELECT * INTO asg FROM public.agent_assignments WHERE id = p_assignment AND tenant_id = p_tenant;
  IF NOT FOUND THEN RAISE EXCEPTION 'ASSIGNMENT: no such assignment'; END IF;
  IF asg.revoked_at IS NOT NULL OR asg.starts_at > clock_timestamp() OR (asg.expires_at IS NOT NULL AND asg.expires_at <= clock_timestamp()) THEN
    RAISE EXCEPTION 'ASSIGNMENT: the assignment is revoked, expired or not yet started';
  END IF;
  SELECT * INTO d FROM public.agent_definitions WHERE id = asg.definition_id;
  IF d.retired_at IS NOT NULL THEN RAISE EXCEPTION 'ASSIGNMENT: the agent is retired'; END IF;
  live := public.agent_active_version(asg.definition_id);
  IF live IS NULL THEN RAISE EXCEPTION 'ASSIGNMENT: the agent has no live version'; END IF;
  SELECT * INTO ver FROM public.agent_versions WHERE id = live;
  IF NOT (p_effect = ANY (asg.allowed_effects)) OR NOT (p_effect = ANY (ver.effects)) THEN RAISE EXCEPTION 'ASSIGNMENT: the agent is not assigned the effect "%"', p_effect; END IF;
  IF NOT (asg.scope_kind = 'all_companies' OR (asg.scope_kind = 'company' AND asg.scope_id = p_company) OR (asg.scope_kind = 'campaign' AND asg.scope_id = p_campaign)) THEN
    RAISE EXCEPTION 'ASSIGNMENT: the agent is not assigned this company or campaign';
  END IF;

  IF jsonb_typeof(p_plan) IS DISTINCT FROM 'object'
     OR jsonb_typeof(p_plan->'scope') IS NULL OR jsonb_typeof(p_plan->'tools') IS DISTINCT FROM 'array' OR jsonb_array_length(p_plan->'tools') = 0
     OR jsonb_typeof(p_plan->'inputs') IS DISTINCT FROM 'object' OR jsonb_typeof(p_plan->'expected_effects') IS DISTINCT FROM 'array' OR jsonb_array_length(p_plan->'expected_effects') = 0
     OR jsonb_typeof(p_plan->'stop_conditions') IS DISTINCT FROM 'array' OR jsonb_array_length(p_plan->'stop_conditions') = 0
     OR jsonb_typeof(p_plan->'cost_ceiling_usd') IS DISTINCT FROM 'number' THEN
    RAISE EXCEPTION 'PLAN: a plan states its scope, tools, inputs, expected effects, cost ceiling and stop conditions';
  END IF;
  ceiling := (p_plan->>'cost_ceiling_usd')::numeric;
  IF ceiling < 0 OR ceiling > LEAST(asg.max_cost_usd, ver.max_cost_usd) THEN
    RAISE EXCEPTION 'PLAN: the cost ceiling % is above what this assignment allows (%)', ceiling, LEAST(asg.max_cost_usd, ver.max_cost_usd);
  END IF;

  IF p_retry_of IS NOT NULL THEN
    SELECT * INTO old FROM public.agent_actions WHERE id = p_retry_of AND tenant_id = p_tenant;
    IF NOT FOUND OR old.effect <> p_effect OR old.target_id <> p_target_id THEN RAISE EXCEPTION 'RETRY: that is not an earlier attempt of this action'; END IF;
    IF old.state <> 'failed' THEN RAISE EXCEPTION 'RETRY: only a failed action can be tried again (this one is %); an uncertain one must first be reconciled', old.state; END IF;
  END IF;
  IF EXISTS (SELECT 1 FROM public.agent_actions WHERE tenant_id = p_tenant AND effect = p_effect AND target_id = p_target_id AND state NOT IN ('failed', 'cancelled')) THEN
    RAISE EXCEPTION 'DUPLICATE: an action for this effect and target already exists';
  END IF;

  hash := encode(sha256(convert_to(p_plan::text, 'UTF8')), 'hex');
  INSERT INTO public.agent_actions (id, tenant_id, definition_id, version_id, assignment_id, effect, target_type, target_id, plan, plan_hash, requested_by_kind, requested_by, on_behalf_of, idem_key, retry_of)
  VALUES (new_id, p_tenant, asg.definition_id, live, asg.id, p_effect, p_target_type, p_target_id, p_plan, hash, p_requested_by_kind, p_requested_by, lower(p_on_behalf_of), p_idem, p_retry_of);
  INSERT INTO public.agent_action_events (tenant_id, action_id, from_state, to_state, actor_kind, actor_id, detail, payload_hash)
  VALUES (p_tenant, new_id, NULL, 'planned', CASE p_requested_by_kind WHEN 'agent' THEN 'agent' WHEN 'service' THEN 'service' ELSE 'human' END, p_requested_by, jsonb_build_object('plan_hash', hash), hash);
  RETURN new_id;
END;
$$ LANGUAGE plpgsql;

-- The only way to move an action. Every rule about who may do what, and when, is here.
CREATE OR REPLACE FUNCTION public.agent_action_transition(
  p_action uuid, p_to text, p_actor_kind text, p_actor_id text, p_actor_email text DEFAULT NULL, p_detail jsonb DEFAULT '{}'::jsonb
) RETURNS text AS $$
DECLARE
  a public.agent_actions;
  fx public.agent_effects;
  asg public.agent_assignments;
  auth_ev public.agent_action_events;
  detail jsonb := coalesce(p_detail, '{}'::jsonb);
  chk text;
  live uuid;
  escalate text;
BEGIN
  SELECT * INTO a FROM public.agent_actions WHERE id = p_action FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'action not found'; END IF;
  IF NOT public.agent_action_allowed(a.state, p_to) THEN
    RAISE EXCEPTION 'STATE: an action that is % cannot become %', a.state, p_to;
  END IF;
  SELECT * INTO fx FROM public.agent_effects WHERE effect = a.effect;
  PERFORM set_config('app.agent_tx', 'on', true);

  IF p_to = 'validated' THEN
    IF jsonb_typeof(detail->'gates') IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'RULE: validation records the checks that were made'; END IF;

  ELSIF p_to = 'awaiting_approval' THEN
    IF a.state = 'blocked' THEN
      chk := nullif(btrim(detail->>'new_reviewer_email'), '');
      IF chk IS NOT NULL AND NOT public.approval_standing(a.tenant_id, chk, fx.approver_roles) THEN RAISE EXCEPTION 'STANDING: % cannot approve this', chk; END IF;
      IF chk IS NULL AND NOT EXISTS (SELECT 1 FROM public.platform_users u WHERE u.tenant_id = a.tenant_id AND u.is_active AND u.role = ANY (fx.approver_roles)) THEN
        RAISE EXCEPTION 'STANDING: nobody in the club can approve this';
      END IF;
      UPDATE public.agent_actions SET reviewer_email = lower(chk), review_due_at = coalesce((detail->>'review_due_at')::timestamptz, clock_timestamp() + interval '2 days') WHERE id = a.id;
      UPDATE public.approval_blocks SET status = 'resolved', resolved_at = clock_timestamp(), resolved_by = p_actor_id, resolution = 'reassigned', resolution_note = detail->>'note'
       WHERE subject_type = 'agent_action' AND subject_id = a.id AND status = 'open';
    ELSE
      UPDATE public.agent_actions SET reviewer_email = lower(nullif(btrim(detail->>'reviewer_email'), '')), review_due_at = coalesce((detail->>'review_due_at')::timestamptz, clock_timestamp() + interval '2 days') WHERE id = a.id;
    END IF;

  ELSIF p_to = 'blocked' THEN
    IF coalesce(length(btrim(detail->>'reason')), 0) < 5 THEN RAISE EXCEPTION 'RULE: a blocked approval says why'; END IF;
    escalate := nullif(btrim(detail->>'escalate_to'), '');
    IF escalate IS NULL THEN RAISE EXCEPTION 'RULE: a blocked approval names who it escalates to'; END IF;
    INSERT INTO public.approval_blocks (tenant_id, subject_type, subject_id, reviewer_email, reason, due_at, escalated_to)
    VALUES (a.tenant_id, 'agent_action', a.id, a.reviewer_email, detail->>'reason', a.review_due_at, lower(escalate));

  ELSIF p_to = 'authorized' THEN
    IF fx.requires_approval THEN
      IF a.state <> 'awaiting_approval' THEN RAISE EXCEPTION 'RULE: this effect has to be approved by a person before it is authorized'; END IF;
      IF p_actor_kind NOT IN ('human', 'approver') THEN RAISE EXCEPTION 'STANDING: only a person can approve this'; END IF;
      IF p_actor_id = a.requested_by THEN RAISE EXCEPTION 'STANDING: the requester cannot approve their own action'; END IF;
      IF p_actor_email IS NULL OR NOT public.approval_standing(a.tenant_id, p_actor_email, fx.approver_roles) THEN
        RAISE EXCEPTION 'STANDING: % is not an active member of the club who may approve this', coalesce(p_actor_email, 'nobody');
      END IF;
      IF a.reviewer_email IS NOT NULL AND lower(p_actor_email) <> a.reviewer_email AND NOT public.approval_standing(a.tenant_id, p_actor_email, ARRAY['admin']) THEN
        RAISE EXCEPTION 'STANDING: this is assigned to another reviewer';
      END IF;
    END IF;

  ELSIF p_to = 'executing' THEN
    -- Recheck everything that approval relied on, now, immediately before anything happens.
    SELECT * INTO auth_ev FROM public.agent_action_events WHERE action_id = a.id AND to_state = 'authorized' ORDER BY seq DESC LIMIT 1;
    IF fx.requires_approval AND NOT public.approval_standing(a.tenant_id, auth_ev.actor_email, fx.approver_roles) THEN
      RAISE EXCEPTION 'STANDING: the person who approved this no longer has standing to approve it';
    END IF;
    IF auth_ev.created_at < clock_timestamp() - interval '24 hours' THEN RAISE EXCEPTION 'STALE: the approval is older than 24 hours; approve it again'; END IF;
    SELECT * INTO asg FROM public.agent_assignments WHERE id = a.assignment_id;
    IF asg.revoked_at IS NOT NULL OR (asg.expires_at IS NOT NULL AND asg.expires_at <= clock_timestamp()) THEN RAISE EXCEPTION 'REVOKED: the agent''s assignment was revoked or has expired'; END IF;
    IF NOT (a.effect = ANY (asg.allowed_effects)) THEN RAISE EXCEPTION 'REVOKED: the agent is no longer assigned this effect'; END IF;
    live := public.agent_active_version(a.definition_id);
    IF live IS DISTINCT FROM a.version_id THEN RAISE EXCEPTION 'REVOKED: the agent version that made this plan is no longer the live version'; END IF;
    IF detail->>'payload_hash' IS DISTINCT FROM a.plan_hash OR encode(sha256(convert_to(a.plan::text, 'UTF8')), 'hex') <> a.plan_hash THEN
      RAISE EXCEPTION 'CHANGED: what is about to run is not the plan that was approved';
    END IF;

  ELSIF p_to = 'provider_accepted' THEN
    IF coalesce(length(btrim(detail->>'provider_ref')), 0) = 0 THEN RAISE EXCEPTION 'RULE: provider acceptance records the provider''s reference'; END IF;

  ELSIF p_to = 'uncertain' THEN
    IF coalesce(length(btrim(detail->>'reason')), 0) < 5 THEN RAISE EXCEPTION 'RULE: an uncertain outcome says why'; END IF;

  ELSIF p_to = 'reconciled' THEN
    IF a.state = 'uncertain' AND (jsonb_typeof(detail->'evidence') IS NULL OR detail->'evidence' = '{}'::jsonb OR p_actor_kind NOT IN ('human', 'approver')) THEN
      RAISE EXCEPTION 'RULE: an uncertain outcome is reconciled by a person, with evidence that it went through';
    END IF;

  ELSIF p_to = 'failed' THEN
    IF a.state = 'uncertain' AND (coalesce(detail->>'confirmed_not_sent', '') <> 'true' OR jsonb_typeof(detail->'evidence') IS NULL OR detail->'evidence' = '{}'::jsonb OR p_actor_kind NOT IN ('human', 'approver')) THEN
      RAISE EXCEPTION 'RULE: an uncertain outcome becomes failed only when a person confirms, with evidence, that nothing went out';
    END IF;
    IF a.state = 'executing' AND coalesce(length(btrim(detail->>'provider_error')), 0) = 0 THEN RAISE EXCEPTION 'RULE: an attempt that failed while executing records the provider''s refusal'; END IF;

  ELSIF p_to = 'cancelled' THEN
    IF a.state = 'blocked' THEN
      UPDATE public.approval_blocks SET status = 'resolved', resolved_at = clock_timestamp(), resolved_by = p_actor_id, resolution = 'cancelled', resolution_note = detail->>'note'
       WHERE subject_type = 'agent_action' AND subject_id = a.id AND status = 'open';
    END IF;
  END IF;

  INSERT INTO public.agent_action_events (tenant_id, action_id, from_state, to_state, actor_kind, actor_id, actor_email, detail, payload_hash)
  VALUES (a.tenant_id, a.id, a.state, p_to, p_actor_kind, p_actor_id, lower(p_actor_email), detail, a.plan_hash);
  UPDATE public.agent_actions SET state = p_to, state_changed_at = clock_timestamp() WHERE id = a.id;
  RETURN p_to;
END;
$$ LANGUAGE plpgsql;

-- One action with its whole history, as the server reads it.
CREATE OR REPLACE FUNCTION public.agent_action_get(p_action uuid) RETURNS jsonb AS $$
  SELECT jsonb_build_object(
    'id', a.id, 'tenant_id', a.tenant_id, 'state', a.state, 'effect', a.effect, 'target_type', a.target_type, 'target_id', a.target_id,
    'plan', a.plan, 'plan_hash', a.plan_hash, 'requested_by', a.requested_by, 'requested_by_kind', a.requested_by_kind, 'on_behalf_of', a.on_behalf_of,
    'reviewer_email', a.reviewer_email, 'review_due_at', a.review_due_at, 'retry_of', a.retry_of, 'definition_id', a.definition_id, 'version_id', a.version_id,
    'assignment_id', a.assignment_id, 'created_at', a.created_at, 'state_changed_at', a.state_changed_at,
    'events', coalesce((SELECT jsonb_agg(jsonb_build_object('seq', e.seq, 'from', e.from_state, 'to', e.to_state, 'actor_kind', e.actor_kind, 'actor_id', e.actor_id,
                          'actor_email', e.actor_email, 'detail', e.detail, 'at', e.created_at) ORDER BY e.seq)
                         FROM public.agent_action_events e WHERE e.action_id = a.id), '[]'::jsonb))
    FROM public.agent_actions a WHERE a.id = p_action;
$$ LANGUAGE sql STABLE;

-- A process that died mid-execution leaves its action "executing". Nobody knows whether it went out, so it is
-- marked uncertain, never retried by itself.
CREATE OR REPLACE FUNCTION public.agent_actions_sweep_stuck(p_minutes integer DEFAULT 10) RETURNS integer AS $$
DECLARE
  r record;
  n integer := 0;
BEGIN
  FOR r IN SELECT id FROM public.agent_actions WHERE state = 'executing' AND state_changed_at < clock_timestamp() - make_interval(mins => p_minutes) LOOP
    PERFORM public.agent_action_transition(r.id, 'uncertain', 'service', 'service:sweeper', NULL,
      jsonb_build_object('reason', 'The process stopped while this was executing; it is not known whether it went out.'));
    n := n + 1;
  END LOOP;
  RETURN n;
END;
$$ LANGUAGE plpgsql;

-- ═══ batch gating (Task 29) ══════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.batch_limits (
  tenant_id         uuid PRIMARY KEY REFERENCES public.tenants(id) ON DELETE CASCADE,
  max_review_batch  integer NOT NULL DEFAULT 10 CHECK (max_review_batch BETWEEN 1 AND 200),
  max_batch_cost_usd numeric(10, 2) NOT NULL DEFAULT 5 CHECK (max_batch_cost_usd > 0),
  updated_by        text NOT NULL,
  updated_at        timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.batch_decisions (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id             uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  kind                  text NOT NULL CHECK (length(btrim(kind)) > 0),
  requested_by          text NOT NULL CHECK (length(btrim(requested_by)) > 0),
  items                 integer NOT NULL CHECK (items >= 1),
  per_item_estimate_usd numeric(10, 4) NOT NULL CHECK (per_item_estimate_usd >= 0),
  estimated_cost_usd    numeric(12, 4) NOT NULL CHECK (estimated_cost_usd >= 0),
  max_items             integer NOT NULL,
  ceiling_usd           numeric(10, 2) NOT NULL,
  decision              text NOT NULL CHECK (decision IN ('accepted', 'refused')),
  reason                text,
  created_at            timestamptz NOT NULL DEFAULT clock_timestamp(),
  -- a batch outside the limits cannot be recorded as accepted
  CONSTRAINT batch_decisions_limits_chk CHECK (decision <> 'accepted' OR (items <= max_items AND estimated_cost_usd <= ceiling_usd)),
  CONSTRAINT batch_decisions_reason_chk CHECK (decision <> 'refused' OR (reason IS NOT NULL AND length(btrim(reason)) > 4))
);
CREATE INDEX IF NOT EXISTS idx_batch_decisions_tenant ON public.batch_decisions (tenant_id, created_at DESC);

CREATE OR REPLACE FUNCTION public.batch_decisions_guard() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN RAISE EXCEPTION 'batch_decisions rows are immutable'; END IF;
  IF EXISTS (SELECT 1 FROM public.tenants WHERE id = OLD.tenant_id) THEN RAISE EXCEPTION 'batch_decisions rows cannot be deleted'; END IF;
  RETURN OLD;
END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS trg_batch_decisions_guard ON public.batch_decisions;
CREATE TRIGGER trg_batch_decisions_guard BEFORE UPDATE OR DELETE ON public.batch_decisions FOR EACH ROW EXECUTE FUNCTION public.batch_decisions_guard();

-- ═══ register the agents that already exist ══════════════════════════════════════════════════

DO $$
DECLARE
  t uuid := '00000000-0000-0000-0000-000000000001';
  spec record;
  def_id uuid;
  ver_id uuid;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.tenants WHERE id = t) THEN RETURN; END IF;
  FOR spec IN
    SELECT * FROM (VALUES
      ('outreach-agent',        'Outreach Agent',          'Researches a company, drafts a proposal and an email, and sends the email once a person approves.', 'orchestrator',
        ARRAY['enrich_contacts', 'scrape_company_intelligence', 'generate_personalized_proposal', 'generate_outreach_email', 'send_email'],
        ARRAY['enrich_contacts', 'scrape_intelligence', 'generate_proposal', 'draft_email', 'send_email'], 1.00),
      ('negotiation-agent',     'Negotiation Agent',       'Drafts a reply to a sponsor, grounded in the real proposal.', 'langgraph', ARRAY['draft_reply'], ARRAY['draft_email'], 0.25),
      ('renewal-agent',         'Renewal Agent',           'Drafts renewal proposals from the reconciled delivery recap.', 'langgraph', ARRAY['scan_contracts', 'draft_renewal'], ARRAY['draft_renewal'], 0.50),
      ('reporting-agent',       'Reporting Agent',         'Drafts sponsor report emails from recorded reach.', 'langgraph', ARRAY['scan_contracts', 'draft_report'], ARRAY['draft_report_email'], 0.25),
      ('pipeline-hygiene-agent','Pipeline Hygiene Agent',  'Flags deals that have gone quiet.', 'langgraph', ARRAY['scan_pipeline'], ARRAY['flag_pipeline'], 0.05),
      ('proposal-agent',        'Proposal Agent',          'Drafts a personalised proposal for one company, for human review.', 'service', ARRAY['generate_personalized_proposal'], ARRAY['generate_proposal'], 0.50)
    ) AS s(key, name, description, runtime, tools, effects, max_cost)
  LOOP
    IF EXISTS (SELECT 1 FROM public.agent_definitions WHERE tenant_id = t AND key = spec.key) THEN CONTINUE; END IF;
    INSERT INTO public.agent_definitions (tenant_id, key, name, description, runtime, created_by) VALUES (t, spec.key, spec.name, spec.description, spec.runtime, 'migration-0070') RETURNING id INTO def_id;
    INSERT INTO public.agent_versions (tenant_id, definition_id, version, tools, effects, max_cost_usd, notes, created_by)
      VALUES (t, def_id, 1, spec.tools, spec.effects, spec.max_cost, 'Registered from the agent as it ran before agent versions existed.', 'migration-0070') RETURNING id INTO ver_id;
    INSERT INTO public.agent_version_events (tenant_id, version_id, event_type, evidence, actor_kind, actor_id)
      VALUES (t, ver_id, 'promoted', jsonb_build_object('grandfathered', true, 'note', 'Live before agent versions and promotion gates existed.'), 'service', 'migration-0070');
    INSERT INTO public.agent_assignments (tenant_id, definition_id, scope_kind, scope_id, allowed_effects, max_cost_usd, justification, grandfathered, assigned_by)
      VALUES (t, def_id, 'all_companies', NULL, spec.effects, spec.max_cost, 'Grandfathered: this agent already ran across all companies before assignments existed. Narrow or revoke it as needed.', true, 'migration-0070');
  END LOOP;
END $$;

-- ═══ access ══════════════════════════════════════════════════════════════════════════════════

ALTER TABLE public.agent_effects          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_definitions      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_versions         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_version_events   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_assignments      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_actions          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_action_events    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.approval_blocks        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.batch_limits           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.batch_decisions        ENABLE ROW LEVEL SECURITY;
DO $$
DECLARE
  tbl text;
BEGIN
  FOREACH tbl IN ARRAY ARRAY['agent_effects', 'agent_definitions', 'agent_versions', 'agent_version_events', 'agent_assignments', 'agent_actions', 'agent_action_events', 'approval_blocks', 'batch_limits', 'batch_decisions'] LOOP
    EXECUTE format('DROP POLICY IF EXISTS "service_all_%s" ON public.%I', tbl, tbl);
    EXECUTE format('CREATE POLICY "service_all_%s" ON public.%I FOR ALL TO service_role USING (true) WITH CHECK (true)', tbl, tbl);
  END LOOP;
END $$;

-- The state machine and its helpers are for the server only.
DO $$
DECLARE
  fn text;
BEGIN
  FOREACH fn IN ARRAY ARRAY[
    'public.approval_standing(uuid, text, text[])', 'public.agent_active_version(uuid)', 'public.agent_version_promote(uuid, text, text, jsonb)',
    'public.agent_assignment_for(uuid, text, uuid, uuid, text)',
    'public.agent_action_request(uuid, uuid, text, uuid, uuid, text, uuid, jsonb, text, text, text, text, uuid)',
    'public.agent_action_transition(uuid, text, text, text, text, jsonb)', 'public.agent_actions_sweep_stuck(integer)', 'public.agent_action_get(uuid)'
  ] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated', fn);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', fn);
  END LOOP;
END $$;

NOTIFY pgrst, 'reload schema';
