import assert from "node:assert/strict";
import test from "node:test";
import { Annotation, END, START, StateGraph, interrupt } from "@langchain/langgraph";
import { freshDb, refusal, ALL_MIGRATIONS } from "./harness";
import { pgClient } from "../helpers/pg-from";
import { SupabaseCheckpointSaver } from "../../lib/agents/langgraph/postgres-saver";
import { cancelRun, drive, inspectRun, listThreads, openThread, resumeRun, startRun, sweepStuckRuns, configFor } from "../../lib/agents/langgraph/runtime";

const T = "00000000-0000-0000-0000-000000000001";
const T2 = "00000000-0000-0000-0000-000000000002";
const MIG = ALL_MIGRATIONS;

const State = Annotation.Root({
  log: Annotation<string[]>({ reducer: (a, b) => a.concat(b), default: () => [] }),
  answer: Annotation<unknown>({ reducer: (_a, b) => b, default: () => null }),
});

/** A three-step graph with a question in the middle, and a counter per step so a repeated step is visible. */
function build(sb: any, tenant: string, opts: { calls: Record<string, number>; failAt?: { step: string; times: number } }) {
  const { calls } = opts;
  const bump = (k: string) => { calls[k] = (calls[k] ?? 0) + 1; };
  const step = (name: string) => async () => {
    bump(name);
    if (opts.failAt?.step === name && (opts.failAt.times ?? 0) > 0) { opts.failAt.times--; throw new Error(`${name} died`); }
    return { log: [name] };
  };
  const g = new StateGraph(State)
    .addNode("one", step("one"))
    .addNode("ask", async () => { bump("ask"); const a = interrupt({ reason: "approve", question: "ok?" }); return { answer: a, log: ["asked"] }; })
    .addNode("two", step("two"))
    .addNode("three", step("three"))
    .addEdge(START, "one").addEdge("one", "ask").addEdge("ask", "two").addEdge("two", "three").addEdge("three", END);
  return g.compile({ checkpointer: new SupabaseCheckpointSaver(sb, tenant) }) as any;
}
const run = (sb: any, graph: any, subject: string, tenant = T) => startRun(sb, graph, { tenantId: tenant, graph: "demo", subjectType: "demo", subjectId: subject, startedBy: "ana@club.com", initial: {} });
const threadId = (subject: string, tenant = T) => SupabaseCheckpointSaver.threadId(tenant, "demo", subject);
const row = async (db: any, subject: string, tenant = T) => (await db.query("SELECT * FROM public.langgraph_threads WHERE thread_id = $1", [threadId(subject, tenant)])).rows[0] as any;

test("a run saves its state after every step, in our own tables, and waits for a person when it asks", async () => {
  const db = await freshDb(MIG); const sb = pgClient(db); const calls = {};
  const out = await run(sb, build(sb, T, { calls }), "r1");
  assert.ok(out.ok && out.result.status === "interrupted");
  if (out.ok && out.result.status === "interrupted") assert.deepEqual(out.result.waitingFor, { reason: "approve", question: "ok?" });
  const t = await row(db, "r1");
  assert.deepEqual([t.status, t.attempts, t.graph, t.started_by], ["interrupted", 1, "demo", "ana@club.com"]);
  assert.deepEqual(t.waiting_for, { reason: "approve", question: "ok?" });
  const n = (await db.query("SELECT count(*)::int n FROM public.langgraph_checkpoints WHERE thread_id = $1", [threadId("r1")])).rows[0] as any;
  assert.ok(n.n >= 2, "state was saved as the run went");
  assert.deepEqual(calls, { one: 1, ask: 1 });
});

test("answering the question carries on from where it stopped, without redoing finished steps", async () => {
  const db = await freshDb(MIG); const sb = pgClient(db); const calls: Record<string, number> = {};
  await run(sb, build(sb, T, { calls }), "r2");
  const resumed = await resumeRun(sb, build(sb, T, { calls }), { tenantId: T, threadId: threadId("r2"), answer: { approved: true } });
  assert.ok(resumed.ok && resumed.result.status === "completed");
  if (resumed.ok && resumed.result.status === "completed") {
    assert.deepEqual(resumed.result.values.log, ["one", "asked", "two", "three"]);
    assert.deepEqual(resumed.result.values.answer, { approved: true });
  }
  assert.equal(calls.one, 1, "the first step ran once");
  assert.equal((await row(db, "r2")).status, "completed");
  assert.ok((await row(db, "r2")).finished_at);
});

test("a run survives the process that started it: a new process, new graph and new connection pick it up", async () => {
  const db = await freshDb(MIG); const calls: Record<string, number> = {};
  await run(pgClient(db), build(pgClient(db), T, { calls }), "r3");
  // everything in memory is gone; only the database remains
  const sbNew = pgClient(db);
  const insp = await inspectRun(sbNew, build(sbNew, T, { calls }), T, threadId("r3"));
  assert.ok(insp.ok && insp.value.next[0] === "ask" && (insp.value.values.log as string[]).join() === "one");
  const done = await resumeRun(sbNew, build(sbNew, T, { calls }), { tenantId: T, threadId: threadId("r3"), answer: true });
  assert.ok(done.ok && done.result.status === "completed");
});

test("a step that dies leaves the run failed with the reason, and carrying on redoes only that step", async () => {
  const db = await freshDb(MIG); const sb = pgClient(db); const calls: Record<string, number> = {};
  const opts = { calls, failAt: { step: "two", times: 1 } };
  await run(sb, build(sb, T, opts), "r4");
  const failed = await resumeRun(sb, build(sb, T, opts), { tenantId: T, threadId: threadId("r4"), answer: true });
  assert.ok(failed.ok && failed.result.status === "failed" && /two died/.test(failed.result.error));
  const t = await row(db, "r4");
  assert.deepEqual([t.status, t.last_error, t.attempts], ["failed", "two died", 1]);
  assert.ok(t.finished_at);
  const again = await resumeRun(sb, build(sb, T, opts), { tenantId: T, threadId: threadId("r4") });
  assert.ok(again.ok && again.result.status === "completed" && again.result.values.log.join() === "one,asked,two,three");
  assert.deepEqual(calls, { one: 1, ask: 2, two: 2, three: 1 }, "'one' was not repeated; 'ask' is re-entered only to read its saved answer");
  const t2 = await row(db, "r4");
  assert.deepEqual([t2.status, t2.attempts, t2.last_error], ["completed", 2, null]);
});

test("two requests cannot resume the same run: one goes ahead, the other is told", async () => {
  const db = await freshDb(MIG); const sb = pgClient(db); const calls: Record<string, number> = {};
  await run(sb, build(sb, T, { calls }), "r5");
  const [a, b] = await Promise.all([
    resumeRun(sb, build(sb, T, { calls }), { tenantId: T, threadId: threadId("r5"), answer: true }),
    resumeRun(sb, build(sb, T, { calls }), { tenantId: T, threadId: threadId("r5"), answer: true }),
  ]);
  const oks = [a, b].filter((r) => r.ok);
  assert.equal(oks.length, 1);
  const refused = [a, b].find((r) => !r.ok)!;
  assert.ok(!refused.ok && refused.status === 409);
  assert.equal(calls.two, 1, "the steps after the question ran once");
});

test("starting the same subject twice is the same run", async () => {
  const db = await freshDb(MIG); const sb = pgClient(db); const calls: Record<string, number> = {};
  const g = () => build(sb, T, { calls });
  await run(sb, g(), "r6");
  const second = await run(sb, g(), "r6");
  assert.ok(!second.ok && second.status === 409 && /waiting for a person/.test(second.error));
  await resumeRun(sb, g(), { tenantId: T, threadId: threadId("r6"), answer: true });
  const third = await run(sb, g(), "r6");
  assert.ok(third.ok && third.result.status === "completed" && third.result.values.log.join() === "one,asked,two,three", "a finished run answers with its result");
  assert.equal(calls.one, 1);
  assert.equal(((await db.query("SELECT count(*)::int n FROM public.langgraph_threads")).rows[0] as any).n, 1);
});

test("a cancelled run cannot be resumed, restarted or written to, and its record stays", async () => {
  const db = await freshDb(MIG); const sb = pgClient(db); const calls: Record<string, number> = {};
  await run(sb, build(sb, T, { calls }), "r7");
  assert.equal(((await cancelRun(sb, { tenantId: T, threadId: threadId("r7"), by: "ana@club.com", reason: "" })) as any).status, 400);
  assert.equal(((await cancelRun(sb, { tenantId: T, threadId: threadId("r7"), by: "", reason: "Sponsor withdrew" })) as any).status, 403);
  const c = await cancelRun(sb, { tenantId: T, threadId: threadId("r7"), by: "ana@club.com", reason: "Sponsor withdrew" });
  assert.ok(c.ok && c.value.status === "cancelled" && c.value.cancelled_by === "ana@club.com");
  const res = await resumeRun(sb, build(sb, T, { calls }), { tenantId: T, threadId: threadId("r7"), answer: true });
  assert.ok(!res.ok && res.status === 409 && /cancelled/.test(res.error));
  const again = await run(sb, build(sb, T, { calls }), "r7");
  assert.ok(!again.ok && /cancelled/.test(again.error));
  assert.equal(((await cancelRun(sb, { tenantId: T, threadId: threadId("r7"), by: "ana@club.com", reason: "twice over" })) as any).status, 409);
  assert.equal(calls.two, undefined, "nothing ran after the cancellation");
  assert.ok(((await db.query("SELECT count(*)::int n FROM public.langgraph_checkpoints WHERE thread_id = $1", [threadId("r7")])).rows[0] as any).n >= 2, "what it did stays on record");
  assert.match(await refusal(db, "UPDATE public.langgraph_threads SET status = 'running' WHERE thread_id = $1", [threadId("r7")]), /cancelled run cannot be resumed/);
  assert.match(await refusal(db, "INSERT INTO public.langgraph_checkpoints (thread_id, checkpoint_id, tenant_id, checkpoint_type, checkpoint, metadata_type, metadata) VALUES ($1, 'zzz', $2, 'json', 'e30=', 'json', 'e30=')", [threadId("r7"), T]), /cancelled and cannot be written to/);
});

test("a run whose process died is found and marked failed, then carried on; a slow one is left alone", async () => {
  const db = await freshDb(MIG); const sb = pgClient(db); const calls: Record<string, number> = {};
  await run(sb, build(sb, T, { calls }), "slow");
  await resumeRun(sb, build(sb, T, { calls }), { tenantId: T, threadId: threadId("slow"), answer: true }); // completes
  await openThread(sb, { tenantId: T, graph: "demo", subjectId: "dead" });
  await openThread(sb, { tenantId: T, graph: "demo", subjectId: "alive" });
  // the trigger stamps updated_at itself, so backdate with it switched off (test setup only)
  await db.exec("ALTER TABLE public.langgraph_threads DISABLE TRIGGER USER");
  await db.query("UPDATE public.langgraph_threads SET updated_at = now() - interval '30 minutes' WHERE thread_id = $1", [threadId("dead")]);
  await db.exec("ALTER TABLE public.langgraph_threads ENABLE TRIGGER USER");
  const swept = await sweepStuckRuns(sb, T, 10);
  assert.ok(swept.ok && swept.value.marked_failed.length === 1 && swept.value.marked_failed[0] === threadId("dead"));
  assert.equal((await row(db, "alive")).status, "running");
  assert.match((await row(db, "dead")).last_error, /process stopped/);
});

test("a run belongs to one club: another club's checkpointer cannot read, write or list it", async () => {
  const db = await freshDb(MIG, { seed: `INSERT INTO public.tenants (id, name) VALUES ('${T2}', 'Second');` }); const sb = pgClient(db); const calls: Record<string, number> = {};
  await run(sb, build(sb, T, { calls }), "mine");
  const theirs = new SupabaseCheckpointSaver(sb, T2);
  const cfg = { configurable: { thread_id: threadId("mine", T) } };
  await assert.rejects(() => theirs.getTuple(cfg), /belongs to another club/);
  await assert.rejects(() => theirs.put(cfg, { v: 4, id: "x", ts: "", channel_values: {}, channel_versions: {}, versions_seen: {} } as any, {} as any), /belongs to another club/);
  await assert.rejects(() => theirs.deleteThread(threadId("mine", T)), /belongs to another club/);
  const listed: unknown[] = [];
  for await (const t of theirs.list({ configurable: {} })) listed.push(t);
  assert.equal(listed.length, 0, "listing sees only its own club's runs");
  const resumed = await resumeRun(sb, build(sb, T2, { calls }), { tenantId: T2, threadId: threadId("mine", T), answer: true });
  assert.ok(!resumed.ok && resumed.status === 404);
  // and the database itself refuses a row whose thread does not start with its tenant
  assert.match(await refusal(db, "INSERT INTO public.langgraph_checkpoints (thread_id, checkpoint_id, tenant_id, checkpoint_type, checkpoint, metadata_type, metadata) VALUES ($1, 'q', $2, 'json', 'e30=', 'json', 'e30=')", [threadId("mine", T), T2]), /thread_tenant_chk/);
  assert.equal(((await listThreads(sb, T2)) as any).value.length, 0);
  assert.equal(((await listThreads(sb, T)) as any).value.length, 1);
  void configFor; void drive;
});

test("saved state can be read back as the framework expects: latest, by id, with parents, newest first", async () => {
  const db = await freshDb(MIG); const sb = pgClient(db); const calls: Record<string, number> = {};
  const graph = build(sb, T, { calls });
  await run(sb, graph, "hist");
  await resumeRun(sb, build(sb, T, { calls }), { tenantId: T, threadId: threadId("hist"), answer: true });
  const saver = new SupabaseCheckpointSaver(sb, T);
  const latest = await saver.getTuple({ configurable: { thread_id: threadId("hist") } });
  assert.ok(latest && latest.parentConfig && (latest.checkpoint.channel_values as any).log.join() === "one,asked,two,three");
  const ids: string[] = [];
  for await (const t of saver.list({ configurable: { thread_id: threadId("hist") } })) ids.push(t.config.configurable!.checkpoint_id as string);
  assert.ok(ids.length >= 4 && [...ids].sort().reverse().join() === ids.join(), "newest first");
  const limited: unknown[] = [];
  for await (const t of saver.list({ configurable: { thread_id: threadId("hist") } }, { limit: 2 })) limited.push(t);
  assert.equal(limited.length, 2);
  const byId = await saver.getTuple({ configurable: { thread_id: threadId("hist"), checkpoint_id: ids[ids.length - 1] } });
  assert.ok(byId && !byId.parentConfig, "the first saved state has no parent");
  assert.equal(await saver.getTuple({ configurable: { thread_id: threadId("nope") } }), undefined);
});
