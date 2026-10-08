import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { freshDb, ALL_MIGRATIONS } from "./harness";
import { pgClient } from "../helpers/pg-from";
import { MemoryTaskTool } from "../../lib/tasks/adapters/memory";
import { noExternalTasks } from "../../lib/tasks/adapters/none";
import { applyInboxItem, dismissInboxItem, listInbox, pullChanges, pushObligations } from "../../lib/tasks/sync";
import type { TaskSourceAdapter } from "../../lib/tasks/adapter";
import { adapterContractCases, type ContractHarness } from "../helpers/adapter-contract";

const T = "00000000-0000-0000-0000-000000000001";
const CO = "a0000000-0000-4000-8000-00000000000a";
const MIG = ALL_MIGRATIONS;
const seed = `
  ALTER TABLE public.contracts ADD COLUMN contract_number text, ADD COLUMN proposal_id uuid;
  ALTER TABLE public.obligations ADD COLUMN contract_id uuid, ADD COLUMN project_id uuid, ADD COLUMN allocation_id uuid, ADD COLUMN source_key text, ADD COLUMN kind text, ADD COLUMN description text,
    ADD COLUMN quantity int, ADD COLUMN unit text, ADD COLUMN due_date date, ADD COLUMN due_basis text, ADD COLUMN owner_email text, ADD COLUMN owner_basis text, ADD COLUMN created_by text,
    ADD COLUMN created_at timestamptz DEFAULT now(), ADD COLUMN updated_at timestamptz DEFAULT now();
  CREATE TABLE public.obligation_events (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL, obligation_id uuid NOT NULL, event_type text NOT NULL, evidence_kind text, evidence_ref text, note text, reason text, actor_email text NOT NULL, created_at timestamptz DEFAULT clock_timestamp());
  INSERT INTO public.companies (id, tenant_id, company_name) VALUES ('${CO}', '${T}', 'Sponsor SA');
`;

async function world() {
  const db = await freshDb(MIG, { seed });
  const sb = pgClient(db);
  const k = async (n: string, status: string) => (await db.query("INSERT INTO public.contracts (tenant_id, company_id, title, status, contract_number) VALUES ($1, $2, $3, $4, $5) RETURNING id", [T, CO, `Contract ${n}`, status, n])).rows[0] as any;
  const kA = await k("C-1", "active"), kDraft = await k("C-0", "draft");
  const o = async (contract: string, key: string, title: string, kind = "deliverable") =>
    (await db.query("INSERT INTO public.obligations (tenant_id, company_id, contract_id, source_key, kind, title, due_date, due_basis, owner_email, owner_basis, created_by) VALUES ($1, $2, $3, $4, $5, $6, '2026-12-01', 'contract start', 'owner@club.com', 'assigned', 'staff@club.com') RETURNING id", [T, CO, contract, key, kind, title])).rows[0] as any;
  const obs = { led: await o(kA.id, "led", "Install LED"), banner: await o(kA.id, "banner", "Print banner"), kickoff: await o(kA.id, "kick", "Internal kickoff", "onboarding"), draftItem: await o(kDraft.id, "d", "Draft contract item") };
  return { db, sb, obs, kA };
}
const eventsOf = async (db: any, id: string) => ((await db.query("SELECT event_type, actor_email FROM public.obligation_events WHERE obligation_id = $1 ORDER BY created_at", [id])).rows as any[]).map((e) => `${e.event_type}:${e.actor_email}`);

// ── the contract ────────────────────────────────────────────────────────────

const memoryHarness = (): ContractHarness => { const tool = new MemoryTaskTool(); return { adapter: tool, person: { complete: async (id) => tool.tick(id), moveDate: async (id, d) => tool.moveDate(id, d) } }; };
for (const c of adapterContractCases(memoryHarness)) test(`the reference adapter keeps the contract: ${c.name}`, c.run);

test("the contract tests really catch an adapter that is not safe to repeat", async () => {
  class Careless extends MemoryTaskTool { async createTask(t: any, _key: string) { return super.createTask(t, `fresh-${Math.random()}`); } }
  const bad = () => { const tool = new Careless(); return { adapter: tool, person: { complete: async (id: string) => tool.tick(id), moveDate: async (id: string, d: string) => tool.moveDate(id, d) } } as ContractHarness; };
  const idem = adapterContractCases(bad).find((c) => /same key returns the same task/.test(c.name))!;
  await assert.rejects(idem.run, /same key must never make a second task/);
});

// ── pushing ─────────────────────────────────────────────────────────────────

test("pushing sends only what was sold and signed, links each task, and running it again changes nothing", async () => {
  const { sb, db, obs } = await world();
  const tool = new MemoryTaskTool("plane");
  const first = await pushObligations(sb, tool, T, "ana@club.com");
  assert.ok(first.ok && first.value.created === 2 && first.value.failed.length === 0, JSON.stringify(first));
  assert.deepEqual([...tool.tasks.values()].map((t) => t.payload.title).sort(), ["Install LED", "Print banner"], "no onboarding step, no item from a draft contract");
  assert.equal(((await db.query("SELECT count(*)::int n FROM public.external_refs WHERE system = 'plane' AND entity_type = 'obligation'")).rows[0] as any).n, 2);
  const again = await pushObligations(sb, tool, T, "ana@club.com");
  assert.ok(again.ok && again.value.created === 0 && again.value.updated === 0 && again.value.unchanged === 2);
  assert.equal(tool.calls.create, 2, "no task was created twice");
  void obs;
});

test("a change on the platform is sent once; the tool never receives something it already has", async () => {
  const { sb, db, obs } = await world();
  const tool = new MemoryTaskTool();
  await pushObligations(sb, tool, T, "ana@club.com");
  await db.query("UPDATE public.obligations SET owner_email = 'new.owner@club.com' WHERE id = $1", [obs.led.id]);
  const r = await pushObligations(sb, tool, T, "ana@club.com");
  assert.ok(r.ok && r.value.updated === 1 && r.value.unchanged === 1);
  assert.equal([...tool.tasks.values()].find((t) => t.payload.obligationId === obs.led.id)!.payload.ownerEmail, "new.owner@club.com");
  assert.equal(tool.calls.update, 1);
});

test("delivery on the platform marks the task done in the tool, and the platform decides it, not the tool", async () => {
  const { sb, db, obs } = await world();
  const tool = new MemoryTaskTool();
  await pushObligations(sb, tool, T, "ana@club.com");
  await db.query("INSERT INTO public.obligation_events (tenant_id, obligation_id, event_type, actor_email) VALUES ($1, $2, 'delivered', 'staff@club.com')", [T, obs.led.id]);
  const r = await pushObligations(sb, tool, T, "ana@club.com");
  assert.ok(r.ok && r.value.updated === 1);
  assert.equal([...tool.tasks.values()].find((t) => t.payload.obligationId === obs.led.id)!.payload.status, "done");
});

test("a create that timed out after the tool made the task does not make a second one when repeated", async () => {
  const { sb, db } = await world();
  const tool = new MemoryTaskTool();
  tool.failAfterCreate = 1;
  const first = await pushObligations(sb, tool, T, "ana@club.com");
  assert.ok(first.ok && first.value.failed.length === 1 && first.value.created === 1, JSON.stringify(first));
  assert.equal(tool.tasks.size, 2, "the timed-out create did reach the tool: that task exists, the platform just could not tell");
  const again = await pushObligations(sb, tool, T, "ana@club.com");
  assert.ok(again.ok && again.value.failed.length === 0 && again.value.created === 1);
  assert.equal(tool.tasks.size, 2, "still exactly one task per obligation");
  assert.equal(((await db.query("SELECT count(*)::int n FROM public.external_refs")).rows[0] as any).n, 2);
});

test("one failing task does not stop the others, and the failure names the obligation", async () => {
  const { sb, obs } = await world();
  const tool = new MemoryTaskTool();
  const real = tool.createTask.bind(tool);
  tool.createTask = async (t, k) => { if (t.obligationId === obs.led.id) throw new Error("tool is down for this one"); return real(t, k); };
  const r = await pushObligations(sb, tool, T, "ana@club.com");
  assert.ok(r.ok && r.value.created === 1 && r.value.failed.length === 1 && r.value.failed[0].obligationId === obs.led.id && /tool is down/.test(r.value.failed[0].error));
});

test("with no outside tool connected nothing is pushed and nothing comes back", async () => {
  const { sb } = await world();
  const pulled = await pullChanges(sb, noExternalTasks, T);
  assert.ok(pulled.ok && pulled.value.received === 0);
  const pushed = await pushObligations(sb, noExternalTasks, T, "ana@club.com");
  assert.ok(pushed.ok && pushed.value.failed.length === 2 && pushed.value.created === 0, "the adapter refuses, and each refusal is reported rather than hidden");
});

// ── pulling ─────────────────────────────────────────────────────────────────

test("what a person does in the tool arrives as items to read, tied to the obligation, and changes nothing", async () => {
  const { sb, db, obs } = await world();
  const tool = new MemoryTaskTool("plane");
  await pushObligations(sb, tool, T, "ana@club.com");
  const ledTask = [...tool.tasks.values()].find((t) => t.payload.obligationId === obs.led.id)!.externalId;
  tool.tick(ledTask, "paula@tool.example");
  tool.moveDate(ledTask, "2027-02-01", "paula@tool.example");
  tool.rename(ledTask, "Install LED (renamed)", "paula@tool.example");
  tool.reassign(ledTask, "someone.else@tool.example", "paula@tool.example");
  const r = await pullChanges(sb, tool, T);
  assert.ok(r.ok && r.value.stored === 4 && r.value.duplicates === 0 && r.value.unmapped === 0);
  const inbox = await listInbox(sb, T, { status: "pending" });
  assert.ok(inbox.ok && inbox.value.length === 4 && inbox.value.every((i) => i.obligation_id === obs.led.id && i.status === "pending"));
  // nothing about the obligation moved
  const ob = (await db.query("SELECT title, due_date::text d, owner_email FROM public.obligations WHERE id = $1", [obs.led.id])).rows[0] as any;
  assert.deepEqual([ob.title, ob.d, ob.owner_email], ["Install LED", "2026-12-01", "owner@club.com"]);
  assert.deepEqual(await eventsOf(db, obs.led.id), [], "no delivery was recorded either");
  const byKind = Object.fromEntries((inbox.ok ? inbox.value : []).map((i) => [i.kind, i]));
  assert.match(byKind.date_changed.refused[0].reason, /the platform owns every field of obligations/);
  assert.equal(byKind.renamed.refused[0].field, "title");
  assert.equal(byKind.reassigned.refused[0].field, "owner_email");
  assert.deepEqual(byKind.completed.refused, [], "a completion asks to change no field");
});

test("an event that arrives twice, or is read again after a crash, is stored once", async () => {
  const { sb, obs } = await world();
  const tool = new MemoryTaskTool();
  await pushObligations(sb, tool, T, "ana@club.com");
  tool.tick([...tool.tasks.values()].find((t) => t.payload.obligationId === obs.led.id)!.externalId);
  tool.duplicateEvents = true;
  const first = await pullChanges(sb, tool, T);
  assert.ok(first.ok && first.value.received === 2 && first.value.stored === 1 && first.value.duplicates === 1);
  // the cursor was lost (a crash before it was saved): everything is read again, nothing is added
  await (sb as any).from("task_sync_cursors").delete().eq("tenant_id", T);
  const replay = await pullChanges(sb, tool, T);
  assert.ok(replay.ok && replay.value.stored === 0 && replay.value.duplicates === 2);
  const inbox = await listInbox(sb, T);
  assert.ok(inbox.ok && inbox.value.length === 1);
});

test("a task the platform never made creates nothing: it is kept as unmapped", async () => {
  const { sb, db } = await world();
  const tool = new MemoryTaskTool();
  tool.strangerEvent();
  const r = await pullChanges(sb, tool, T);
  assert.ok(r.ok && r.value.stored === 1 && r.value.unmapped === 1);
  assert.equal(((await db.query("SELECT count(*)::int n FROM public.obligations")).rows[0] as any).n, 4, "no obligation was created");
  const inbox = await listInbox(sb, T);
  assert.ok(inbox.ok && inbox.value[0].obligation_id === null);
});

test("the cursor is saved, so the next pull only reads what is new", async () => {
  const { sb, obs } = await world();
  const tool = new MemoryTaskTool();
  await pushObligations(sb, tool, T, "ana@club.com");
  const id = [...tool.tasks.values()].find((t) => t.payload.obligationId === obs.led.id)!.externalId;
  tool.tick(id);
  await pullChanges(sb, tool, T);
  tool.reopen(id);
  const second = await pullChanges(sb, tool, T);
  assert.ok(second.ok && second.value.received === 1 && second.value.stored === 1);
});

// ── the person decides ──────────────────────────────────────────────────────

test("a completion reported by the tool becomes a delivered mark by the person who confirms it, and someone else still has to accept it", async () => {
  const { sb, db, obs } = await world();
  const tool = new MemoryTaskTool("plane");
  await pushObligations(sb, tool, T, "ana@club.com");
  tool.tick([...tool.tasks.values()].find((t) => t.payload.obligationId === obs.led.id)!.externalId, "paula@tool.example");
  await pullChanges(sb, tool, T);
  const item = ((await listInbox(sb, T, { status: "pending" })) as any).value[0];
  const applied = await applyInboxItem(sb, T, item.id, "ana@club.com");
  assert.ok(applied.ok && applied.value.status === "delivered", JSON.stringify(applied));
  assert.deepEqual(await eventsOf(db, obs.led.id), ["delivered:ana@club.com"], "recorded under the person's name, not the tool's");
  const note = ((await db.query("SELECT note FROM public.obligation_events WHERE obligation_id = $1", [obs.led.id])).rows[0] as any).note as string;
  assert.match(note, /Reported done in plane by paula@tool.example; confirmed by ana@club.com/);
  const twice = await applyInboxItem(sb, T, item.id, "ana@club.com");
  assert.ok(!twice.ok && twice.status === 409);
  assert.equal(((await db.query("SELECT status FROM public.task_sync_inbox WHERE id = $1", [item.id])).rows[0] as any).status, "applied");
});

test("only a completion can be applied; a changed date or name is made on the platform's own screens, and anything can be set aside with a reason", async () => {
  const { sb, obs } = await world();
  const tool = new MemoryTaskTool();
  await pushObligations(sb, tool, T, "ana@club.com");
  const id = [...tool.tasks.values()].find((t) => t.payload.obligationId === obs.led.id)!.externalId;
  tool.moveDate(id, "2027-02-01");
  await pullChanges(sb, tool, T);
  const item = ((await listInbox(sb, T)) as any).value[0];
  const apply = await applyInboxItem(sb, T, item.id, "ana@club.com");
  assert.ok(!apply.ok && apply.status === 400 && /not applied automatically/.test(apply.error));
  assert.equal(((await dismissInboxItem(sb, T, item.id, "ana@club.com", "no")) as any).status, 400);
  assert.equal(((await dismissInboxItem(sb, T, item.id, "", "Date was a typo in the tool")) as any).status, 403);
  const ok = await dismissInboxItem(sb, T, item.id, "ana@club.com", "Date was a typo in the tool");
  assert.ok(ok.ok);
  assert.equal(((await dismissInboxItem(sb, T, item.id, "ana@club.com", "again please")) as any).status, 409);
});

test("an inbox item records what the tool said and cannot be rewritten afterwards", async () => {
  const { sb, db, obs } = await world();
  const tool = new MemoryTaskTool();
  await pushObligations(sb, tool, T, "ana@club.com");
  tool.tick([...tool.tasks.values()].find((t) => t.payload.obligationId === obs.led.id)!.externalId);
  await pullChanges(sb, tool, T);
  await assert.rejects(() => db.query("UPDATE public.task_sync_inbox SET kind = 'deleted'"), /can only be applied or dismissed/);
  await assert.rejects(() => db.query("UPDATE public.task_sync_inbox SET detail = '{}'::jsonb"), /can only be applied or dismissed/);
  await assert.rejects(() => db.query("DELETE FROM public.task_sync_inbox"), /cannot be deleted/);
});

// ── no second task store ────────────────────────────────────────────────────

const root = path.resolve(__dirname, "../..");
const walk = (dir: string, out: string[] = []): string[] => { for (const f of fs.readdirSync(dir, { withFileTypes: true })) { const p = path.join(dir, f.name); if (f.isDirectory()) { if (f.name !== "node_modules" && f.name !== ".next") walk(p, out); } else out.push(p); } return out; };

test("GUARD: no table that looks like a task, to-do, ticket or work-item store exists apart from obligations", () => {
  const migrations = fs.readdirSync(path.join(root, "../supabase/migrations")).filter((f) => f.endsWith(".sql"));
  const looksLikeTaskStore = /(^|_)(tasks?|todos?|tickets?|work_?items?|checklists?|issues?)(_|$)/;
  const found: string[] = [];
  for (const f of migrations) {
    const sql = fs.readFileSync(path.join(root, "../supabase/migrations", f), "utf8");
    for (const m of sql.matchAll(/CREATE TABLE (?:IF NOT EXISTS )?(?:public\.)?([a-z_0-9]+)/gi)) if (looksLikeTaskStore.test(m[1])) found.push(`${m[1]} (${f})`);
  }
  // task_sync_* are bookkeeping (pushes, cursors, an inbox a person reads), allowed by name; anything else needs a deliberate decision here
  const unexplained = found.filter((x) => !/^task_sync_(pushes|cursors|inbox) /.test(x));
  assert.deepEqual(unexplained, [], "a new task-like table is a second task store: obligations stay canonical (X-13). If this one is something else, say so here.");
});

test("GUARD: an adapter cannot write an obligation: adapters import nothing that does", () => {
  const files = walk(path.join(root, "lib/tasks/adapters")).filter((f) => f.endsWith(".ts"));
  assert.ok(files.length >= 2);
  const forbidden = /from ["'](\.\.\/)+(obligations|projects|schedule|contracts|allocations)\/|supabase\/server|supabaseAdmin/;
  const bad = files.filter((f) => forbidden.test(fs.readFileSync(f, "utf8"))).map((f) => path.relative(root, f));
  assert.deepEqual(bad, [], "adapters talk to the outside tool only; the platform side is lib/tasks/sync.ts");
});

test("GUARD: the only place the sync changes an obligation is applying a completion that a person confirmed", () => {
  const src = fs.readFileSync(path.join(root, "lib/tasks/sync.ts"), "utf8");
  const uses = [...src.matchAll(/recordEvent\(/g)].length;
  assert.equal(uses, 1, "recordEvent (the obligation writer) is called exactly once");
  const idx = src.indexOf("recordEvent(");
  assert.ok(src.lastIndexOf("export async function", idx) === src.indexOf("export async function applyInboxItem"), "and that call is inside applyInboxItem");
  assert.ok(!/from\("obligations"\)\s*\.(update|insert|delete|upsert)/.test(src) && !/from\("obligation_events"\)\s*\.(update|insert|delete|upsert)/.test(src), "no direct write to obligations or their events");
  assert.ok(!/pullChanges[\s\S]{0,2000}recordEvent/.test(src.slice(src.indexOf("export async function pullChanges"), src.indexOf("// ── the inbox"))), "pulling never records delivery");
});

test("the adapter contract names the interface any real tool implements", () => {
  const a: TaskSourceAdapter = new MemoryTaskTool();
  assert.deepEqual(Object.getOwnPropertyNames(Object.getPrototypeOf(a)).filter((k) => ["createTask", "updateTask", "pullChanges"].includes(k)).sort(), ["createTask", "pullChanges", "updateTask"]);
});
