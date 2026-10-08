import assert from "node:assert/strict";
import test from "node:test";
import { freshDb, refusal } from "./harness";

const MIG = ["0069_identity_tombstones_idempotency.sql"];
const T1 = "00000000-0000-0000-0000-000000000001";
const T2 = "00000000-0000-0000-0000-000000000002";
const val = async (db: any, sql: string, params: unknown[] = []) => (await db.query(sql, params)).rows[0];

const seedLegacy = `
  INSERT INTO public.tenants (id, name) VALUES ('${T2}', 'Second');
  INSERT INTO public.audit_logs (entity_type, action, actor_email, created_at, tenant_id) VALUES
    ('company', 'company.created', NULL, '2026-05-01T10:00:00Z', '${T1}'),
    ('proposal', 'proposal.approve', 'ana@club.com', '2026-05-02T10:00:00Z', '${T1}'),
    ('company', 'company.updated', NULL, '2026-05-03T10:00:00Z', '${T2}');
`;

const entry = (over: Record<string, unknown> = {}) => ({ tenant: T1, kind: "human", id: "ana@club.com", ...over });
const addAudit = (db: any, o = entry()) => db.query(
  `INSERT INTO public.audit_logs (tenant_id, entity_type, action, actor_kind, actor_id, actor_label, actor_email, metadata) VALUES ($1, 'company', 'company.created', $2, $3, $3, $3, '{"n":1}')`, [o.tenant, o.kind, o.id]);

const sensitiveSeed = `
  INSERT INTO public.tenants (id, name) VALUES ('${T2}', 'Second');
  INSERT INTO public.proposals (id, tenant_id, title) VALUES ('00000000-0000-0000-0000-0000000000a1', '${T1}', 'P');
  INSERT INTO public.audit_logs (entity_type, entity_id, action, metadata, tenant_id) VALUES
    ('proposal', '00000000-0000-0000-0000-0000000000a1', 'proposal.interest_submitted', '{"contact_name":"Bea","contact_email":"bea@sponsor.com","contact_phone":"+55 41 9","company":"Sponsor SA","message":"Hello","lgpd_consent":true}', '${T1}'),
    ('proposal', '00000000-0000-0000-0000-0000000000a1', 'proposal.view', '{"token":"super-secret-share-token","variant":"a"}', '${T1}'),
    ('portal_access', NULL, 'portal.magic_link_requested', '{"email":"x@y.com","magic_link":"https://app/portal?token=abc"}', '${T1}'),
    ('email', NULL, 'email.opened', '{"ip":"203.0.113.9","user_agent":"UA"}', '${T1}');
`;

// ── the audit log ───────────────────────────────────────────────────────────

test("entries from before the migration are kept, marked legacy, numbered and chained per tenant", async () => {
  const db = await freshDb(MIG, { seed: seedLegacy });
  const rows = (await db.query("SELECT actor_kind, actor_id, seq, prev_hash, row_hash, tenant_id FROM public.audit_logs ORDER BY seq")).rows as any[];
  assert.equal(rows.length, 3);
  assert.ok(rows.every((r) => r.actor_kind === "legacy" && r.row_hash && r.seq));
  assert.deepEqual(rows.map((r) => r.actor_id).sort(), ["ana@club.com", "unknown", "unknown"]);
  const t1 = rows.filter((r) => r.tenant_id === T1);
  assert.equal(t1[0].prev_hash, null, "the first entry of a tenant starts the chain");
  assert.equal(t1[1].prev_hash, t1[0].row_hash);
  for (const t of [T1, T2]) {
    const v = await val(db, "SELECT ok, checked::int c FROM public.audit_verify_chain($1)", [t]);
    assert.deepEqual([v.ok, v.c], [true, t === T1 ? 2 : 1], "each tenant's chain verifies on its own");
  }
  assert.equal((await val(db, "SELECT ok FROM public.audit_verify_chain($1)", [T1])).ok, true);
});

test("before the log is sealed, lead details move to an erasable table and credentials and raw identifiers are scrubbed", async () => {
  const db = await freshDb(MIG, { seed: sensitiveSeed });
  const interest = (await db.query("SELECT contact_name, contact_email, company, message, lgpd_consent FROM public.proposal_interests")).rows as any[];
  assert.deepEqual(interest, [{ contact_name: "Bea", contact_email: "bea@sponsor.com", company: "Sponsor SA", message: "Hello", lgpd_consent: true }]);
  const rows = (await db.query("SELECT action, metadata::text m FROM public.audit_logs")).rows as any[];
  const by = (a: string) => rows.find((r) => r.action === a).m as string;
  assert.ok(!by("proposal.interest_submitted").includes("bea@sponsor.com") && by("proposal.interest_submitted").includes("interest_id"));
  assert.ok(!by("proposal.view").includes("super-secret-share-token") && by("proposal.view").includes("token_fingerprint"));
  assert.ok(!by("portal.magic_link_requested").includes("token=abc") && by("portal.magic_link_requested").includes("x@y.com"));
  assert.ok(!by("email.opened").includes("203.0.113.9") && by("email.opened").includes("ip_fingerprint"));
  assert.equal((await val(db, "SELECT ok FROM public.audit_verify_chain($1)", [T1])).ok, true, "the cleaned entries are sealed and verify");
  const erased = await db.query("DELETE FROM public.proposal_interests");
  assert.equal(erased.affectedRows, 1, "the lead's details can be erased without touching the log");
  assert.equal((await val(db, "SELECT ok FROM public.audit_verify_chain($1)", [T1])).ok, true);
});

test("running the migration twice changes nothing", async () => {
  const db = await freshDb(MIG, { seed: seedLegacy });
  const before = (await db.query("SELECT id, seq, row_hash FROM public.audit_logs ORDER BY seq")).rows;
  await freshDbRerun(db);
  const after = (await db.query("SELECT id, seq, row_hash FROM public.audit_logs ORDER BY seq")).rows;
  assert.deepEqual(after, before);
});
async function freshDbRerun(db: any) {
  const fs = await import("node:fs");
  const path = await import("node:path");
  await db.exec(fs.readFileSync(path.resolve(__dirname, "../../../supabase/migrations", MIG[0]), "utf8"));
}

test("a new entry must name an actor, and 'legacy' is only for what came before", async () => {
  const db = await freshDb(MIG);
  assert.match(await refusal(db, "INSERT INTO public.audit_logs (tenant_id, entity_type, action) VALUES ($1, 'x', 'x.y')", [T1]), /null value|needs an actor/);
  assert.match(await refusal(db, "INSERT INTO public.audit_logs (tenant_id, entity_type, action, actor_kind, actor_id) VALUES ($1, 'x', 'x.y', 'legacy', 'z')", [T1]), /needs an actor/);
  assert.match(await refusal(db, "INSERT INTO public.audit_logs (tenant_id, entity_type, action, actor_kind, actor_id) VALUES ($1, 'x', 'x.y', 'robot', 'z')", [T1]), /audit_logs_actor_chk/);
  assert.match(await refusal(db, "INSERT INTO public.audit_logs (tenant_id, entity_type, action, actor_kind, actor_id) VALUES ($1, 'x', 'x.y', 'human', '  ')", [T1]), /actor id|audit_logs_actor_chk/);
  for (const kind of ["human", "approver", "agent", "service", "external"]) await addAudit(db, entry({ kind, id: `${kind}-1` }) as any);
  assert.equal((await val(db, "SELECT count(*)::int n FROM public.audit_logs")).n, 5);
});

test("entries are stamped with the real time and the next number, whatever the caller says, and chain to each other", async () => {
  const db = await freshDb(MIG);
  await db.query("INSERT INTO public.audit_logs (tenant_id, entity_type, action, actor_kind, actor_id, created_at, seq, prev_hash, row_hash) VALUES ($1, 'x', 'x.a', 'human', 'a', '2001-01-01T00:00:00Z', 999, 'forged', 'forged')", [T1]);
  await addAudit(db);
  const rows = (await db.query("SELECT created_at, seq::int s, prev_hash, row_hash FROM public.audit_logs ORDER BY seq")).rows as any[];
  assert.ok(new Date(rows[0].created_at).getFullYear() >= 2026, "a backdated entry is stamped now");
  assert.notEqual(rows[0].s, 999);
  assert.equal(rows[0].prev_hash, null);
  assert.equal(rows[1].prev_hash, rows[0].row_hash);
  assert.ok(rows[1].s > rows[0].s);
});

test("the audit log cannot be edited, deleted or truncated", async () => {
  const db = await freshDb(MIG);
  await addAudit(db);
  assert.match(await refusal(db, "UPDATE public.audit_logs SET action = 'x.changed'"), /immutable/);
  assert.match(await refusal(db, "UPDATE public.audit_logs SET actor_id = 'someone.else'"), /immutable/);
  assert.match(await refusal(db, "DELETE FROM public.audit_logs"), /cannot be deleted/);
  assert.match(await refusal(db, "TRUNCATE public.audit_logs"), /cannot be truncated/);
  assert.equal((await val(db, "SELECT count(*)::int n FROM public.audit_logs")).n, 1);
});

test("tampering is detected even by someone who bypasses the triggers: an edit, and a removed entry", async () => {
  const db = await freshDb(MIG);
  for (let i = 0; i < 4; i++) await addAudit(db, entry({ id: `p${i}` }) as any);
  assert.equal((await val(db, "SELECT ok FROM public.audit_verify_chain($1)", [T1])).ok, true);
  const rows = (await db.query("SELECT id, seq::int s FROM public.audit_logs ORDER BY seq")).rows as any[];
  await db.exec("ALTER TABLE public.audit_logs DISABLE TRIGGER USER");
  await db.query("UPDATE public.audit_logs SET action = 'company.tampered' WHERE id = $1", [rows[1].id]);
  const edited = await val(db, "SELECT ok, first_bad_seq::int s, reason FROM public.audit_verify_chain($1)", [T1]);
  assert.deepEqual([edited.ok, edited.s], [false, rows[1].s]);
  assert.match(edited.reason, /changed after it was written/);
  await db.query("UPDATE public.audit_logs SET action = 'company.created' WHERE id = $1", [rows[1].id]);
  assert.equal((await val(db, "SELECT ok FROM public.audit_verify_chain($1)", [T1])).ok, true, "put back, it verifies again");
  await db.query("DELETE FROM public.audit_logs WHERE id = $1", [rows[2].id]);
  const removed = await val(db, "SELECT ok, first_bad_seq::int s, reason FROM public.audit_verify_chain($1)", [T1]);
  assert.deepEqual([removed.ok, removed.s], [false, rows[3].s]);
  assert.match(removed.reason, /removed or changed/);
});

test("nobody with a login can write to the audit log; the old open insert policy is gone", async () => {
  const db = await freshDb(MIG);
  const policies = (await db.query("SELECT policyname FROM pg_policies WHERE tablename = 'audit_logs'")).rows.map((r: any) => r.policyname);
  assert.ok(!policies.includes("audit_logs_insert_any"));
  assert.ok(policies.includes("audit_logs_read_review"));
  await db.exec("SET ROLE authenticated");
  const msg = await refusal(db, "INSERT INTO public.audit_logs (tenant_id, entity_type, action, actor_kind, actor_id) VALUES ($1, 'x', 'forged', 'human', 'ceo@club.com')", [T1]);
  await db.exec("RESET ROLE");
  assert.match(msg, /permission denied|row-level security|policy/);
  assert.equal((await val(db, "SELECT count(*)::int n FROM public.audit_logs")).n, 0);
});

test("removing a tenant removes its audit entries with it, and only that can", async () => {
  const db = await freshDb(MIG, { seed: seedLegacy });
  await db.query("DELETE FROM public.tenants WHERE id = $1", [T2]);
  assert.equal((await val(db, "SELECT count(*)::int n FROM public.audit_logs WHERE tenant_id = $1", [T2])).n, 0);
  assert.equal((await val(db, "SELECT count(*)::int n FROM public.audit_logs WHERE tenant_id = $1", [T1])).n, 2);
});

// ── tombstones ──────────────────────────────────────────────────────────────

async function world() {
  const db = await freshDb(MIG);
  const c = (await val(db, "INSERT INTO public.companies (tenant_id, company_name) VALUES ($1, 'Acme') RETURNING id", [T1])).id;
  const p = (await val(db, "INSERT INTO public.contacts (tenant_id, company_id, full_name) VALUES ($1, $2, 'Ana') RETURNING id", [T1, c])).id;
  const o = (await val(db, "INSERT INTO public.obligations (tenant_id, company_id, title) VALUES ($1, $2, 'LED') RETURNING id", [T1, c])).id;
  return { db, c, p, o };
}

test("deleting a core record leaves a snapshot, even when nobody said they were deleting it", async () => {
  const { db, c } = await world();
  await db.query("DELETE FROM public.contacts WHERE company_id = $1", [c]);
  await db.query("DELETE FROM public.obligations WHERE company_id = $1", [c]);
  await db.query("DELETE FROM public.companies WHERE id = $1", [c]);
  const t = (await db.query("SELECT record_type, deleted_by, attributed, snapshot FROM public.record_tombstones WHERE record_type = 'companies'")).rows[0] as any;
  assert.deepEqual([t.record_type, t.attributed, t.deleted_by], ["companies", false, "unattributed (direct database delete)"]);
  assert.equal(t.snapshot.company_name, "Acme");
});

test("a delete says what else went with it", async () => {
  const { db, c } = await world();
  await db.query("DELETE FROM public.companies WHERE id = $1", [c]);
  const t = (await db.query("SELECT dependents FROM public.record_tombstones WHERE record_type = 'companies'")).rows[0] as any;
  assert.deepEqual(t.dependents, { contacts: 1, obligations: 1 });
});

test("everything one delete removes shares a group, parents first", async () => {
  const { db, c } = await world();
  await db.query("DELETE FROM public.companies WHERE id = $1", [c]);
  const rows = (await db.query("SELECT record_type, group_id FROM public.record_tombstones ORDER BY seq")).rows as any[];
  assert.equal(rows.length, 3);
  assert.equal(new Set(rows.map((r) => r.group_id)).size, 1);
  assert.equal(rows[0].record_type, "companies");
});

test("a stated intent names who deleted it and why, once, and a stale one is ignored", async () => {
  const { db, c } = await world();
  const solo = (await val(db, "INSERT INTO public.companies (tenant_id, company_name) VALUES ($1, 'Solo') RETURNING id", [T1])).id;
  const stale = (await val(db, "INSERT INTO public.companies (tenant_id, company_name) VALUES ($1, 'Stale') RETURNING id", [T1])).id;
  await db.query("INSERT INTO public.tombstone_intents (tenant_id, record_type, record_id, actor_kind, actor_id, reason) VALUES ($1, 'companies', $2, 'human', 'ana@club.com', 'Duplicate of Acme')", [T1, solo]);
  await db.query("INSERT INTO public.tombstone_intents (tenant_id, record_type, record_id, actor_kind, actor_id, reason, created_at) VALUES ($1, 'companies', $2, 'human', 'old@club.com', 'long ago', now() - interval '1 hour')", [T1, stale]);
  await db.query("DELETE FROM public.companies WHERE id = ANY($1)", [[solo, stale]]);
  const rows = (await db.query("SELECT record_id, deleted_by, deleted_by_kind, attributed, reason FROM public.record_tombstones WHERE record_type = 'companies'")).rows as any[];
  const a = rows.find((r) => r.record_id === solo), b = rows.find((r) => r.record_id === stale);
  assert.deepEqual([a.deleted_by, a.deleted_by_kind, a.attributed, a.reason], ["ana@club.com", "human", true, "Duplicate of Acme"]);
  assert.deepEqual([b.attributed, b.deleted_by], [false, "unattributed (direct database delete)"]);
  assert.equal((await val(db, "SELECT count(*)::int n FROM public.tombstone_intents WHERE consumed_at IS NOT NULL")).n, 1);
  void c;
});

test("a deletion can be undone: the whole group returns with the same IDs, once", async () => {
  const { db, c, p, o } = await world();
  await db.query("DELETE FROM public.companies WHERE id = $1", [c]);
  assert.equal((await val(db, "SELECT count(*)::int n FROM public.companies")).n, 0);
  const t = (await val(db, "SELECT id FROM public.record_tombstones WHERE record_type = 'companies'")).id;
  const res = (await val(db, "SELECT public.restore_tombstone_group($1, 'ana@club.com', 'deleted by mistake') AS r", [t])).r as any[];
  assert.equal(res.length, 3);
  assert.equal((await val(db, "SELECT company_name FROM public.companies WHERE id = $1", [c])).company_name, "Acme");
  assert.equal((await val(db, "SELECT full_name FROM public.contacts WHERE id = $1", [p])).full_name, "Ana");
  assert.equal((await val(db, "SELECT title FROM public.obligations WHERE id = $1", [o])).title, "LED");
  const marked = (await db.query("SELECT restored_by, restore_note FROM public.record_tombstones")).rows as any[];
  assert.ok(marked.every((m) => m.restored_by === "ana@club.com" && m.restore_note === "deleted by mistake"));
  assert.match(await refusal(db, "SELECT public.restore_tombstone_group($1, 'ana@club.com')", [t]), /already undone/);
});

test("an undo still works after the table gained a column, and refuses when the record is back already", async () => {
  const { db, c } = await world();
  await db.query("DELETE FROM public.companies WHERE id = $1", [c]);
  await db.exec("ALTER TABLE public.companies ADD COLUMN tier text NOT NULL DEFAULT 'standard'");
  const t = (await val(db, "SELECT id FROM public.record_tombstones WHERE record_type = 'companies'")).id;
  await db.query("SELECT public.restore_tombstone_group($1, 'ana@club.com')", [t]);
  assert.equal((await val(db, "SELECT tier FROM public.companies WHERE id = $1", [c])).tier, "standard", "the new column takes its default");
  const again = await freshDb(MIG);
  const id = (await val(again, "INSERT INTO public.companies (tenant_id, company_name) VALUES ($1, 'Dup') RETURNING id", [T1])).id;
  await again.query("DELETE FROM public.companies WHERE id = $1", [id]);
  await again.query("INSERT INTO public.companies (id, tenant_id, company_name) VALUES ($1, $2, 'Recreated')", [id, T1]);
  const tomb = (await val(again, "SELECT id FROM public.record_tombstones")).id;
  assert.match(await refusal(again, "SELECT public.restore_tombstone_group($1, 'ana@club.com')", [tomb]), /duplicate key|already exists|violates/);
  assert.equal((await val(again, "SELECT restored_at FROM public.record_tombstones")).restored_at, null, "a failed undo marks nothing");
});

test("a tombstone cannot be edited or removed; it can only be marked restored", async () => {
  const { db, c } = await world();
  await db.query("DELETE FROM public.companies WHERE id = $1", [c]);
  assert.match(await refusal(db, "UPDATE public.record_tombstones SET snapshot = '{}'::jsonb"), /can only be marked restored/);
  assert.match(await refusal(db, "UPDATE public.record_tombstones SET deleted_by = 'someone.else'"), /can only be marked restored/);
  assert.match(await refusal(db, "UPDATE public.record_tombstones SET restored_at = now()"), /restored_by|violates check/);
  assert.match(await refusal(db, "DELETE FROM public.record_tombstones"), /cannot be deleted/);
});

test("removing a whole tenant needs no tombstones and takes its bookkeeping with it", async () => {
  const db = await freshDb(MIG);
  await db.query("INSERT INTO public.tenants (id, name) VALUES ($1, 'Gone')", [T2]);
  const c = (await val(db, "INSERT INTO public.companies (tenant_id, company_name) VALUES ($1, 'X') RETURNING id", [T2])).id;
  await db.query("INSERT INTO public.idempotency_keys (tenant_id, scope, idem_key, request_hash) VALUES ($1, 'a', 'key-12345', 'h')", [T2]);
  await db.query("INSERT INTO public.external_refs (tenant_id, entity_type, entity_id, system, external_id, created_by) VALUES ($1, 'companies', $2, 'pipedrive', '42', 'x')", [T2, c]);
  await db.query("DELETE FROM public.companies WHERE tenant_id = $1", [T2]);
  assert.equal((await val(db, "SELECT count(*)::int n FROM public.record_tombstones WHERE tenant_id = $1", [T2])).n, 1);
  await db.query("DELETE FROM public.tenants WHERE id = $1", [T2]);
  for (const t of ["record_tombstones", "idempotency_keys", "external_refs"]) assert.equal((await val(db, `SELECT count(*)::int n FROM public.${t} WHERE tenant_id = $1`, [T2])).n, 0, t);
});

// ── idempotency keys ────────────────────────────────────────────────────────

test("one key per request: a repeat cannot claim it again, and the answer is stored once", async () => {
  const db = await freshDb(MIG);
  const claim = "INSERT INTO public.idempotency_keys (tenant_id, scope, idem_key, request_hash) VALUES ($1, 'companies.create:ana', 'key-abcdef12', 'hash-1')";
  await db.query(claim, [T1]);
  assert.match(await refusal(db, claim, [T1]), /uq_idempotency_keys|duplicate key/);
  await db.query("INSERT INTO public.idempotency_keys (tenant_id, scope, idem_key, request_hash) VALUES ($1, 'contacts.create:ana', 'key-abcdef12', 'hash-1')", [T1]);
  assert.match(await refusal(db, "INSERT INTO public.idempotency_keys (tenant_id, scope, idem_key, request_hash) VALUES ($1, 'x', 'short', 'h')", [T1]), /idem_key|violates check/);
  await db.query("UPDATE public.idempotency_keys SET status = 'completed', response_status = 201, response_body = '{\"id\":1}', completed_at = now() WHERE scope = 'companies.create:ana'");
  assert.match(await refusal(db, "UPDATE public.idempotency_keys SET response_status = 500 WHERE scope = 'companies.create:ana'"), /completed once/);
  assert.match(await refusal(db, "UPDATE public.idempotency_keys SET request_hash = 'other' WHERE scope = 'contacts.create:ana'"), /completed once/);
  assert.match(await refusal(db, "UPDATE public.idempotency_keys SET status = 'completed' WHERE scope = 'contacts.create:ana'"), /response_status|violates check/);
});

test("a claim can be released, but an answer already given is kept until it expires", async () => {
  const db = await freshDb(MIG);
  await db.query("INSERT INTO public.idempotency_keys (tenant_id, scope, idem_key, request_hash) VALUES ($1, 'failed', 'key-fail-001', 'h')", [T1]);
  await db.query("DELETE FROM public.idempotency_keys WHERE scope = 'failed'");
  await db.query("INSERT INTO public.idempotency_keys (tenant_id, scope, idem_key, request_hash, status, response_status, completed_at) VALUES ($1, 'done', 'key-done-001', 'h', 'completed', 201, now())", [T1]);
  assert.match(await refusal(db, "DELETE FROM public.idempotency_keys WHERE scope = 'done'"), /kept until it expires/);
  await db.query("INSERT INTO public.idempotency_keys (tenant_id, scope, idem_key, request_hash, status, response_status, completed_at, expires_at) VALUES ($1, 'old', 'key-old-0001', 'h', 'completed', 200, now(), now() - interval '1 hour')", [T1]);
  await db.query("INSERT INTO public.idempotency_keys (tenant_id, scope, idem_key, request_hash, created_at) VALUES ($1, 'abandoned', 'key-aband-01', 'h', now() - interval '10 minutes')", [T1]);
  assert.equal((await val(db, "SELECT public.purge_expired_idempotency_keys() AS n")).n, 2);
  assert.deepEqual((await db.query("SELECT scope FROM public.idempotency_keys")).rows, [{ scope: "done" }]);
});

// ── links to outside systems ────────────────────────────────────────────────

test("an outside ID maps to one record and a record to one outside ID; unlinking needs a reason and frees both", async () => {
  const { db, c } = await world();
  const other = (await val(db, "INSERT INTO public.companies (tenant_id, company_name) VALUES ($1, 'Other') RETURNING id", [T1])).id;
  const link = (entity: string, ext: string) => db.query("INSERT INTO public.external_refs (tenant_id, entity_type, entity_id, system, external_id, created_by) VALUES ($1, 'companies', $2, 'pipedrive', $3, 'sync')", [T1, entity, ext]);
  await link(c, "ORG-1");
  assert.match(await refusal(db, "INSERT INTO public.external_refs (tenant_id, entity_type, entity_id, system, external_id, created_by) VALUES ($1, 'companies', $2, 'pipedrive', 'ORG-1', 'sync')", [T1, other]), /uq_external_refs_external/);
  assert.match(await refusal(db, "INSERT INTO public.external_refs (tenant_id, entity_type, entity_id, system, external_id, created_by) VALUES ($1, 'companies', $2, 'pipedrive', 'ORG-2', 'sync')", [T1, c]), /uq_external_refs_entity/);
  await db.query("INSERT INTO public.external_refs (tenant_id, entity_type, entity_id, system, external_id, created_by) VALUES ($1, 'companies', $2, 'twenty', 'ORG-1', 'sync')", [T1, c]);
  assert.match(await refusal(db, "UPDATE public.external_refs SET unlinked_at = now(), unlinked_by = 'x' WHERE external_id = 'ORG-1' AND system = 'pipedrive'"), /unlink_reason|violates check/);
  assert.match(await refusal(db, "UPDATE public.external_refs SET external_id = 'ORG-9' WHERE system = 'pipedrive'"), /can only be unlinked/);
  assert.match(await refusal(db, "DELETE FROM public.external_refs"), /unlink them with a reason/);
  await db.query("UPDATE public.external_refs SET unlinked_at = now(), unlinked_by = 'ana@club.com', unlink_reason = 'Merged into another organization' WHERE external_id = 'ORG-1' AND system = 'pipedrive'");
  await link(other, "ORG-1");
  assert.equal((await val(db, "SELECT entity_id FROM public.external_refs WHERE system = 'pipedrive' AND unlinked_at IS NULL")).entity_id, other);
  assert.match(await refusal(db, "UPDATE public.external_refs SET unlink_reason = 'changed my mind' WHERE unlinked_at IS NOT NULL"), /can only be unlinked/);
});

test("the helper functions are for the server only", async () => {
  const db = await freshDb(MIG);
  for (const fn of ["public.audit_verify_chain(uuid)", "public.restore_tombstone_group(uuid, text, text)", "public.tombstone_dependents(regclass, uuid)", "public.purge_expired_idempotency_keys()"]) {
    assert.equal((await val(db, "SELECT has_function_privilege('authenticated', $1, 'execute') AS ok", [fn])).ok, false, `authenticated: ${fn}`);
    assert.equal((await val(db, "SELECT has_function_privilege('anon', $1, 'execute') AS ok", [fn])).ok, false, `anon: ${fn}`);
    assert.equal((await val(db, "SELECT has_function_privilege('service_role', $1, 'execute') AS ok", [fn])).ok, true, `service_role: ${fn}`);
  }
});
