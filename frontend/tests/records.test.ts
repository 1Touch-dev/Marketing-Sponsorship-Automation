import assert from "node:assert/strict";
import test from "node:test";
import { declareDeletes, deleteRecord, getTombstone, isTombstoned, listTombstones, liveCommitments, previewDeletion, readDeleteOptions, restoreTombstone, TOMBSTONED_TABLES } from "../lib/records/tombstones";
import { userActor } from "../lib/identity/actor";
import { db, type Tables } from "./helpers/fake-db";

const T = "t";
const actor = userActor({ id: "u-1", email: "ana@club.com", full_name: "Ana", role: "admin" });

const world = (over: Tables = {}): Tables => ({
  companies: [{ id: "co1", tenant_id: T }, { id: "co2", tenant_id: T }], contacts: [{ id: "ct1", tenant_id: T, company_id: "co2" }],
  contracts: [{ id: "k1", tenant_id: T, company_id: "co1", status: "active", proposal_id: "p1" }], obligations: [{ id: "o1", tenant_id: T, company_id: "co1", contract_id: "k1" }],
  value_lines: [], sponsor_recaps: [], proposals: [{ id: "p1", tenant_id: T }, { id: "p2", tenant_id: T }], tombstone_intents: [], record_tombstones: [], ...over,
});

test("every table the database keeps tombstones for is named here", () => {
  for (const t of ["companies", "contacts", "proposals", "contracts", "obligations", "value_lines"]) assert.ok((TOMBSTONED_TABLES as readonly string[]).includes(t), t);
});

test("what depends on a company is named, so a delete is a decision and not a tidy-up", async () => {
  const sb = db(world());
  const blockers = await liveCommitments(sb, T, "companies", "co1");
  assert.match(blockers.join("; "), /1 contract is in force/);
  assert.match(blockers.join("; "), /1 delivery obligation/);
  assert.deepEqual(await liveCommitments(sb, T, "companies", "co2"), [], "a company nothing depends on");
  assert.deepEqual(await liveCommitments(sb, T, "contacts", "ct1"), []);
  assert.match((await liveCommitments(sb, T, "proposals", "p1")).join(), /1 contract was made from it/);
  assert.deepEqual(await liveCommitments(sb, T, "proposals", "p2"), []);
});

test("a preview refuses an unknown type and a record that is not there", async () => {
  const sb = db(world());
  assert.equal(((await previewDeletion(sb, T, "audit_logs", "x")) as any).status, 400);
  assert.equal(((await previewDeletion(sb, T, "companies", "nope")) as any).status, 404);
  const ok = await previewDeletion(sb, T, "companies", "co2");
  assert.ok(ok.ok && ok.value.blockers.length === 0);
});

test("deleting a record nothing depends on says who and why first, then deletes", async () => {
  const tables = world();
  const sb = db(tables);
  const r = await deleteRecord(sb, { table: "companies", id: "co2", tenantId: T, actor, reason: "Duplicate of Acme" });
  assert.ok(r.ok && r.attributed);
  assert.deepEqual(tables.companies.map((c) => c.id), ["co1"], "it is gone");
  assert.deepEqual(tables.tombstone_intents.map((i) => [i.record_type, i.record_id, i.actor_kind, i.actor_id, i.reason]), [["companies", "co2", "human", "ana@club.com", "Duplicate of Acme"]]);
  const at = (op: string, table: string) => sb.calls.findIndex((c) => c.op === op && c.table === table);
  assert.ok(at("insert", "tombstone_intents") >= 0 && at("insert", "tombstone_intents") < at("delete", "companies"), "the intent is written before the delete");
});

test("a record other work depends on needs a confirmation and a reason of substance", async () => {
  const tables = world();
  const sb = db(tables);
  const refused = await deleteRecord(sb, { table: "companies", id: "co1", tenantId: T, actor });
  assert.ok(!refused.ok && refused.status === 409 && /confirm=true/.test(refused.error) && refused.blockers!.length === 2);
  assert.equal(tables.companies.length, 2, "nothing was deleted");
  const short = await deleteRecord(sb, { table: "companies", id: "co1", tenantId: T, actor, confirm: true, reason: "oops" });
  assert.ok(!short.ok && short.status === 400 && /10\+ characters/.test(short.error));
  assert.equal(tables.companies.length, 2);
  const done = await deleteRecord(sb, { table: "companies", id: "co1", tenantId: T, actor, confirm: true, reason: "Sponsor left; contract terminated by mutual agreement" });
  assert.ok(done.ok);
  assert.equal(tables.companies.length, 1);
});

test("deleting a record that is not there, or belongs to another tenant, is refused", async () => {
  const sb = db(world());
  assert.equal(((await deleteRecord(sb, { table: "companies", id: "ghost", tenantId: T, actor })) as any).status, 404);
  assert.equal(((await deleteRecord(db(world({ companies: [{ id: "co9", tenant_id: "other" }] })), { table: "companies", id: "co9", tenantId: T, actor })) as any).status, 404);
});

test("the reason and confirmation can come from the query or the body", async () => {
  assert.deepEqual(await readDeleteOptions(new Request("http://x/y?reason=Duplicate&confirm=true", { method: "DELETE" })), { reason: "Duplicate", confirm: true });
  assert.deepEqual(await readDeleteOptions(new Request("http://x/y", { method: "DELETE", body: JSON.stringify({ reason: "From body", confirm: true }), headers: { "content-type": "application/json" } })), { reason: "From body", confirm: true });
  assert.deepEqual(await readDeleteOptions(new Request("http://x/y", { method: "DELETE" })), { reason: null, confirm: false });
});

test("a script that deletes in bulk can still say who it is and why", async () => {
  const tables = world();
  await declareDeletes(db(tables), "companies", [{ id: "co1", tenant_id: T }, { id: "co2", tenant_id: T }], { kind: "service", id: "service:internal-cleanup", label: "x" }, "Internal cleanup");
  assert.equal(tables.tombstone_intents.length, 2);
  assert.ok(tables.tombstone_intents.every((i) => i.actor_kind === "service" && i.reason === "Internal cleanup"));
  await declareDeletes(db(tables), "companies", [], actor, "none");
  assert.equal(tables.tombstone_intents.length, 2);
});

test("tombstones are listed newest first, hide the undone ones by default, and show the record as it was", async () => {
  const row = (id: string, seq: number, restored: string | null = null) => ({ id, seq, tenant_id: T, record_type: "companies", record_id: `r${seq}`, group_id: "g1", snapshot: { company_name: "Acme" }, restored_at: restored });
  const tables = world({ record_tombstones: [row("a", 1), row("b", 2, "2026-10-01")] });
  const open = await listTombstones(db(tables), T);
  assert.ok(open.ok && open.value.map((t) => t.id).join() === "a");
  assert.equal(((await listTombstones(db(tables), T, { includeRestored: true })) as any).value.length, 2);
  const one = await getTombstone(db(tables), T, "a");
  assert.ok(one.ok && one.value.snapshot.company_name === "Acme" && one.value.same_deletion.length === 2);
  assert.equal(((await getTombstone(db(tables), T, "zzz")) as any).status, 404);
  assert.equal(await isTombstoned(db(tables), T, "companies", "r1"), true);
  assert.equal(await isTombstoned(db(tables), T, "companies", "r2"), false, "an undone deletion is not a deletion");
  assert.equal(await isTombstoned(db(tables), T, "companies", "nobody"), false);
});

test("before the migration, tombstones say so instead of failing", async () => {
  const sb = db(world(), { missing: ["record_tombstones"] });
  const l = await listTombstones(sb, T);
  assert.ok(!l.ok && l.status === 503 && /migration 0069/.test(l.error));
  assert.equal(await isTombstoned(sb, T, "companies", "x"), false);
});

test("restoring needs the tombstone to be in this tenant, and explains a clash", async () => {
  const calls: any[] = [];
  const sbFor = (rpcResult: { data?: unknown; error?: { message: string } | null }, rows: Tables) => ({ ...db(rows), rpc: async (name: string, args: unknown) => { calls.push([name, args]); return { data: rpcResult.data ?? null, error: rpcResult.error ?? null }; } });
  const rows = world({ record_tombstones: [{ id: "a", tenant_id: T }] });
  assert.equal(((await restoreTombstone(sbFor({}, rows), T, "missing", "ana@club.com")) as any).status, 404);
  const ok = await restoreTombstone(sbFor({ data: [{ record_type: "companies", record_id: "co1" }] }, rows), T, "a", "ana@club.com", " by mistake ");
  assert.ok(ok.ok && ok.value.restored.length === 1);
  assert.deepEqual(calls[0], ["restore_tombstone_group", { p_tombstone: "a", p_actor: "ana@club.com", p_note: "by mistake" }]);
  const full = await restoreTombstone(sbFor({ data: { restored: [{ record_type: "companies", record_id: "co1" }], relinked: { "contracts.company_id": 2 } } }, rows), T, "a", "ana@club.com");
  assert.ok(full.ok && full.value.restored.length === 1 && full.value.relinked["contracts.company_id"] === 2);
  assert.deepEqual(ok.ok && ok.value.relinked, {}, "the older answer has nothing re-linked");
  const needs = await restoreTombstone(sbFor({ error: { message: "this deletion cannot be undone as it was, because a record it needs is gone: x" } }, rows), T, "a", "ana@club.com");
  assert.ok(!needs.ok && needs.status === 409);
  const clash = await restoreTombstone(sbFor({ error: { message: 'duplicate key value violates unique constraint "companies_pkey"' } }, rows), T, "a", "ana@club.com");
  assert.ok(!clash.ok && clash.status === 409 && /same ID exists again/.test(clash.error));
  const again = await restoreTombstone(sbFor({ error: { message: "this deletion was already undone" } }, rows), T, "a", "ana@club.com");
  assert.ok(!again.ok && again.status === 409);
});
