import assert from "node:assert/strict";
import test from "node:test";
import { ProviderBreaker, openaiTextCostUsd } from "../lib/ai/cost-controls";
import { AllProvidersFailedError, runProviderChain } from "../lib/ai/provider-chain";
import {
  DEFAULT_OPENAI_TEXT_MODEL, DEFAULT_OPENAI_TOOL_MODEL, chatCompletion, converseWithToolsOpenAI, invokeOpenAIText, isOpenAITextConfigured,
  toOpenAIMessages, toOpenAITools,
} from "../lib/openai/text-client";

process.env.OPENAI_API_KEY = "sk-test-0000000000000000";
delete process.env.OPENAI_TEXT_MODEL;
delete process.env.OPENAI_BASE_URL;

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
type Call = { url: string; body: Record<string, unknown>; auth: string | null };
function mockFetch(responses: Response[]) {
  const calls: Call[] = [];
  const f = (async (url: string, init: RequestInit) => {
    calls.push({ url, body: JSON.parse(String(init.body)), auth: new Headers(init.headers).get("authorization") });
    const r = responses.shift();
    if (!r) throw new Error("unexpected extra request");
    return r;
  }) as unknown as typeof fetch;
  return { f, calls };
}
const ok = (message: Record<string, unknown>, extra: Record<string, unknown> = {}) =>
  json({ choices: [{ message, finish_reason: "stop" }], usage: { prompt_tokens: 100, completion_tokens: 20 }, ...extra });

// ── The chain ────────────────────────────────────────────────────────────────
test("chain: the first provider that works answers and later ones are never called", async () => {
  const seen: string[] = [];
  const r = await runProviderChain([
    { provider: "a", run: async () => (seen.push("a"), "A") },
    { provider: "b", run: async () => (seen.push("b"), "B") },
  ]);
  assert.deepEqual([r.provider, r.result, seen], ["a", "A", ["a"]]);
});

test("chain: a failing provider falls through to the next, and the failure is reported", async () => {
  const failed: string[] = [];
  const r = await runProviderChain(
    [
      { provider: "bedrock", run: async () => { throw new Error("creds dead"); } },
      { provider: "anthropic", run: async () => { throw new Error("org disabled"); } },
      { provider: "openai", run: async () => "from openai" },
    ],
    (p) => failed.push(p),
  );
  assert.equal(r.provider, "openai");
  assert.deepEqual(failed, ["bedrock", "anthropic"]);
});

test("chain: a provider whose breaker is open is skipped, but the last one is always tried", async () => {
  const tripped = new ProviderBreaker();
  tripped.trip();
  const seen: string[] = [];
  const r = await runProviderChain([
    { provider: "bedrock", breaker: tripped, run: async () => (seen.push("bedrock"), "x") },
    { provider: "openai", breaker: tripped, run: async () => (seen.push("openai"), "y") },
  ]);
  assert.deepEqual([r.provider, seen], ["openai", ["openai"]]);
});

test("chain: a failure trips the breaker so the next call skips the dead provider", async () => {
  const breaker = new ProviderBreaker();
  let deadCalls = 0;
  const attempts = () => [
    { provider: "anthropic", breaker, run: async () => { deadCalls++; throw new Error("nope"); } },
    { provider: "openai", run: async () => "ok" },
  ];
  await runProviderChain(attempts());
  await runProviderChain(attempts());
  assert.equal(deadCalls, 1);
});

test("chain: when everything fails the error lists every provider; a lone provider keeps its own error", async () => {
  await assert.rejects(
    runProviderChain([
      { provider: "anthropic", run: async () => { throw new Error("A broke"); } },
      { provider: "openai", run: async () => { throw new Error("O broke"); } },
    ]),
    (e: unknown) => e instanceof AllProvidersFailedError && /anthropic: A broke/.test(e.message) && /openai: O broke/.test(e.message),
  );
  const only = new TypeError("just one");
  await assert.rejects(runProviderChain([{ provider: "bedrock", run: async () => { throw only; } }]), (e) => e === only);
});

// ── Translation ──────────────────────────────────────────────────────────────
test("messages: system prompt, text turns, tool calls and tool results map to OpenAI's shapes in order", () => {
  const out = toOpenAIMessages("be brief", [
    { role: "user", content: [{ text: "find sponsors" }] },
    { role: "assistant", content: [{ text: "searching" }, { toolUse: { toolUseId: "t1", name: "search", input: { q: "nike" } } }] },
    { role: "user", content: [{ toolResult: { toolUseId: "t1", content: [{ json: { hits: 2 } }], status: "success" } }] },
    { role: "assistant", content: [{ toolUse: { toolUseId: "t2", name: "send", input: {} } }] },
    { role: "user", content: [{ toolResult: { toolUseId: "t2", content: [{ text: "blocked" }], status: "error" } }, { text: "try again" }] },
  ]);
  assert.deepEqual(out, [
    { role: "system", content: "be brief" },
    { role: "user", content: "find sponsors" },
    { role: "assistant", content: "searching", tool_calls: [{ id: "t1", type: "function", function: { name: "search", arguments: '{"q":"nike"}' } }] },
    { role: "tool", tool_call_id: "t1", content: '{"hits":2}' },
    { role: "assistant", content: null, tool_calls: [{ id: "t2", type: "function", function: { name: "send", arguments: "{}" } }] },
    { role: "tool", tool_call_id: "t2", content: "[error] blocked" },
    { role: "user", content: "try again" },
  ]);
});

test("tools: Converse tool specs become OpenAI function tools", () => {
  const t = toOpenAITools([{ toolSpec: { name: "search", description: "look up", inputSchema: { json: { type: "object", properties: { q: { type: "string" } } } } } }]);
  assert.deepEqual(t, [{ type: "function", function: { name: "search", description: "look up", parameters: { type: "object", properties: { q: { type: "string" } } } } }]);
});

// ── Plain calls ──────────────────────────────────────────────────────────────
test("invoke: sends the key, default model and max_completion_tokens, and returns text + parsed JSON + usage", async () => {
  const m = mockFetch([ok({ content: '```json\n{"a":1}\n```' }, { usage: { prompt_tokens: 1000, completion_tokens: 50, prompt_tokens_details: { cached_tokens: 400 } } })]);
  const r = await invokeOpenAIText<{ a: number }>({ system: "s", messages: [{ role: "user", content: "hi" }], json: true }, m.f);
  assert.deepEqual(r.json, { a: 1 });
  assert.deepEqual(r.usage, { input_tokens: 600, output_tokens: 50, cache_read_input_tokens: 400, cache_creation_input_tokens: 0 });
  assert.equal(m.calls[0].auth, "Bearer sk-test-0000000000000000");
  assert.equal(m.calls[0].url, "https://api.openai.com/v1/chat/completions");
  assert.equal(m.calls[0].body.model, DEFAULT_OPENAI_TEXT_MODEL);
  assert.equal(typeof m.calls[0].body.max_completion_tokens, "number");
  assert.equal("max_tokens" in m.calls[0].body, false);
});

test("invoke: a model that rejects `temperature` is retried once without it", async () => {
  const m = mockFetch([
    json({ error: { message: "Unsupported value: 'temperature' does not support 0.4 with this model." } }, 400),
    ok({ content: "fine" }),
  ]);
  const r = await invokeOpenAIText({ messages: [{ role: "user", content: "hi" }] }, m.f);
  assert.equal(r.text, "fine");
  assert.equal("temperature" in m.calls[0].body, true);
  assert.equal("temperature" in m.calls[1].body, false);
});

test("http: a busy error (429/5xx) is retried once, a real error (401) is not and never leaks the key", async () => {
  const busy = mockFetch([json({ error: "busy" }, 429), ok({ content: "after retry" })]);
  const r = await chatCompletion({ model: "m", messages: [] }, busy.f, 0);
  assert.equal(r.choices?.[0].message?.content, "after retry");

  const bad = mockFetch([json({ error: { message: "Incorrect API key provided: sk-proj-abcdefghijklmnop." } }, 401)]);
  await assert.rejects(chatCompletion({ model: "m", messages: [] }, bad.f, 0), (e: Error) => /401/.test(e.message) && !/abcdefghijklmnop/.test(e.message));
  assert.equal(bad.calls.length, 1);
});

// ── Tool-use loop ────────────────────────────────────────────────────────────
test("converse: tool calls come back in Converse shape with stopReason tool_use", async () => {
  const m = mockFetch([
    json({
      choices: [{ finish_reason: "tool_calls", message: { content: null, tool_calls: [{ id: "call_1", type: "function", function: { name: "search", arguments: '{"q":"nike"}' } }] } }],
      usage: { prompt_tokens: 200, completion_tokens: 30 },
    }),
  ]);
  const r = await converseWithToolsOpenAI(
    { system: "s", messages: [{ role: "user", content: [{ text: "go" }] }], tools: [{ toolSpec: { name: "search", description: "d", inputSchema: { json: { type: "object" } } } }] },
    m.f,
  );
  assert.equal(r.stopReason, "tool_use");
  assert.deepEqual(r.toolCalls, [{ name: "search", input: { q: "nike" }, toolUseId: "call_1" }]);
  assert.deepEqual(r.message.content, [{ toolUse: { toolUseId: "call_1", name: "search", input: { q: "nike" } } }]);
  assert.deepEqual(r.usage, { inputTokens: 200, outputTokens: 30, cacheReadTokens: 0, cacheWriteTokens: 0 });
  assert.equal(m.calls[0].body.tool_choice, "auto");
  assert.equal(m.calls[0].body.reasoning_effort, "none"); // required for function tools on the tool model (found in the live test)
  assert.equal(m.calls[0].body.model, DEFAULT_OPENAI_TOOL_MODEL); // sol/astra refuse function tools on this endpoint
});

test("http: a model that rejects reasoning_effort or temperature has just that setting dropped and the call retried", async () => {
  const m = mockFetch([
    json({ error: { message: "Unsupported parameter: 'reasoning_effort' is not supported with this model." } }, 400),
    json({ error: { message: "'temperature' is not supported" } }, 400),
    ok({ content: "ok" }),
  ]);
  const r = await chatCompletion({ model: "m", temperature: 0.3, reasoning_effort: "none", messages: [] }, m.f, 0);
  assert.equal(r.choices?.[0].message?.content, "ok");
  assert.deepEqual(m.calls.map((c) => [("reasoning_effort" in c.body), ("temperature" in c.body)]), [[true, true], [false, true], [false, false]]);
});

test("converse: a plain answer ends the turn; broken tool arguments become an empty object instead of crashing", async () => {
  const plain = mockFetch([ok({ content: "done" })]);
  const a = await converseWithToolsOpenAI({ system: "s", messages: [], tools: [] }, plain.f);
  assert.deepEqual([a.stopReason, a.text, a.toolCalls.length], ["end_turn", "done", 0]);
  assert.equal("tools" in plain.calls[0].body, false);

  const broken = mockFetch([ok({ content: null, tool_calls: [{ id: "c", type: "function", function: { name: "x", arguments: "{not json" } }] })]);
  const b = await converseWithToolsOpenAI({ system: "s", messages: [], tools: [] }, broken.f);
  assert.deepEqual(b.toolCalls[0].input, {});
});

// ── Cost + config ────────────────────────────────────────────────────────────
test("cost: each known OpenAI model bills at its own rate", () => {
  assert.equal(openaiTextCostUsd({ input: 1_000_000, output: 1_000_000 }, "gpt-6.1-terra"), 6);
  assert.equal(openaiTextCostUsd({ input: 1_000_000, output: 1_000_000 }, "gpt-6.1-sol"), 12);
  assert.equal(openaiTextCostUsd({ input: 1_000_000 }, "some-new-model"), 2); // unknown model: the default rates
});

test("cost: OpenAI rates default to $2 in / $10 out / $0.10 cached per million, and can be overridden", () => {
  assert.equal(openaiTextCostUsd({ input: 1_000_000 }), 2);
  assert.equal(openaiTextCostUsd({ output: 1_000_000 }), 10);
  assert.ok(Math.abs(openaiTextCostUsd({ cacheRead: 1_000_000 }) - 0.1) < 1e-9);
  process.env.OPENAI_TEXT_OUTPUT_PER_MTOK = "20";
  assert.equal(openaiTextCostUsd({ output: 1_000_000 }), 20);
  delete process.env.OPENAI_TEXT_OUTPUT_PER_MTOK;
});

test("config: the backup is only on when a key is set", () => {
  assert.equal(isOpenAITextConfigured(), true);
  const saved = process.env.OPENAI_API_KEY;
  process.env.OPENAI_API_KEY = "";
  assert.equal(isOpenAITextConfigured(), false);
  process.env.OPENAI_API_KEY = saved;
});
