import assert from "node:assert/strict";
import test from "node:test";
import { claimKey, readKey, requestFingerprint, runIdempotent } from "../lib/idempotency";
import { db, type Tables } from "./helpers/fake-db";

const T = "t";
const req = (body: unknown, key?: string, path = "/api/companies") => new Request(`http://x${path}`, { method: "POST", body: JSON.stringify(body), headers: { "content-type": "application/json", ...(key ? { "idempotency-key": key } : {}) } });

test("a key must be 8 to 128 safe characters, and its absence is fine", () => {
  assert.deepEqual(readKey(req({})), { key: null });
  assert.deepEqual(readKey(req({}, "create-acme-0001")), { key: "create-acme-0001" });
  for (const bad of ["short", "has spaces in it", "x".repeat(129), "bad/slash-key-123"]) assert.ok("error" in readKey(req({}, bad)), bad);
});

test("the same request has the same fingerprint whatever the key order, and a different one does not", () => {
  const a = requestFingerprint("POST", "/api/companies", JSON.stringify({ name: "Acme", tier: 1 }));
  assert.equal(a, requestFingerprint("post", "/api/companies", JSON.stringify({ tier: 1, name: "Acme" })));
  assert.notEqual(a, requestFingerprint("POST", "/api/companies", JSON.stringify({ name: "Acme", tier: 2 })));
  assert.notEqual(a, requestFingerprint("POST", "/api/contacts", JSON.stringify({ name: "Acme", tier: 1 })));
  assert.match(requestFingerprint("POST", "/x", "not json"), /^[0-9a-f]{64}$/);
});

const tables = (): Tables => ({ idempotency_keys: [] });
const store = (t: Tables, missing = false) => db(t, { unique: { idempotency_keys: ["tenant_id", "scope", "idem_key"] }, missing: missing ? ["idempotency_keys"] : [] });

test("the first request takes the key; a repeat sees the answer, a different request is refused, an unfinished one waits", async () => {
  const t = tables();
  const sb = store(t);
  const first = await claimKey(sb, T, "companies.create:u1", "key-12345678", "h1", "u1");
  assert.equal(first.state, "new");
  assert.equal((await claimKey(sb, T, "companies.create:u1", "key-12345678", "h1", "u1")).state, "in_progress");
  assert.equal((await claimKey(sb, T, "companies.create:u1", "key-12345678", "OTHER", "u1")).state, "mismatch");
  t.idempotency_keys[0].status = "completed"; t.idempotency_keys[0].response_status = 201; t.idempotency_keys[0].response_body = { id: "co1" };
  assert.deepEqual(await claimKey(sb, T, "companies.create:u1", "key-12345678", "h1", "u1"), { state: "replay", status: 201, body: { id: "co1" } });
  assert.equal((await claimKey(sb, T, "companies.create:u2", "key-12345678", "h1", "u2")).state, "new", "another person's key is separate");
});

test("a repeated request does the work once and gets the first answer back", async () => {
  const t = tables();
  const sb = store(t);
  let runs = 0;
  const handler = async (r: Request) => { runs++; const b = await r.json(); return new Response(JSON.stringify({ id: `co-${runs}`, name: b.name }), { status: 201, headers: { "content-type": "application/json" } }); };
  const go = (body: unknown, key = "key-create-01") => runIdempotent({ sb, tenantId: T, actorId: "u1", scope: "companies.create", key, req: req(body, key), ctx: {}, handler });
  const a = await go({ name: "Acme" });
  assert.equal(a.status, 201);
  assert.equal(a.headers.get("Idempotent-Replay"), null);
  const b = await go({ name: "Acme" });
  assert.equal(b.status, 201);
  assert.equal(b.headers.get("Idempotent-Replay"), "true");
  assert.deepEqual(await b.json(), { id: "co-1", name: "Acme" });
  assert.equal(runs, 1, "the handler ran once");
  const c = await go({ name: "Different" });
  assert.equal(c.status, 422);
  assert.match((await c.json()).error, /different request/);
  assert.equal(runs, 1);
  assert.equal(t.idempotency_keys[0].status, "completed");
});

test("a request that fails with a server error keeps no key, so it can be retried", async () => {
  const t = tables();
  const sb = store(t);
  let n = 0;
  const handler = async () => (++n === 1 ? new Response(JSON.stringify({ error: "boom" }), { status: 500 }) : new Response(JSON.stringify({ ok: true }), { status: 201 }));
  const go = () => runIdempotent({ sb, tenantId: T, actorId: "u1", scope: "x", key: "key-retry-01", req: req({ a: 1 }, "key-retry-01"), ctx: {}, handler });
  assert.equal((await go()).status, 500);
  assert.equal(t.idempotency_keys.length, 0, "the failed attempt released its key");
  assert.equal((await go()).status, 201);
  assert.equal(n, 2);
  assert.equal((await go()).headers.get("Idempotent-Replay"), "true");
});

test("a handler that throws releases its key and the error still reaches the caller", async () => {
  const t = tables();
  const sb = store(t);
  const handler = async () => { throw new Error("handler blew up"); };
  await assert.rejects(runIdempotent({ sb, tenantId: T, actorId: "u1", scope: "x", key: "key-throw-001", req: req({}, "key-throw-001"), ctx: {}, handler }), /handler blew up/);
  assert.equal(t.idempotency_keys.length, 0);
});

test("a client error is also remembered: repeating a bad request gets the same refusal without rerunning", async () => {
  const t = tables();
  const sb = store(t);
  let n = 0;
  const handler = async () => { n++; return new Response(JSON.stringify({ error: "name required" }), { status: 400 }); };
  const go = () => runIdempotent({ sb, tenantId: T, actorId: "u1", scope: "x", key: "key-bad-0001", req: req({}, "key-bad-0001"), ctx: {}, handler });
  assert.equal((await go()).status, 400);
  const again = await go();
  assert.deepEqual([again.status, again.headers.get("Idempotent-Replay"), n], [400, "true", 1]);
});

test("a request still running is told to wait, and a non-JSON answer is kept as text", async () => {
  const t = tables();
  const sb = store(t);
  await claimKey(sb, T, "x:u1", "key-slow-0001", requestFingerprint("POST", "/api/companies", JSON.stringify({ a: 1 })), "u1");
  const wait = await runIdempotent({ sb, tenantId: T, actorId: "u1", scope: "x", key: "key-slow-0001", req: req({ a: 1 }, "key-slow-0001"), ctx: {}, handler: async () => new Response("never") });
  assert.equal(wait.status, 409);
  assert.equal(wait.headers.get("Retry-After"), "2");
  const t2 = tables();
  const txt = await runIdempotent({ sb: store(t2), tenantId: T, actorId: "u1", scope: "x", key: "key-text-0001", req: req({}, "key-text-0001"), ctx: {}, handler: async () => new Response("<html>ok</html>", { status: 200 }) });
  assert.equal(txt.status, 200);
  assert.deepEqual(t2.idempotency_keys[0].response_body, { _text: "<html>ok</html>" });
});

test("before the migration the route simply runs: idempotency is off, nothing breaks", async () => {
  let n = 0;
  const handler = async () => { n++; return new Response(JSON.stringify({ ok: true }), { status: 201 }); };
  const go = () => runIdempotent({ sb: store(tables(), true), tenantId: T, actorId: "u1", scope: "x", key: "key-pre-00001", req: req({}, "key-pre-00001"), ctx: {}, handler });
  assert.equal((await go()).status, 201);
  assert.equal((await go()).status, 201);
  assert.equal(n, 2, "without the table every call runs, as before");
});
