-- Migration 0071: a deletion that can be undone completely (Task 24, found in the live test of 0069).
--
-- 0069 kept a snapshot of the core records a delete removed. The live test showed that is not enough to
-- undo a deletion, because deleting a company also:
--   * cascades into about 30 other tables (research, recaps, briefs, proposal parts, event histories...)
--     that had no tombstone, so an undo would bring the company back without them; and
--   * silently UNLINKS other records (an in-force contract loses its company, emails lose their thread)
--     through ON DELETE SET NULL, which left nothing behind to link them back.
--
-- This migration closes both:
--   * every table reachable by a cascading foreign key from a core table gets the tombstone trigger, and rows
--     removed by the same delete inherit who deleted them and why;
--   * the records a delete unlinked are written into the tombstone (column "detached") and re-linked on undo;
--   * the undo copes with the order rows have to come back in (a row waiting for another row is retried
--     after it) and reports what it restored and what it re-linked.
--
-- It also adds agent_install_standard(): a new tenant had no agents registered (0070 seeded only the first tenant),
-- so all agent work was refused there; an administrator can now install the six standard agents in one step.
--
-- Additive. Until it is applied, deletes still leave 0069's snapshots.

ALTER TABLE public.record_tombstones ADD COLUMN IF NOT EXISTS detached jsonb NOT NULL DEFAULT '{}'::jsonb;

-- The records that point at this one with ON DELETE SET NULL, as { "child.column": [ids] }.
CREATE OR REPLACE FUNCTION public.tombstone_detached(p_table regclass, p_id uuid) RETURNS jsonb AS $$
DECLARE
  c record;
  ids jsonb;
  result jsonb := '{}'::jsonb;
BEGIN
  FOR c IN
    SELECT con.conrelid AS rel, con.conrelid::regclass::text AS child, att.attname AS col
      FROM pg_constraint con
      JOIN pg_attribute att ON att.attrelid = con.conrelid AND att.attnum = con.conkey[1]
     WHERE con.contype = 'f' AND con.confrelid = p_table AND con.confdeltype = 'n' AND array_length(con.conkey, 1) = 1
  LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_attribute a WHERE a.attrelid = c.rel AND a.attname = 'id' AND NOT a.attisdropped) THEN
      CONTINUE;
    END IF;
    EXECUTE format('SELECT coalesce(jsonb_agg(id), ''[]''::jsonb) FROM (SELECT id FROM %s WHERE %I = $1 AND id <> $1 LIMIT 5001) s', c.child, c.col) INTO ids USING p_id;
    IF jsonb_array_length(ids) > 5000 THEN
      RAISE EXCEPTION 'more than 5000 records in % would be unlinked by this delete; it cannot be undone safely, so it is refused', c.child;
    END IF;
    IF jsonb_array_length(ids) > 0 THEN
      result := result || jsonb_build_object(c.child || '.' || c.col, ids);
    END IF;
  END LOOP;
  RETURN result;
END;
$$ LANGUAGE plpgsql STABLE;

-- A row removed by a cascade has no intent of its own: it takes the attribution of the row that started the delete.
CREATE OR REPLACE FUNCTION public.tombstone_on_delete() RETURNS trigger AS $$
DECLARE
  j jsonb := to_jsonb(OLD);
  v_tenant uuid := nullif(j->>'tenant_id', '')::uuid;
  v_id uuid := nullif(j->>'id', '')::uuid;
  i public.tombstone_intents;
  found_intent boolean := false;
  head public.record_tombstones;
  v_group text := txid_current()::text;
BEGIN
  IF v_id IS NULL OR v_tenant IS NULL THEN
    RETURN OLD;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.tenants WHERE id = v_tenant) THEN
    RETURN OLD;
  END IF;
  SELECT * INTO i FROM public.tombstone_intents
   WHERE record_type = TG_TABLE_NAME AND record_id = v_id AND consumed_at IS NULL AND created_at > clock_timestamp() - interval '5 minutes'
   ORDER BY created_at DESC LIMIT 1;
  found_intent := FOUND;
  IF found_intent THEN
    UPDATE public.tombstone_intents SET consumed_at = clock_timestamp() WHERE id = i.id;
    INSERT INTO public.record_tombstones (tenant_id, record_type, record_id, snapshot, dependents, detached, deleted_by_kind, deleted_by, attributed, reason, group_id)
    VALUES (v_tenant, TG_TABLE_NAME, v_id, j, public.tombstone_dependents(TG_RELID, v_id), public.tombstone_detached(TG_RELID, v_id), i.actor_kind, i.actor_id, true, i.reason, v_group);
    RETURN OLD;
  END IF;
  -- part of a delete someone else already declared in this same transaction?
  SELECT * INTO head FROM public.record_tombstones WHERE group_id = v_group AND tenant_id = v_tenant AND attributed ORDER BY seq LIMIT 1;
  IF FOUND THEN
    INSERT INTO public.record_tombstones (tenant_id, record_type, record_id, snapshot, dependents, detached, deleted_by_kind, deleted_by, attributed, reason, group_id)
    VALUES (v_tenant, TG_TABLE_NAME, v_id, j, public.tombstone_dependents(TG_RELID, v_id), public.tombstone_detached(TG_RELID, v_id), head.deleted_by_kind, head.deleted_by, true, head.reason, v_group);
  ELSE
    INSERT INTO public.record_tombstones (tenant_id, record_type, record_id, snapshot, dependents, detached, deleted_by_kind, deleted_by, attributed, reason, group_id)
    VALUES (v_tenant, TG_TABLE_NAME, v_id, j, public.tombstone_dependents(TG_RELID, v_id), public.tombstone_detached(TG_RELID, v_id), 'service', 'unattributed (direct database delete)', false, NULL, v_group);
  END IF;
  RETURN OLD;
END;
$$ LANGUAGE plpgsql;

-- The history of a deletion cannot be edited; the list of what it unlinked is part of that history.
CREATE OR REPLACE FUNCTION public.record_tombstones_guard() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF EXISTS (SELECT 1 FROM public.tenants WHERE id = OLD.tenant_id) THEN
      RAISE EXCEPTION 'record_tombstones rows cannot be deleted';
    END IF;
    RETURN OLD;
  END IF;
  IF OLD.restored_at IS NOT NULL OR NEW.restored_at IS NULL
     OR NEW.snapshot IS DISTINCT FROM OLD.snapshot OR NEW.record_id IS DISTINCT FROM OLD.record_id OR NEW.record_type IS DISTINCT FROM OLD.record_type
     OR NEW.tenant_id IS DISTINCT FROM OLD.tenant_id OR NEW.deleted_by IS DISTINCT FROM OLD.deleted_by OR NEW.deleted_at IS DISTINCT FROM OLD.deleted_at
     OR NEW.group_id IS DISTINCT FROM OLD.group_id OR NEW.dependents IS DISTINCT FROM OLD.dependents OR NEW.detached IS DISTINCT FROM OLD.detached THEN
    RAISE EXCEPTION 'a tombstone can only be marked restored, once; its history cannot be changed';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Put the trigger on everything a delete of a core record can reach through a cascading foreign key.
DO $$
DECLARE
  tbl text;
BEGIN
  FOR tbl IN
    WITH RECURSIVE core(t) AS (
      SELECT unnest(ARRAY['companies', 'contacts', 'proposals', 'campaigns', 'matches', 'team_members', 'contracts', 'opportunities', 'projects',
                          'obligations', 'value_lines', 'inventory_items', 'email_templates', 'warmup_sequences', 'barter_items', 'pipeline_leads']::text[])
    ), closure(child, depth) AS (
      SELECT con.conrelid::regclass::text, 1
        FROM pg_constraint con
       WHERE con.contype = 'f' AND con.confdeltype = 'c' AND con.confrelid::regclass::text IN (SELECT t FROM core)
      UNION
      SELECT con.conrelid::regclass::text, c.depth + 1
        FROM pg_constraint con JOIN closure c ON con.confrelid::regclass::text = c.child
       WHERE con.contype = 'f' AND con.confdeltype = 'c' AND c.depth < 8
    )
    SELECT DISTINCT child FROM closure
     WHERE child NOT IN ('audit_logs', 'record_tombstones', 'tombstone_intents', 'idempotency_keys', 'external_refs', 'spend_ledger')
  LOOP
    IF to_regclass('public.' || tbl) IS NOT NULL
       AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = tbl AND column_name = 'id' AND data_type = 'uuid')
       AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = tbl AND column_name = 'tenant_id') THEN
      EXECUTE format('DROP TRIGGER IF EXISTS trg_tombstone ON public.%I', tbl);
      EXECUTE format('CREATE TRIGGER trg_tombstone BEFORE DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.tombstone_on_delete()', tbl);
    END IF;
  END LOOP;
END $$;

-- Undo a deletion: everything that one delete removed comes back with the same IDs, and what it unlinked is linked again.
-- Rows that must wait for another row are tried again after it; if nothing more can come back the whole undo is refused.
CREATE OR REPLACE FUNCTION public.restore_tombstone_group(p_tombstone uuid, p_actor text, p_note text DEFAULT NULL) RETURNS jsonb AS $$
DECLARE
  t public.record_tombstones;
  r public.record_tombstones;
  cols text;
  restored jsonb := '[]'::jsonb;
  relinked jsonb := '{}'::jsonb;
  pending uuid[];
  next_pending uuid[];
  tid uuid;
  progress boolean;
  last_err text;
  k text;
  ids jsonb;
  n bigint;
  restored_ids uuid[] := '{}';
BEGIN
  IF p_actor IS NULL OR length(btrim(p_actor)) = 0 THEN
    RAISE EXCEPTION 'a restore needs a person';
  END IF;
  SELECT * INTO t FROM public.record_tombstones WHERE id = p_tombstone FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'tombstone not found'; END IF;
  IF t.restored_at IS NOT NULL THEN RAISE EXCEPTION 'this deletion was already undone'; END IF;

  pending := ARRAY(SELECT id FROM public.record_tombstones WHERE group_id = t.group_id AND tenant_id = t.tenant_id AND restored_at IS NULL ORDER BY seq);
  WHILE cardinality(pending) > 0 LOOP
    progress := false;
    next_pending := '{}';
    FOREACH tid IN ARRAY pending LOOP
      SELECT * INTO r FROM public.record_tombstones WHERE id = tid;
      BEGIN
        SELECT string_agg(quote_ident(key), ', ') INTO cols
          FROM jsonb_object_keys(r.snapshot) AS key
          JOIN information_schema.columns c ON c.table_schema = 'public' AND c.table_name = r.record_type AND c.column_name = key AND c.is_generated = 'NEVER';
        EXECUTE format('INSERT INTO public.%I (%s) SELECT %s FROM jsonb_populate_record(NULL::public.%I, $1)', r.record_type, cols, cols, r.record_type) USING r.snapshot;
        UPDATE public.record_tombstones SET restored_at = clock_timestamp(), restored_by = p_actor, restore_note = p_note WHERE id = r.id;
        restored := restored || jsonb_build_array(jsonb_build_object('record_type', r.record_type, 'record_id', r.record_id));
        restored_ids := restored_ids || r.id;
        progress := true;
      EXCEPTION WHEN foreign_key_violation THEN
        next_pending := next_pending || tid;
        last_err := SQLERRM;
      END;
    END LOOP;
    IF NOT progress THEN
      RAISE EXCEPTION 'this deletion cannot be undone as it was, because a record it needs is gone: %', last_err;
    END IF;
    pending := next_pending;
  END LOOP;

  -- link back what the delete unlinked, but only where the link is still empty (someone may have set it since)
  FOR r IN SELECT * FROM public.record_tombstones WHERE id = ANY (restored_ids) AND detached <> '{}'::jsonb ORDER BY seq LOOP
    FOR k, ids IN SELECT key, value FROM jsonb_each(r.detached) LOOP
      EXECUTE format('UPDATE public.%I SET %I = $1 WHERE id IN (SELECT jsonb_array_elements_text($2)::uuid) AND %I IS NULL', split_part(k, '.', 1), split_part(k, '.', 2), split_part(k, '.', 2))
        USING r.record_id, ids;
      GET DIAGNOSTICS n = ROW_COUNT;
      IF n > 0 THEN
        relinked := relinked || jsonb_build_object(k, coalesce((relinked->>k)::bigint, 0) + n);
      END IF;
    END LOOP;
  END LOOP;

  RETURN jsonb_build_object('restored', restored, 'relinked', relinked);
END;
$$ LANGUAGE plpgsql;

REVOKE ALL ON FUNCTION public.tombstone_detached(regclass, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.tombstone_detached(regclass, uuid) TO service_role;
REVOKE ALL ON FUNCTION public.restore_tombstone_group(uuid, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.restore_tombstone_group(uuid, text, text) TO service_role;

-- ═══ install the standard agents into any tenant (Task 26 follow-up) ═══════════════════════════
--
-- Migration 0070 registered the six standard agents for the first tenant only. Every other tenant started with
-- none, so every agent was refused there until an administrator built each one by hand. This installs the same six
-- (definition, version 1, promoted with the evidence "standard catalog") into a tenant. It grants NO authority unless
-- p_assign is true, in which case each is assigned workspace-wide with the installer named as the reason.

CREATE OR REPLACE FUNCTION public.agent_install_standard(p_tenant uuid, p_actor text, p_assign boolean DEFAULT false) RETURNS jsonb AS $$
DECLARE
  spec record;
  def_id uuid;
  ver_id uuid;
  installed jsonb := '[]'::jsonb;
  skipped jsonb := '[]'::jsonb;
BEGIN
  IF p_actor IS NULL OR length(btrim(p_actor)) = 0 THEN RAISE EXCEPTION 'installing agents needs a person'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.tenants WHERE id = p_tenant) THEN RAISE EXCEPTION 'tenant not found'; END IF;
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
    IF EXISTS (SELECT 1 FROM public.agent_definitions WHERE tenant_id = p_tenant AND key = spec.key) THEN
      skipped := skipped || to_jsonb(spec.key);
      CONTINUE;
    END IF;
    INSERT INTO public.agent_definitions (tenant_id, key, name, description, runtime, created_by) VALUES (p_tenant, spec.key, spec.name, spec.description, spec.runtime, p_actor) RETURNING id INTO def_id;
    INSERT INTO public.agent_versions (tenant_id, definition_id, version, tools, effects, max_cost_usd, notes, created_by)
      VALUES (p_tenant, def_id, 1, spec.tools, spec.effects, spec.max_cost, 'Standard agent from the platform catalog.', p_actor) RETURNING id INTO ver_id;
    INSERT INTO public.agent_version_events (tenant_id, version_id, event_type, evidence, actor_kind, actor_id)
      VALUES (p_tenant, ver_id, 'promoted', jsonb_build_object('standard_catalog', true, 'installed_by', p_actor), 'human', p_actor);
    IF p_assign THEN
      INSERT INTO public.agent_assignments (tenant_id, definition_id, scope_kind, scope_id, allowed_effects, max_cost_usd, justification, assigned_by)
        VALUES (p_tenant, def_id, 'all_companies', NULL, spec.effects, spec.max_cost, 'Assigned workspace-wide by ' || p_actor || ' when the standard agents were installed.', p_actor);
    END IF;
    installed := installed || to_jsonb(spec.key);
  END LOOP;
  RETURN jsonb_build_object('installed', installed, 'skipped', skipped, 'assigned', p_assign);
END;
$$ LANGUAGE plpgsql;

REVOKE ALL ON FUNCTION public.agent_install_standard(uuid, text, boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.agent_install_standard(uuid, text, boolean) TO service_role;

NOTIFY pgrst, 'reload schema';
