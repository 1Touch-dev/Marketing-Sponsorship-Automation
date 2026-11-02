import test from "node:test";
import assert from "node:assert/strict";
import { requireCaller } from "../lib/auth/server-permission";
import http from "node:http";
import type { IncomingHttpHeaders } from "node:http";
import type { AddressInfo } from "node:net";
import { internalCallHeaders, callOwnRoute } from "../lib/auth/internal-call";
import { isPublicPath } from "../lib/auth/public-surface";
import { CORITIBA_TENANT_ID } from "../lib/tenants/types";

const SECRET = "test-internal-secret-0123456789";
const OTHER_TENANT = "11111111-2222-4333-8444-555555555555";

function withSecret<T>(value: string | undefined, fn: () => Promise<T>): Promise<T> {
  const prev = process.env.INTERNAL_API_SECRET;
  if (value === undefined) delete process.env.INTERNAL_API_SECRET; else process.env.INTERNAL_API_SECRET = value;
  return fn().finally(() => { if (prev === undefined) delete process.env.INTERNAL_API_SECRET; else process.env.INTERNAL_API_SECRET = prev; });
}
const req = (headers: Record<string, string>) => new Request("http://x/api/emails/generate", { method: "POST", headers });

test("the app's own call carries the secret, the club and who is calling", async () => {
  await withSecret(SECRET, async () => {
    const h = internalCallHeaders(OTHER_TENANT, "email-sequence");
    assert.equal(h["x-internal-secret"], SECRET);
    assert.equal(h["x-tenant-id"], OTHER_TENANT);
    assert.equal(h["x-service-name"], "email-sequence");
    assert.equal(h["content-type"], "application/json");
  });
  await withSecret(undefined, async () => {
    assert.equal(internalCallHeaders(OTHER_TENANT, "x")["x-internal-secret"], "", "no secret configured sends an empty one, which no route accepts");
  });
});

test("callOwnRoute sends a real request to the internal address, never the public one", async () => {
  const seen: Array<{ method?: string; url?: string; headers: IncomingHttpHeaders; body: string }> = [];
  const server = http.createServer((rq, rs) => {
    let body = ""; rq.on("data", (c) => (body += c));
    rq.on("end", () => { seen.push({ method: rq.method, url: rq.url, headers: rq.headers, body }); rs.writeHead(200, { "content-type": "application/json" }); rs.end("{}"); });
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const port = (server.address() as AddressInfo).port;
  const prev = { i: process.env.INTERNAL_APP_URL, a: process.env.APP_URL, s: process.env.INTERNAL_API_SECRET };
  process.env.INTERNAL_APP_URL = `http://127.0.0.1:${port}`;
  process.env.APP_URL = "https://sponsorship.invalid"; // the public address is dead on purpose
  process.env.INTERNAL_API_SECRET = SECRET;
  try {
    const r1 = await callOwnRoute("/api/intelligence/enrich", { tenantId: OTHER_TENANT, service: "contact-added", body: { company_id: "abc" } });
    const r2 = await callOwnRoute(`/api/companies/xyz/discover`, { tenantId: OTHER_TENANT, service: "company-created" });
    assert.equal(r1.status, 200); assert.equal(r2.status, 200);
    assert.equal(seen.length, 2);
    assert.equal(seen[0].method, "POST"); assert.equal(seen[0].url, "/api/intelligence/enrich");
    assert.deepEqual(JSON.parse(seen[0].body), { company_id: "abc" });
    assert.equal(seen[0].headers["x-internal-secret"], SECRET);
    assert.equal(seen[0].headers["x-tenant-id"], OTHER_TENANT);
    assert.equal(seen[0].headers["x-service-name"], "contact-added");
    assert.equal(seen[1].url, "/api/companies/xyz/discover"); assert.equal(seen[1].body, "");
  } finally {
    server.close();
    for (const [k, v] of [["INTERNAL_APP_URL", prev.i], ["APP_URL", prev.a], ["INTERNAL_API_SECRET", prev.s]] as const) { if (v === undefined) delete process.env[k]; else process.env[k] = v; }
  }
});

test("a valid secret acts for the tenant it names, as a service, with no user", async () => {
  await withSecret(SECRET, async () => {
    const r = await requireCaller(req({ "x-internal-secret": SECRET, "x-tenant-id": OTHER_TENANT, "x-service-name": "email-sequence" }), "create_proposal");
    assert.ok(!("error" in r));
    if ("error" in r) return;
    assert.equal(r.user, null);
    assert.equal(r.tenantId, OTHER_TENANT);
    assert.equal(r.actor.kind, "service");
  });
});

test("a valid secret without a tenant acts for the default club, like the scheduler endpoints", async () => {
  await withSecret(SECRET, async () => {
    const r = await requireCaller(req({ "x-internal-secret": SECRET }), "create_proposal");
    assert.ok(!("error" in r));
    if (!("error" in r)) assert.equal(r.tenantId, CORITIBA_TENANT_ID);
  });
});

test("a malformed tenant is refused with 400, never guessed", async () => {
  await withSecret(SECRET, async () => {
    for (const bad of ["not-a-uuid", "1; drop table companies", "' or 1=1 --"]) {
      const r = await requireCaller(req({ "x-internal-secret": SECRET, "x-tenant-id": bad }), "create_proposal");
      assert.ok("error" in r, `${bad} must be refused`);
      if ("error" in r) assert.equal(r.error.status, 400);
    }
  });
});

test("a wrong, empty or missing secret never gives an internal caller", async () => {
  await withSecret(SECRET, async () => {
    for (const headers of [{ "x-internal-secret": "wrong" }, { "x-internal-secret": SECRET + "x" }, { "x-internal-secret": SECRET.slice(0, -1) }, { "x-internal-secret": "" }, {}] as Record<string, string>[]) {
      // With no valid secret the call falls to the session check; outside a request there is no session, so it is an
      // error or a thrown error, but never a Caller.
      const r = await requireCaller(req({ ...headers, "x-tenant-id": OTHER_TENANT }), "create_proposal").catch((e) => ({ error: e }));
      assert.ok("error" in r, JSON.stringify(headers) + " must not be accepted");
    }
  });
});

test("with no INTERNAL_API_SECRET configured, no header is accepted, not even an empty one", async () => {
  await withSecret(undefined, async () => {
    for (const headers of [{ "x-internal-secret": "" }, { "x-internal-secret": "undefined" }, { authorization: "Bearer " }] as Record<string, string>[]) {
      const r = await requireCaller(req(headers), "create_proposal").catch((e) => ({ error: e }));
      assert.ok("error" in r);
    }
  });
});

test("only the four self-call routes were opened to the middleware, and only those paths", () => {
  for (const ok of ["/api/companies/abc/discover", "/api/intelligence/enrich", "/api/followups/generate", "/api/emails/generate"]) {
    assert.equal(isPublicPath(ok)?.guard, "internal-secret", ok);
  }
  for (const stay of ["/api/companies", "/api/companies/abc", "/api/companies/abc/brief", "/api/companies/abc/discover/x", "/api/intelligence/enrich/x", "/api/intelligence/scrape", "/api/followups", "/api/emails", "/api/emails/generate/x", "/api/emails/abc/send", "/api/proposals/generate"]) {
    assert.equal(isPublicPath(stay), null, `${stay} still needs a staff session`);
  }
});
