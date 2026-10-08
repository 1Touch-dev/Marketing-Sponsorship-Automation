import assert from "node:assert/strict";
import test from "node:test";
import { freshDb, refusal } from "./harness";

const MIG = ["0069_identity_tombstones_idempotency.sql", "0071_tombstones_full_undo.sql"];
const T1 = "00000000-0000-0000-0000-000000000001";
const val = async (db: any, sql: string, params: unknown[] = []) => (await db.query(sql, params)).rows[0];

// The shape that matters from the real schema: a company with cascading children (core and not), with records that
// are only unlinked when it goes (SET NULL), and children that wait on each other.
const seed = `
  CREATE TABLE public.emails (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL DEFAULT '${T1}', subject text,
    company_id uuid REFERENCES public.companies(id) ON DELETE SET NULL);
  CREATE TABLE public.company_research (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL DEFAULT '${T1}', notes text,
    company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE);
  CREATE TABLE public.obligation_dependencies (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL DEFAULT '${T1}',
    obligation_id uuid NOT NULL REFERENCES public.obligations(id) ON DELETE CASCADE, predecessor_id uuid NOT NULL REFERENCES public.obligations(id) ON DELETE CASCADE);
  CREATE TABLE public.obligation_events (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL DEFAULT '${T1}', event text,
    obligation_id uuid NOT NULL REFERENCES public.obligations(id) ON DELETE CASCADE);
  CREATE TABLE public.no_tenant_child (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE);
`;

async function world() {
  const db = await freshDb(MIG, { seed });
  const c = (await val(db, "INSERT INTO public.companies (tenant_id, company_name) VALUES ($1, 'Acme') RETURNING id", [T1])).id;
  const k = (await val(db, "INSERT INTO public.contracts (tenant_id, title, status, company_id) VALUES ($2, 'Season 2027', 'active', $1) RETURNING id", [c, T1])).id;
  const k2 = (await val(db, "INSERT INTO public.contracts (tenant_id, title, status, company_id) VALUES ($2, 'Season 2028', 'active', $1) RETURNING id", [c, T1])).id;
  const e = (await val(db, "INSERT INTO public.emails (subject, company_id) VALUES ('Hello', $1) RETURNING id", [c])).id;
  const r = (await val(db, "INSERT INTO public.company_research (notes, company_id) VALUES ('Sells shoes', $1) RETURNING id", [c])).id;
  const o1 = (await val(db, "INSERT INTO public.obligations (tenant_id, company_id, title) VALUES ($1, $2, 'Install LED') RETURNING id", [T1, c])).id;
  const o2 = (await val(db, "INSERT INTO public.obligations (tenant_id, company_id, title) VALUES ($1, $2, 'Print banner') RETURNING id", [T1, c])).id;
  const dep = (await val(db, "INSERT INTO public.obligation_dependencies (obligation_id, predecessor_id) VALUES ($1, $2) RETURNING id", [o2, o1])).id;
  const ev = (await val(db, "INSERT INTO public.obligation_events (event, obligation_id) VALUES ('created', $1) RETURNING id", [o1])).id;
  return { db, c, k, k2, e, r, o1, o2, dep, ev };
}
const declare = (db: any, c: string, reason = "Duplicate of the real sponsor account") =>
  db.query("INSERT INTO public.tombstone_intents (tenant_id, record_type, record_id, actor_kind, actor_id, reason) VALUES ($1, 'companies', $2, 'human', 'ana@club.com', $3)", [T1, c, reason]);

test("every table a delete cascades into keeps a tombstone, not just the core ones", async () => {
  const { db, c } = await world();
  await db.query("DELETE FROM public.companies WHERE id = $1", [c]);
  const types = ((await db.query("SELECT record_type FROM public.record_tombstones ORDER BY seq")).rows as any[]).map((r) => r.record_type);
  assert.equal(types[0], "companies", "the record someone deleted comes first");
  for (const t of ["company_research", "obligations", "obligation_dependencies", "obligation_events"]) assert.ok(types.includes(t), t);
  assert.ok(!types.includes("no_tenant_child"), "a table with no tenant cannot carry a tombstone and is left alone");
  assert.equal(new Set(((await db.query("SELECT group_id FROM public.record_tombstones")).rows as any[]).map((r) => r.group_id)).size, 1);
});

test("rows removed along with a declared delete are credited to the person who declared it, with their reason", async () => {
  const { db, c } = await world();
  await declare(db, c);
  await db.query("DELETE FROM public.companies WHERE id = $1", [c]);
  const rows = (await db.query("SELECT record_type, deleted_by, deleted_by_kind, attributed, reason FROM public.record_tombstones")).rows as any[];
  assert.ok(rows.length >= 6);
  assert.ok(rows.every((r) => r.deleted_by === "ana@club.com" && r.attributed && r.reason === "Duplicate of the real sponsor account" && r.deleted_by_kind === "human"), JSON.stringify(rows.filter((r) => !r.attributed)));
});

test("a delete nobody declared stays unattributed all the way down", async () => {
  const { db, c } = await world();
  await db.query("DELETE FROM public.companies WHERE id = $1", [c]);
  const rows = (await db.query("SELECT attributed, deleted_by FROM public.record_tombstones")).rows as any[];
  assert.ok(rows.every((r) => !r.attributed && r.deleted_by === "unattributed (direct database delete)"));
});

test("the records a delete only unlinks are written down, and the preview counts them", async () => {
  const { db, c, k, k2, e } = await world();
  const preview = (await val(db, "SELECT public.tombstone_detached('public.companies'::regclass, $1) AS d", [c])).d as Record<string, string[]>;
  assert.deepEqual(Object.keys(preview).sort(), ["contracts.company_id", "emails.company_id"]);
  assert.deepEqual([...preview["contracts.company_id"]].sort(), [k, k2].sort());
  await db.query("DELETE FROM public.companies WHERE id = $1", [c]);
  assert.equal((await val(db, "SELECT count(*)::int n FROM public.contracts WHERE company_id IS NULL")).n, 2, "the delete did detach them");
  const t = (await val(db, "SELECT detached FROM public.record_tombstones WHERE record_type = 'companies'")).detached as Record<string, string[]>;
  assert.deepEqual(t["emails.company_id"], [e]);
});

test("undoing a deletion brings back every row and links the unlinked records to the company again", async () => {
  const { db, c, k, k2, e, r, o1, o2, dep, ev } = await world();
  await declare(db, c);
  await db.query("DELETE FROM public.companies WHERE id = $1", [c]);
  const tomb = (await val(db, "SELECT id FROM public.record_tombstones WHERE record_type = 'companies'")).id;
  const res = (await val(db, "SELECT public.restore_tombstone_group($1, 'bia@club.com', 'deleted by mistake') AS r", [tomb])).r as any;
  assert.deepEqual(res.relinked, { "contracts.company_id": 2, "emails.company_id": 1 });
  assert.ok(res.restored.length >= 6);
  assert.equal((await val(db, "SELECT company_name FROM public.companies WHERE id = $1", [c])).company_name, "Acme");
  for (const [table, id] of [["company_research", r], ["obligations", o1], ["obligations", o2], ["obligation_dependencies", dep], ["obligation_events", ev]]) {
    assert.equal((await val(db, `SELECT count(*)::int n FROM public.${table} WHERE id = $1`, [id])).n, 1, table);
  }
  const linked = (await db.query("SELECT id, company_id FROM public.contracts ORDER BY title")).rows as any[];
  assert.deepEqual(linked.map((x) => [x.id, x.company_id]), [[k, c], [k2, c]]);
  assert.equal((await val(db, "SELECT company_id FROM public.emails WHERE id = $1", [e])).company_id, c);
  assert.equal((await val(db, "SELECT count(*)::int n FROM public.record_tombstones WHERE restored_at IS NULL")).n, 0);
});

test("an undo does not overwrite a link someone set on purpose since the delete", async () => {
  const { db, c, k, k2 } = await world();
  await db.query("DELETE FROM public.companies WHERE id = $1", [c]);
  const other = (await val(db, "INSERT INTO public.companies (tenant_id, company_name) VALUES ($1, 'Other') RETURNING id", [T1])).id;
  await db.query("UPDATE public.contracts SET company_id = $1 WHERE id = $2", [other, k]);
  const tomb = (await val(db, "SELECT id FROM public.record_tombstones WHERE record_type = 'companies'")).id;
  const res = (await val(db, "SELECT public.restore_tombstone_group($1, 'bia@club.com') AS r", [tomb])).r as any;
  assert.equal(res.relinked["contracts.company_id"], 1);
  assert.equal((await val(db, "SELECT company_id FROM public.contracts WHERE id = $1", [k])).company_id, other);
  assert.equal((await val(db, "SELECT company_id FROM public.contracts WHERE id = $1", [k2])).company_id, c);
});

test("rows that wait on each other come back in an order that works, even when the delete removed them the other way round", async () => {
  // c belongs to two parents that go in different cascade branches: the first branch removes c before the second removes its other parent
  const db = await freshDb(MIG, {
    seed: `
      CREATE TABLE public.branch_a (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL DEFAULT '${T1}', company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE);
      CREATE TABLE public.branch_b (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL DEFAULT '${T1}', company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE);
      CREATE TABLE public.joined (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL DEFAULT '${T1}',
        a_id uuid NOT NULL REFERENCES public.branch_a(id) ON DELETE CASCADE, b_id uuid NOT NULL REFERENCES public.branch_b(id) ON DELETE CASCADE);
    `,
  });
  const c = (await val(db, "INSERT INTO public.companies (tenant_id, company_name) VALUES ($1, 'Acme') RETURNING id", [T1])).id;
  const a = (await val(db, "INSERT INTO public.branch_a (company_id) VALUES ($1) RETURNING id", [c])).id;
  const b = (await val(db, "INSERT INTO public.branch_b (company_id) VALUES ($1) RETURNING id", [c])).id;
  const j = (await val(db, "INSERT INTO public.joined (a_id, b_id) VALUES ($1, $2) RETURNING id", [a, b])).id;
  await db.query("DELETE FROM public.companies WHERE id = $1", [c]);
  // Postgres usually removes parents before children, so make the bad order by hand (test setup only): the child first.
  await db.exec("ALTER TABLE public.record_tombstones DISABLE TRIGGER USER; ALTER TABLE public.record_tombstones ALTER COLUMN seq DROP IDENTITY;");
  await db.exec("UPDATE public.record_tombstones SET seq = -1 WHERE record_type = 'joined'; ALTER TABLE public.record_tombstones ENABLE TRIGGER USER;");
  const order = ((await db.query("SELECT record_type FROM public.record_tombstones ORDER BY seq")).rows as any[]).map((x) => x.record_type);
  assert.equal(order[0], "joined", "setup: the child will be tried before the parents it needs");
  const tomb = (await val(db, "SELECT id FROM public.record_tombstones WHERE record_type = 'companies'")).id;
  await db.query("SELECT public.restore_tombstone_group($1, 'bia@club.com')", [tomb]);
  assert.equal((await val(db, "SELECT count(*)::int n FROM public.joined WHERE id = $1", [j])).n, 1);
  assert.equal((await val(db, "SELECT count(*)::int n FROM public.branch_b WHERE id = $1", [b])).n, 1);
});

test("an undo that cannot put everything back refuses as a whole and marks nothing", async () => {
  const { db, c, o1 } = await world();
  await db.query("DELETE FROM public.companies WHERE id = $1", [c]);
  // a row the group needs is gone for good: take the company's snapshot out of the way by recreating its ID with a clash
  await db.query("INSERT INTO public.companies (id, tenant_id, company_name) VALUES ($1, $2, 'Recreated')", [c, T1]);
  const tomb = (await val(db, "SELECT id FROM public.record_tombstones WHERE record_type = 'companies'")).id;
  assert.match(await refusal(db, "SELECT public.restore_tombstone_group($1, 'bia@club.com')", [tomb]), /duplicate key|cannot be undone/);
  assert.equal((await val(db, "SELECT count(*)::int n FROM public.record_tombstones WHERE restored_at IS NOT NULL")).n, 0);
  assert.equal((await val(db, "SELECT count(*)::int n FROM public.obligations WHERE id = $1", [o1])).n, 0, "nothing came back half-way");
});

test("a delete that would unlink more than 5000 records is refused rather than made impossible to undo", async () => {
  const { db, c } = await world();
  await db.query("INSERT INTO public.emails (subject, company_id) SELECT 'bulk', $1 FROM generate_series(1, 5001)", [c]);
  assert.match(await refusal(db, "DELETE FROM public.companies WHERE id = $1", [c]), /more than 5000 records in emails/);
  assert.equal((await val(db, "SELECT count(*)::int n FROM public.companies WHERE id = $1", [c])).n, 1, "the company is still there");
});

test("the tombstone's list of unlinked records cannot be edited", async () => {
  const { db, c } = await world();
  await db.query("DELETE FROM public.companies WHERE id = $1", [c]);
  assert.match(await refusal(db, "UPDATE public.record_tombstones SET detached = '{}', restored_at = now(), restored_by = 'x' WHERE record_type = 'companies'"), /history cannot be changed/);
});

test("the new function is for the server only", async () => {
  const db = await freshDb(MIG, { seed });
  const rows = (await db.query("SELECT has_function_privilege('authenticated', 'public.tombstone_detached(regclass, uuid)', 'execute') AS a, has_function_privilege('service_role', 'public.tombstone_detached(regclass, uuid)', 'execute') AS s")).rows as any[];
  assert.deepEqual([rows[0].a, rows[0].s], [false, true]);
});
