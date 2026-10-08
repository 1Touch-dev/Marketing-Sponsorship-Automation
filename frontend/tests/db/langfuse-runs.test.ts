import assert from "node:assert/strict";
import test from "node:test";
import { Annotation, END, START, StateGraph, interrupt } from "@langchain/langgraph";
import { freshDb, ALL_MIGRATIONS } from "./harness";
import { pgClient } from "../helpers/pg-from";
import { SupabaseCheckpointSaver } from "../../lib/agents/langgraph/postgres-saver";
import { resumeRun, startRun } from "../../lib/agents/langgraph/runtime";
import { setLangfuseForTests, traceGeneration, type LangfuseLike } from "../../lib/observability/langfuse";

process.env.INTERNAL_API_SECRET ||= "test-secret";
const T = "00000000-0000-0000-0000-000000000001";
const S = Annotation.Root({ log: Annotation<string[]>({ reducer: (a, b) => a.concat(b), default: () => [] }) });

test("a real graph run is traced end to end: one trace for the run, a span per step, model calls attached, the wait recorded, and a crashed run continues the same trace", async () => {
  const calls: Array<{ op: string; body: Record<string, any> }> = [];
  const client: LangfuseLike = {
    trace: (b) => { calls.push({ op: "trace", body: b }); const id = String(b.id); return { span: (x) => calls.push({ op: `span@${id}`, body: x }), generation: (x) => calls.push({ op: `generation@${id}`, body: x }), event: (x) => calls.push({ op: `event@${id}`, body: x }), update: (x) => calls.push({ op: `update@${id}`, body: x }) }; },
    score: (b) => calls.push({ op: "score", body: b }), flushAsync: async () => undefined,
  };
  setLangfuseForTests(client);
  const db = await freshDb(ALL_MIGRATIONS); const sb = pgClient(db);
  let crash = true;
  const build = () => new StateGraph(S)
    .addNode("research", async () => { traceGeneration({ name: "research.call", model: "claude", input: "contact bea@sponsor.com", output: "found", usage: { promptTokens: 10, completionTokens: 5 } }); return { log: ["research"] }; })
    .addNode("ask", async () => { interrupt({ reason: "approve" }); return { log: ["asked"] }; })
    .addNode("send", async () => { if (crash) { crash = false; throw new Error("provider hung up"); } return { log: ["send"] }; })
    .addEdge(START, "research").addEdge("research", "ask").addEdge("ask", "send").addEdge("send", END)
    .compile({ checkpointer: new SupabaseCheckpointSaver(sb, T) }) as any;
  const subject = "run-1"; const id = SupabaseCheckpointSaver.threadId(T, "demo", subject);
  await startRun(sb, build(), { tenantId: T, graph: "demo", subjectId: subject, initial: {} });
  const failed = await resumeRun(sb, build(), { tenantId: T, threadId: id, answer: true });
  assert.ok(failed.ok && failed.result.status === "failed");
  const done = await resumeRun(sb, build(), { tenantId: T, threadId: id });
  assert.ok(done.ok && done.result.status === "completed");

  const traces = calls.filter((c) => c.op === "trace");
  assert.equal(traces.length, 3, "one trace record per drive");
  assert.ok(traces.every((c) => c.body.id === id && c.body.name === "demo" && c.body.sessionId === T), "all carry the same trace id: the run is one trace");
  const spans = calls.filter((c) => c.op.startsWith("span@")).map((c) => c.body.name);
  assert.ok(spans.includes("research") && spans.includes("send") && spans.includes("failed"));
  const gen = calls.find((c) => c.op.startsWith("generation@"))!;
  assert.equal(gen.op, `generation@${id}`, "the model call inside the step attached to the run");
  assert.ok(!JSON.stringify(gen.body).includes("bea@sponsor.com"), "and its text was redacted");
  assert.ok(calls.some((c) => c.op.startsWith("event@") && c.body.name === "waiting for a person"));
  const ends = calls.filter((c) => c.op.startsWith("update@")).map((c) => c.body.metadata.status);
  assert.deepEqual(ends, ["waiting", "failed", "completed"]);
  setLangfuseForTests(undefined);
});
