-- Migration 0069: effective identity and an immutable audit trail (Task 23);
-- tombstones, idempotency keys and stable external references (Task 24).
--
-- TASK 23
--   Every audit entry names WHO did it and in what capacity: a person (human), a person deciding
--   (approver), an agent, a platform service, or an outside party with no login (external). Entries
--   before this migration are kept and marked legacy: their actor was never recorded. The log is
--   append-only (no edits, no deletes, no truncate), chained by hash per tenant so tampering is
--   detectable, and nobody with a login can write to it directly: the old policy that let any signed-in
--   user insert any audit row (for any tenant) is removed.
--
-- TASK 24
--   record_tombstones   a snapshot of every core record at the moment it is deleted, taken by the
--                       database itself so no code path can skip it, with who deleted it and why,
--                       and what else went with it. A deletion can be undone, whole, with the same IDs.
--   idempotency_keys    a retried request returns the original answer instead of doing the work twice.
--   external_refs       the stable link between a record and its ID in an outside system.
--
-- Additive, except that audit_logs now refuses edits, deletes and unattributed inserts.

-- ═══ TASK 23: identity on the audit log ═══════════════════════════════════════════════════════

ALTER TABLE public.audit_logs
  ADD COLUMN IF NOT EXISTS actor_kind  text,
  ADD COLUMN IF NOT EXISTS actor_id    text,
  ADD COLUMN IF NOT EXISTS actor_label text,
  ADD COLUMN IF NOT EXISTS actor_role  text,
  ADD COLUMN IF NOT EXISTS on_behalf_of text,
  ADD COLUMN IF NOT EXISTS request_id  text,
  ADD COLUMN IF NOT EXISTS seq         bigint,
  ADD COLUMN IF NOT EXISTS prev_hash   text,
  ADD COLUMN IF NOT EXISTS row_hash    text;

CREATE SEQUENCE IF NOT EXISTS public.audit_logs_seq;

-- The hash of one entry covers everything that says what happened and who did it, plus the hash before it.
CREATE OR REPLACE FUNCTION public.audit_row_hash(r public.audit_logs) RETURNS text AS $$
  SELECT encode(sha256(convert_to(concat_ws('|',
    r.tenant_id::text, r.seq::text, coalesce(r.prev_hash, ''),
    to_char(r.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US'),
    r.entity_type, coalesce(r.entity_id::text, ''), r.action,
    r.actor_kind, r.actor_id, coalesce(r.actor_email, ''), coalesce(r.on_behalf_of, ''),
    coalesce(r.metadata::text, '')
  ), 'UTF8')), 'hex');
$$ LANGUAGE sql STABLE;

-- Before the log is sealed: lead details are personal data and must be erasable, so they move to their own
-- table and the log keeps a reference; credentials and raw identifiers that old entries carried are replaced
-- by a fingerprint. After this the log can never be edited, so this is the one chance to clean it.
CREATE TABLE IF NOT EXISTS public.proposal_interests (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  proposal_id   uuid NOT NULL REFERENCES public.proposals(id) ON DELETE CASCADE,
  contact_name  text,
  contact_email text,
  contact_phone text,
  company       text,
  message       text,
  lgpd_consent  boolean,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_proposal_interests_proposal ON public.proposal_interests (proposal_id);
ALTER TABLE public.proposal_interests ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "service_all_proposal_interests" ON public.proposal_interests;
CREATE POLICY "service_all_proposal_interests" ON public.proposal_interests FOR ALL TO service_role USING (true) WITH CHECK (true);

DO $$
DECLARE
  r public.audit_logs;
  new_id uuid;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.audit_logs WHERE row_hash IS NULL) THEN
    RETURN;
  END IF;
  ALTER TABLE public.audit_logs DISABLE TRIGGER USER;
  FOR r IN
    SELECT * FROM public.audit_logs a
     WHERE a.row_hash IS NULL AND a.action = 'proposal.interest_submitted' AND a.metadata ? 'contact_email' AND a.entity_id IS NOT NULL
       AND EXISTS (SELECT 1 FROM public.proposals p WHERE p.id = a.entity_id)
  LOOP
    INSERT INTO public.proposal_interests (tenant_id, proposal_id, contact_name, contact_email, contact_phone, company, message, lgpd_consent, created_at)
    VALUES (r.tenant_id, r.entity_id, r.metadata->>'contact_name', r.metadata->>'contact_email', r.metadata->>'contact_phone', r.metadata->>'company', r.metadata->>'message',
            CASE WHEN jsonb_typeof(r.metadata->'lgpd_consent') = 'boolean' THEN (r.metadata->>'lgpd_consent')::boolean END, r.created_at)
    RETURNING id INTO new_id;
    UPDATE public.audit_logs SET metadata = jsonb_build_object('interest_id', new_id, 'lgpd_consent', r.metadata->'lgpd_consent', 'details_moved_by_migration', '0069') WHERE id = r.id;
  END LOOP;
  -- a sign-in link works as a password while it is valid
  UPDATE public.audit_logs SET metadata = metadata - 'magic_link' WHERE row_hash IS NULL AND action = 'portal.magic_link_requested' AND metadata ? 'magic_link';
  -- a share token works as a password for the proposal
  UPDATE public.audit_logs
     SET metadata = (metadata - 'token') || jsonb_build_object('token_fingerprint', left(encode(sha256(convert_to(metadata->>'token', 'UTF8')), 'hex'), 16))
   WHERE row_hash IS NULL AND metadata ? 'token' AND action IN ('proposal.view');
  -- raw IP addresses of email recipients
  UPDATE public.audit_logs
     SET metadata = (metadata - 'ip') || jsonb_build_object('ip_fingerprint', left(encode(sha256(convert_to(metadata->>'ip', 'UTF8')), 'hex'), 16))
   WHERE row_hash IS NULL AND metadata ? 'ip' AND action IN ('email.opened', 'email.clicked');
  ALTER TABLE public.audit_logs ENABLE TRIGGER USER;
END $$;

-- Existing entries: keep them, mark them legacy, and chain them in the order they were written.
DO $$
DECLARE
  t uuid;
  r public.audit_logs;
  prev text;
  upd public.audit_logs;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.audit_logs WHERE row_hash IS NULL) THEN
    RETURN;
  END IF;
  ALTER TABLE public.audit_logs DISABLE TRIGGER USER;
  FOR t IN SELECT DISTINCT tenant_id FROM public.audit_logs WHERE row_hash IS NULL LOOP
    SELECT a.row_hash INTO prev FROM public.audit_logs a WHERE a.tenant_id = t AND a.row_hash IS NOT NULL ORDER BY a.seq DESC LIMIT 1;
    FOR r IN SELECT * FROM public.audit_logs WHERE tenant_id = t AND row_hash IS NULL ORDER BY created_at, id LOOP
      UPDATE public.audit_logs
         SET seq = nextval('public.audit_logs_seq'),
             actor_kind = coalesce(actor_kind, 'legacy'),
             actor_id = coalesce(actor_id, actor_email, 'unknown'),
             actor_label = coalesce(actor_label, actor_email, 'legacy entry: the actor was not recorded'),
             prev_hash = prev
       WHERE id = r.id
       RETURNING * INTO upd;
      UPDATE public.audit_logs SET row_hash = public.audit_row_hash(upd) WHERE id = r.id RETURNING row_hash INTO prev;
    END LOOP;
  END LOOP;
  ALTER TABLE public.audit_logs ENABLE TRIGGER USER;
END $$;

ALTER TABLE public.audit_logs ALTER COLUMN actor_kind SET NOT NULL;
ALTER TABLE public.audit_logs ALTER COLUMN actor_id   SET NOT NULL;
ALTER TABLE public.audit_logs ALTER COLUMN seq        SET NOT NULL;
ALTER TABLE public.audit_logs ALTER COLUMN row_hash   SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'audit_logs_actor_chk' AND conrelid = 'public.audit_logs'::regclass) THEN
    ALTER TABLE public.audit_logs ADD CONSTRAINT audit_logs_actor_chk CHECK (
      actor_kind IN ('human', 'approver', 'agent', 'service', 'external', 'legacy') AND length(btrim(actor_id)) > 0
    );
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS uq_audit_logs_tenant_seq ON public.audit_logs (tenant_id, seq);
CREATE INDEX IF NOT EXISTS idx_audit_logs_actor ON public.audit_logs (tenant_id, actor_kind, created_at DESC);

-- Deleting a tenant removes its audit entries with it; nothing else can remove them.
ALTER TABLE public.audit_logs DROP CONSTRAINT IF EXISTS audit_logs_tenant_id_fkey;
ALTER TABLE public.audit_logs ADD CONSTRAINT audit_logs_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;

-- A new entry must name an actor, is stamped with the real time, and is chained to the one before it.
CREATE OR REPLACE FUNCTION public.audit_logs_chain() RETURNS trigger AS $$
DECLARE
  prev text;
BEGIN
  IF NEW.actor_kind IS NULL OR NEW.actor_kind = 'legacy' THEN
    RAISE EXCEPTION 'an audit entry needs an actor: human, approver, agent, service or external';
  END IF;
  IF NEW.actor_id IS NULL OR length(btrim(NEW.actor_id)) = 0 THEN
    RAISE EXCEPTION 'an audit entry needs an actor id';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(NEW.tenant_id::text, 69));
  NEW.created_at := clock_timestamp();
  NEW.updated_at := NEW.created_at;
  NEW.seq := nextval('public.audit_logs_seq');
  SELECT a.row_hash INTO prev FROM public.audit_logs a WHERE a.tenant_id = NEW.tenant_id ORDER BY a.seq DESC LIMIT 1;
  NEW.prev_hash := prev;
  NEW.row_hash := public.audit_row_hash(NEW);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION public.audit_logs_immutable() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'TRUNCATE' THEN
    RAISE EXCEPTION 'the audit log cannot be truncated';
  END IF;
  IF TG_OP = 'UPDATE' THEN
    RAISE EXCEPTION 'audit_logs rows are immutable';
  END IF;
  -- DELETE: only as part of removing the whole tenant
  IF EXISTS (SELECT 1 FROM public.tenants WHERE id = OLD.tenant_id) THEN
    RAISE EXCEPTION 'audit_logs rows cannot be deleted';
  END IF;
  RETURN OLD;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_audit_logs_chain ON public.audit_logs;
CREATE TRIGGER trg_audit_logs_chain BEFORE INSERT ON public.audit_logs FOR EACH ROW EXECUTE FUNCTION public.audit_logs_chain();
DROP TRIGGER IF EXISTS trg_audit_logs_immutable ON public.audit_logs;
CREATE TRIGGER trg_audit_logs_immutable BEFORE UPDATE OR DELETE ON public.audit_logs FOR EACH ROW EXECUTE FUNCTION public.audit_logs_immutable();
DROP TRIGGER IF EXISTS trg_audit_logs_no_truncate ON public.audit_logs;
CREATE TRIGGER trg_audit_logs_no_truncate BEFORE TRUNCATE ON public.audit_logs FOR EACH STATEMENT EXECUTE FUNCTION public.audit_logs_immutable();

-- Does the chain still hold? Returns the first entry that does not.
CREATE OR REPLACE FUNCTION public.audit_verify_chain(p_tenant uuid)
RETURNS TABLE (ok boolean, checked bigint, first_bad_seq bigint, reason text) AS $$
DECLARE
  r public.audit_logs;
  prev text := NULL;
  n bigint := 0;
BEGIN
  FOR r IN SELECT * FROM public.audit_logs WHERE tenant_id = p_tenant ORDER BY seq LOOP
    IF r.prev_hash IS DISTINCT FROM prev THEN
      RETURN QUERY SELECT false, n, r.seq, 'an entry before this one was removed or changed'::text;
      RETURN;
    END IF;
    IF r.row_hash IS DISTINCT FROM public.audit_row_hash(r) THEN
      RETURN QUERY SELECT false, n, r.seq, 'this entry was changed after it was written'::text;
      RETURN;
    END IF;
    prev := r.row_hash;
    n := n + 1;
  END LOOP;
  RETURN QUERY SELECT true, n, NULL::bigint, NULL::text;
END;
$$ LANGUAGE plpgsql STABLE;

-- Nobody with a login writes the audit log directly: only the server does, after checking who they are.
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "audit_logs_insert_any" ON public.audit_logs;

-- ═══ TASK 24: tombstones ══════════════════════════════════════════════════════════════════════

-- A person (or the server on their behalf) says "I am deleting this, and why" just before the delete.
CREATE TABLE IF NOT EXISTS public.tombstone_intents (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  record_type  text NOT NULL CHECK (length(btrim(record_type)) > 0),
  record_id    uuid NOT NULL,
  actor_kind   text NOT NULL CHECK (actor_kind IN ('human', 'approver', 'agent', 'service', 'external')),
  actor_id     text NOT NULL CHECK (length(btrim(actor_id)) > 0),
  reason       text,
  consumed_at  timestamptz,
  created_at   timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX IF NOT EXISTS idx_tombstone_intents_lookup ON public.tombstone_intents (record_type, record_id, created_at DESC) WHERE consumed_at IS NULL;

CREATE TABLE IF NOT EXISTS public.record_tombstones (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  seq             bigint GENERATED ALWAYS AS IDENTITY,
  tenant_id       uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  record_type     text NOT NULL,
  record_id       uuid NOT NULL,
  snapshot        jsonb NOT NULL,
  -- rows that went with it (first-level cascades), counted just before the delete
  dependents      jsonb NOT NULL DEFAULT '{}'::jsonb,
  deleted_by_kind text NOT NULL,
  deleted_by      text NOT NULL,
  -- false when nobody said they were deleting it (a direct database delete)
  attributed      boolean NOT NULL,
  reason          text,
  -- every row removed by one delete operation shares a group, so one undo brings them all back
  group_id        text NOT NULL,
  deleted_at      timestamptz NOT NULL DEFAULT clock_timestamp(),
  restored_at     timestamptz,
  restored_by     text,
  restore_note    text,
  CHECK ((restored_at IS NULL) = (restored_by IS NULL))
);
CREATE INDEX IF NOT EXISTS idx_record_tombstones_record ON public.record_tombstones (tenant_id, record_type, record_id);
CREATE INDEX IF NOT EXISTS idx_record_tombstones_group ON public.record_tombstones (group_id);
CREATE INDEX IF NOT EXISTS idx_record_tombstones_recent ON public.record_tombstones (tenant_id, deleted_at DESC);

-- How many rows would a delete take with it? Counted through the foreign keys that cascade.
CREATE OR REPLACE FUNCTION public.tombstone_dependents(p_table regclass, p_id uuid) RETURNS jsonb AS $$
DECLARE
  c record;
  n bigint;
  result jsonb := '{}'::jsonb;
BEGIN
  FOR c IN
    SELECT con.conrelid::regclass::text AS child, att.attname AS col
      FROM pg_constraint con
      JOIN pg_attribute att ON att.attrelid = con.conrelid AND att.attnum = con.conkey[1]
     WHERE con.contype = 'f' AND con.confrelid = p_table AND con.confdeltype = 'c' AND array_length(con.conkey, 1) = 1
  LOOP
    EXECUTE format('SELECT count(*) FROM %s WHERE %I = $1', c.child, c.col) INTO n USING p_id;
    IF n > 0 THEN result := result || jsonb_build_object(c.child, n); END IF;
  END LOOP;
  RETURN result;
END;
$$ LANGUAGE plpgsql STABLE;

-- Fires before every delete on a core table, so no code path can skip it.
CREATE OR REPLACE FUNCTION public.tombstone_on_delete() RETURNS trigger AS $$
DECLARE
  j jsonb := to_jsonb(OLD);
  v_tenant uuid := nullif(j->>'tenant_id', '')::uuid;
  v_id uuid := nullif(j->>'id', '')::uuid;
  i public.tombstone_intents;
  found_intent boolean := false;
BEGIN
  IF v_id IS NULL OR v_tenant IS NULL THEN
    RETURN OLD;
  END IF;
  -- the whole tenant is being removed: nothing to keep a tombstone for
  IF NOT EXISTS (SELECT 1 FROM public.tenants WHERE id = v_tenant) THEN
    RETURN OLD;
  END IF;
  SELECT * INTO i FROM public.tombstone_intents
   WHERE record_type = TG_TABLE_NAME AND record_id = v_id AND consumed_at IS NULL AND created_at > clock_timestamp() - interval '5 minutes'
   ORDER BY created_at DESC LIMIT 1;
  found_intent := FOUND;
  IF found_intent THEN
    UPDATE public.tombstone_intents SET consumed_at = clock_timestamp() WHERE id = i.id;
  END IF;
  INSERT INTO public.record_tombstones (tenant_id, record_type, record_id, snapshot, dependents, deleted_by_kind, deleted_by, attributed, reason, group_id)
  VALUES (
    v_tenant, TG_TABLE_NAME, v_id, j, public.tombstone_dependents(TG_RELID, v_id),
    CASE WHEN found_intent THEN i.actor_kind ELSE 'service' END,
    CASE WHEN found_intent THEN i.actor_id ELSE 'unattributed (direct database delete)' END,
    found_intent, CASE WHEN found_intent THEN i.reason ELSE NULL END, txid_current()::text
  );
  RETURN OLD;
END;
$$ LANGUAGE plpgsql;

-- Attach it to every core, non-ledger table that exists.
DO $$
DECLARE
  tbl text;
BEGIN
  FOREACH tbl IN ARRAY ARRAY[
    'companies', 'contacts', 'proposals', 'campaigns', 'matches', 'team_members', 'contracts', 'opportunities', 'projects',
    'obligations', 'value_lines', 'inventory_items', 'email_templates', 'warmup_sequences', 'barter_items', 'pipeline_leads'
  ] LOOP
    IF to_regclass('public.' || tbl) IS NOT NULL THEN
      EXECUTE format('DROP TRIGGER IF EXISTS trg_tombstone ON public.%I', tbl);
      EXECUTE format('CREATE TRIGGER trg_tombstone BEFORE DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.tombstone_on_delete()', tbl);
    END IF;
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION public.record_tombstones_guard() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF EXISTS (SELECT 1 FROM public.tenants WHERE id = OLD.tenant_id) THEN
      RAISE EXCEPTION 'record_tombstones rows cannot be deleted';
    END IF;
    RETURN OLD;
  END IF;
  -- UPDATE: only to mark a restore, once
  IF OLD.restored_at IS NOT NULL OR NEW.restored_at IS NULL
     OR NEW.snapshot IS DISTINCT FROM OLD.snapshot OR NEW.record_id IS DISTINCT FROM OLD.record_id OR NEW.record_type IS DISTINCT FROM OLD.record_type
     OR NEW.tenant_id IS DISTINCT FROM OLD.tenant_id OR NEW.deleted_by IS DISTINCT FROM OLD.deleted_by OR NEW.deleted_at IS DISTINCT FROM OLD.deleted_at
     OR NEW.group_id IS DISTINCT FROM OLD.group_id OR NEW.dependents IS DISTINCT FROM OLD.dependents THEN
    RAISE EXCEPTION 'a tombstone can only be marked restored, once; its history cannot be changed';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_record_tombstones_guard ON public.record_tombstones;
CREATE TRIGGER trg_record_tombstones_guard BEFORE UPDATE OR DELETE ON public.record_tombstones FOR EACH ROW EXECUTE FUNCTION public.record_tombstones_guard();

-- Undo a deletion: everything that one delete removed comes back, in the order it was removed, with the same IDs.
CREATE OR REPLACE FUNCTION public.restore_tombstone_group(p_tombstone uuid, p_actor text, p_note text DEFAULT NULL) RETURNS jsonb AS $$
DECLARE
  t public.record_tombstones;
  r public.record_tombstones;
  cols text;
  restored jsonb := '[]'::jsonb;
BEGIN
  IF p_actor IS NULL OR length(btrim(p_actor)) = 0 THEN
    RAISE EXCEPTION 'a restore needs a person';
  END IF;
  SELECT * INTO t FROM public.record_tombstones WHERE id = p_tombstone FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'tombstone not found'; END IF;
  IF t.restored_at IS NOT NULL THEN RAISE EXCEPTION 'this deletion was already undone'; END IF;
  FOR r IN SELECT * FROM public.record_tombstones WHERE group_id = t.group_id AND tenant_id = t.tenant_id AND restored_at IS NULL ORDER BY seq LOOP
    SELECT string_agg(quote_ident(k), ', ') INTO cols
      FROM jsonb_object_keys(r.snapshot) AS k
      JOIN information_schema.columns c ON c.table_schema = 'public' AND c.table_name = r.record_type AND c.column_name = k AND c.is_generated = 'NEVER';
    EXECUTE format('INSERT INTO public.%I (%s) SELECT %s FROM jsonb_populate_record(NULL::public.%I, $1)', r.record_type, cols, cols, r.record_type) USING r.snapshot;
    UPDATE public.record_tombstones SET restored_at = clock_timestamp(), restored_by = p_actor, restore_note = p_note WHERE id = r.id;
    restored := restored || jsonb_build_array(jsonb_build_object('record_type', r.record_type, 'record_id', r.record_id));
  END LOOP;
  RETURN restored;
END;
$$ LANGUAGE plpgsql;

-- ═══ TASK 24: idempotency keys ════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.idempotency_keys (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  scope           text NOT NULL CHECK (length(btrim(scope)) > 0),
  idem_key        text NOT NULL CHECK (length(idem_key) BETWEEN 8 AND 128),
  request_hash    text NOT NULL,
  status          text NOT NULL DEFAULT 'in_progress' CHECK (status IN ('in_progress', 'completed')),
  response_status integer,
  response_body   jsonb,
  actor_id        text,
  created_at      timestamptz NOT NULL DEFAULT clock_timestamp(),
  completed_at    timestamptz,
  expires_at      timestamptz NOT NULL DEFAULT clock_timestamp() + interval '24 hours',
  CONSTRAINT uq_idempotency_keys UNIQUE (tenant_id, scope, idem_key),
  CHECK (status <> 'completed' OR (response_status IS NOT NULL AND completed_at IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS idx_idempotency_keys_expiry ON public.idempotency_keys (expires_at);

CREATE OR REPLACE FUNCTION public.idempotency_keys_guard() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    -- a claim whose request failed or was abandoned is released; an answer already given is kept until it expires
    IF OLD.status = 'in_progress'
       OR OLD.expires_at < clock_timestamp()
       OR NOT EXISTS (SELECT 1 FROM public.tenants WHERE id = OLD.tenant_id) THEN
      RETURN OLD;
    END IF;
    RAISE EXCEPTION 'a completed idempotency key is kept until it expires';
  END IF;
  -- UPDATE: a claim becomes completed, once, and nothing about the request changes
  IF OLD.status <> 'in_progress' OR NEW.status <> 'completed'
     OR NEW.request_hash IS DISTINCT FROM OLD.request_hash OR NEW.scope IS DISTINCT FROM OLD.scope OR NEW.idem_key IS DISTINCT FROM OLD.idem_key
     OR NEW.tenant_id IS DISTINCT FROM OLD.tenant_id THEN
    RAISE EXCEPTION 'an idempotency key can only be completed once';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_idempotency_keys_guard ON public.idempotency_keys;
CREATE TRIGGER trg_idempotency_keys_guard BEFORE UPDATE OR DELETE ON public.idempotency_keys FOR EACH ROW EXECUTE FUNCTION public.idempotency_keys_guard();

CREATE OR REPLACE FUNCTION public.purge_expired_idempotency_keys() RETURNS integer AS $$
DECLARE
  n integer;
BEGIN
  DELETE FROM public.idempotency_keys WHERE expires_at < clock_timestamp() OR (status = 'in_progress' AND created_at < clock_timestamp() - interval '2 minutes');
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END;
$$ LANGUAGE plpgsql;

-- ═══ TASK 24: stable references to outside systems ════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.external_refs (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  entity_type   text NOT NULL CHECK (length(btrim(entity_type)) > 0),
  entity_id     uuid NOT NULL,
  system        text NOT NULL CHECK (length(btrim(system)) > 0),
  external_id   text NOT NULL CHECK (length(btrim(external_id)) > 0),
  created_by    text NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT clock_timestamp(),
  unlinked_at   timestamptz,
  unlinked_by   text,
  unlink_reason text,
  CHECK ((unlinked_at IS NULL) = (unlinked_by IS NULL)),
  CHECK (unlinked_at IS NULL OR (unlink_reason IS NOT NULL AND length(btrim(unlink_reason)) > 4))
);
-- one live link per outside ID, and one per record, in each system
CREATE UNIQUE INDEX IF NOT EXISTS uq_external_refs_external ON public.external_refs (tenant_id, system, entity_type, external_id) WHERE unlinked_at IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_external_refs_entity   ON public.external_refs (tenant_id, system, entity_type, entity_id)   WHERE unlinked_at IS NULL;

CREATE OR REPLACE FUNCTION public.external_refs_guard() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF EXISTS (SELECT 1 FROM public.tenants WHERE id = OLD.tenant_id) THEN
      RAISE EXCEPTION 'external_refs rows cannot be deleted; unlink them with a reason';
    END IF;
    RETURN OLD;
  END IF;
  IF OLD.unlinked_at IS NOT NULL OR NEW.unlinked_at IS NULL
     OR NEW.entity_id IS DISTINCT FROM OLD.entity_id OR NEW.entity_type IS DISTINCT FROM OLD.entity_type OR NEW.system IS DISTINCT FROM OLD.system
     OR NEW.external_id IS DISTINCT FROM OLD.external_id OR NEW.tenant_id IS DISTINCT FROM OLD.tenant_id OR NEW.created_by IS DISTINCT FROM OLD.created_by THEN
    RAISE EXCEPTION 'a link to an outside system can only be unlinked, once, with a reason';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_external_refs_guard ON public.external_refs;
CREATE TRIGGER trg_external_refs_guard BEFORE UPDATE OR DELETE ON public.external_refs FOR EACH ROW EXECUTE FUNCTION public.external_refs_guard();

-- ═══ access ═══════════════════════════════════════════════════════════════════════════════════

ALTER TABLE public.tombstone_intents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.record_tombstones ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.idempotency_keys  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.external_refs     ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "service_all_tombstone_intents" ON public.tombstone_intents;
CREATE POLICY "service_all_tombstone_intents" ON public.tombstone_intents FOR ALL TO service_role USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "service_all_record_tombstones" ON public.record_tombstones;
CREATE POLICY "service_all_record_tombstones" ON public.record_tombstones FOR ALL TO service_role USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "service_all_idempotency_keys" ON public.idempotency_keys;
CREATE POLICY "service_all_idempotency_keys" ON public.idempotency_keys FOR ALL TO service_role USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "service_all_external_refs" ON public.external_refs;
CREATE POLICY "service_all_external_refs" ON public.external_refs FOR ALL TO service_role USING (true) WITH CHECK (true);

-- The helper functions are for the server only: they must not be callable by a signed-in user through the API.
REVOKE ALL ON FUNCTION public.audit_verify_chain(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.tombstone_dependents(regclass, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.restore_tombstone_group(uuid, text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.purge_expired_idempotency_keys() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.audit_verify_chain(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.tombstone_dependents(regclass, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.restore_tombstone_group(uuid, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.purge_expired_idempotency_keys() TO service_role;

NOTIFY pgrst, 'reload schema';
