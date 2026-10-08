import assert from "node:assert/strict";
import test from "node:test";
import { captureMode, forTrace, redactText } from "../lib/observability/redact";
import { flushLangfuse, scoreRun, setLangfuseForTests, startRunTrace, traceGeneration, tracingEnabled, withTrace, currentTrace, type LangfuseLike } from "../lib/observability/langfuse";

process.env.INTERNAL_API_SECRET ||= "test-secret";

interface Call { op: string; body: Record<string, unknown> }
function fake(opts: { explode?: boolean } = {}) {
  const calls: Call[] = [];
  const boom = () => { if (opts.explode) throw new Error("langfuse is down"); };
  const trace = (id: string) => ({
    span: (b: Record<string, unknown>) => { boom(); calls.push({ op: `span@${id}`, body: b }); },
    generation: (b: Record<string, unknown>) => { boom(); calls.push({ op: `generation@${id}`, body: b }); },
    event: (b: Record<string, unknown>) => { boom(); calls.push({ op: `event@${id}`, body: b }); },
    update: (b: Record<string, unknown>) => { boom(); calls.push({ op: `update@${id}`, body: b }); },
  });
  const client: LangfuseLike = {
    trace: (b) => { boom(); calls.push({ op: "trace", body: b }); return trace(String(b.id ?? "anon")); },
    score: (b) => { boom(); calls.push({ op: "score", body: b }); },
    flushAsync: async () => { boom(); calls.push({ op: "flush", body: {} }); },
  };
  return { client, calls };
}

test("with no keys configured nothing happens and nothing throws", async () => {
  setLangfuseForTests(undefined);
  delete process.env.LANGFUSE_PUBLIC_KEY; delete process.env.LANGFUSE_SECRET_KEY;
  assert.equal(tracingEnabled(), false);
  const t = startRunTrace({ id: "t1", name: "x", tenantId: "ten" });
  assert.equal(t.enabled, false);
  t.span("a"); t.event("b"); t.generation({ name: "g", model: "m", input: "i", output: "o" }); t.end({ status: "completed" });
  traceGeneration({ name: "g", model: "m", input: "i", output: "o" });
  scoreRun("t1", "x", 1);
  await flushLangfuse();
  setLangfuseForTests(undefined);
});

test("a run becomes one trace with a span per step, an event when it waits, and an end", () => {
  const f = fake(); setLangfuseForTests(f.client);
  const t = startRunTrace({ id: "tenant:outreach-agent:run1", name: "outreach-agent", tenantId: "tenant", metadata: { company: "Sponsor SA" } });
  t.span("enrich", { output: { contacts: 3 } });
  t.span("proposal", { output: { proposal_id: "p1" } });
  t.event("waiting for a person", { metadata: { reason: "proposal_review" } });
  t.end({ status: "waiting" });
  assert.deepEqual(f.calls.map((c) => c.op), ["trace", "span@tenant:outreach-agent:run1", "span@tenant:outreach-agent:run1", "event@tenant:outreach-agent:run1", "update@tenant:outreach-agent:run1"]);
  assert.equal(f.calls[0].body.id, "tenant:outreach-agent:run1");
  assert.equal(f.calls[0].body.sessionId, "tenant");
  assert.equal((f.calls[4].body.metadata as any).status, "waiting");
  setLangfuseForTests(undefined);
});

test("model calls made inside a run attach to that run's trace without being told which", () => {
  const f = fake(); setLangfuseForTests(f.client);
  const t = startRunTrace({ id: "run-7", name: "agent", tenantId: "ten" });
  assert.equal(currentTrace(), undefined);
  withTrace(t, () => {
    assert.equal(currentTrace()?.id, "run-7");
    traceGeneration({ name: "proposal", model: "claude", input: "write", output: "text", usage: { promptTokens: 100, completionTokens: 50 } });
  });
  traceGeneration({ name: "stray", model: "claude", input: "x", output: "y" });
  const gens = f.calls.filter((c) => c.op.startsWith("generation"));
  assert.equal(gens[0].op, "generation@run-7");
  assert.deepEqual((gens[0].body.usage as any).totalTokens, 150);
  assert.ok(f.calls.some((c) => c.op === "trace" && c.body.name === "stray"), "outside a run it stands alone");
  setLangfuseForTests(undefined);
});

test("scores carry what a person decided, and a flush is passed on", async () => {
  const f = fake(); setLangfuseForTests(f.client);
  scoreRun("run-9", "proposal_approved", 1, "approved by ana@club.com");
  scoreRun("", "ignored", 1);
  await flushLangfuse();
  assert.deepEqual(f.calls.map((c) => c.op), ["score", "flush"]);
  assert.equal(f.calls[0].body.traceId, "run-9");
  assert.ok(!String(f.calls[0].body.comment).includes("ana@club.com"), "the comment is redacted too");
  setLangfuseForTests(undefined);
});

test("Langfuse failing never reaches the caller", async () => {
  const f = fake({ explode: true }); setLangfuseForTests(f.client);
  const t = startRunTrace({ id: "x", name: "n", tenantId: "t" });
  assert.equal(t.enabled, false, "a trace that could not start is a do-nothing trace");
  traceGeneration({ name: "g", model: "m", input: "i", output: "o" });
  scoreRun("x", "s", 1);
  await flushLangfuse();
  setLangfuseForTests(undefined);
});

// ── what leaves the platform ────────────────────────────────────────────────

test("personal data and credentials are replaced by fingerprints before anything is sent", () => {
  const raw = "Fale com bea@sponsor.com ou +55 41 99876-5432. CNPJ 12.345.678/0001-90, CPF 123.456.789-09. Bearer abcdefghijklmnopqrstuvwxyz0123456789 e sk-ant-api03-ABCDEFGHIJKLMNOP1234.";
  const out = redactText(raw);
  for (const secret of ["bea@sponsor.com", "99876-5432", "12.345.678/0001-90", "123.456.789-09", "abcdefghijklmnopqrstuvwxyz0123456789", "sk-ant-api03-ABCDEFGHIJKLMNOP1234"]) assert.ok(!out.includes(secret), `still contains ${secret}`);
  assert.match(out, /\[email:[0-9a-f]{16}\]/);
  assert.match(out, /\[cnpj:|\[phone:/);
  assert.equal(redactText("bea@sponsor.com"), redactText("Bea@Sponsor.com"), "the same person gets the same fingerprint");
  assert.ok(redactText("x".repeat(9000)).length < 4200, "long text is cut");
  assert.equal(redactText("Propostas de patrocínio da temporada 2027"), "Propostas de patrocínio da temporada 2027", "ordinary text is left alone");
});

test("objects are walked, secrets by name are withheld, and the capture mode decides how much text goes at all", () => {
  const v = { to: "bea@sponsor.com", nested: { api_key: "abc", note: "ligue para +55 41 99876-5432" }, list: ["bea@sponsor.com"] };
  const redacted = JSON.stringify(forTrace(v, "redacted"));
  assert.ok(!redacted.includes("bea@sponsor.com") && !redacted.includes("99876") && redacted.includes("[withheld]"));
  const meta = JSON.stringify(forTrace(v, "metadata"));
  assert.ok(!meta.includes("sponsor") && /record with 3 fields/.test(meta));
  assert.equal(JSON.stringify(forTrace("hello", "metadata")), JSON.stringify("[text, 5 characters]"));
  assert.ok(JSON.stringify(forTrace(v, "full")).includes("bea@sponsor.com"), "full is full");
  delete process.env.LANGFUSE_CAPTURE;
  assert.equal(captureMode(), "redacted", "redacted is the default");
  process.env.LANGFUSE_CAPTURE = "nonsense"; assert.equal(captureMode(), "redacted");
  process.env.LANGFUSE_CAPTURE = "FULL"; assert.equal(captureMode(), "full");
  delete process.env.LANGFUSE_CAPTURE;
});
