import assert from "node:assert/strict";
import test from "node:test";
import { freshDb } from "./harness";
import { pgClient } from "../helpers/pg-from";
import { FakePipedrive } from "../helpers/fake-pipedrive";
import { FakeTwenty } from "../helpers/fake-twenty";
import { SYSTEM, pushDeal, pushOrganization, removeLinks, type PushContext } from "../../lib/twenty/adapter";
import { enqueueCrmSync } from "../../lib/crm/sync";
import { connectionOf, loadHealth } from "../../lib/integrations/health";

const T = "00000000-0000-0000-0000-000000000001";
const CO = "c0000000-0000-4000-8000-0000000000c1";

const seed = (extra = "") => `
  ALTER TABLE public.contacts ADD COLUMN email text, ADD COLUMN phone text, ADD COLUMN created_at timestamptz DEFAULT now();
  ALTER TABLE public.proposals ADD COLUMN status text, ADD COLUMN content jsonb, ADD COLUMN created_at timestamptz DEFAULT now();
  INSERT INTO public.companies (id, tenant_id, company_name) VALUES ('${CO}', '${T}', 'Ambev Brasil');
  ${extra}
`;

const MIGRATIONS = ["0069_identity_tombstones_idempotency.sql", "0075_integration_log.sql"];
const person = { kind: "human" as const, by: "ana@club.com", basis: "proposal_decision" as const };

async function world() {
  process.env.TWENTY_API_KEY = "test-twenty-key";
  process.env.TWENTY_BASE_URL = "http://twenty.test";
  delete process.env.PIPEDRIVE_API_KEY;
  const db = await freshDb(MIGRATIONS, { seed: seed() });
  const sb = pgClient(db);
  const fake = new FakeTwenty();
  const ctx = (over: Partial<PushContext["auth"]> = {}): PushContext => ({ sb, tenantId: T, auth: { ...person, ...over }, twentyHttp: { fetchImpl: fake.fetch, retries: 0 } });
  const q = async <R = any>(sql: string, params: unknown[] = []) => (await db.query(sql, params)).rows as R[];
  const proposal = async (title: string, company = CO) => (await q<{ id: string }>("INSERT INTO public.proposals (tenant_id, company_id, title, status) VALUES ($1, $2, $3, 'approved') RETURNING id", [T, company, title]))[0].id;
  const contact = async (name: string, email: string | null, company = CO) => (await q<{ id: string }>("INSERT INTO public.contacts (tenant_id, company_id, full_name, email) VALUES ($1, $2, $3, $4) RETURNING id", [T, company, name, email]))[0].id;
  const links = () => q<{ entity_type: string; entity_id: string; external_id: string; external_type: string | null }>("SELECT entity_type, entity_id, external_id, external_type FROM public.external_refs WHERE system = 'twenty' AND unlinked_at IS NULL ORDER BY created_at, entity_type");
  return { db, sb, fake, ctx, q, proposal, contact, links };
}

test("the first Twenty push creates the company, person and opportunity and stores each ID; the next push updates them by ID", async () => {
  const w = await world();
  await w.contact("Maria", "maria@ambev.example");
  const p = await w.proposal("Patrocínio 2027");

  const first = await pushDeal(w.ctx(), p, { status: "approved" });
  assert.ok(first.ok && first.created);
  assert.deepEqual((await w.links()).map((l) => `${l.entity_type}:${l.external_type}`).sort(), ["companies:company", "contacts:person", "proposals:opportunity"]);
  assert.equal(w.fake.companies.size + w.fake.people.size + w.fake.opportunities.size, 3);

  const second = await pushDeal(w.ctx(), p, { status: "approved" });
  assert.ok(second.ok && !second.created && second.external_id === first.external_id);
  assert.equal(w.fake.callsTo("POST", "/rest/opportunities").length, 1, "one opportunity was ever created");
  assert.equal(w.fake.callsTo("PATCH", "/rest/opportunities/").length, 1, "and the second push updated it by ID");
  assert.equal(w.fake.callsTo("POST", "/rest/companies").length, 1);
  assert.equal(w.fake.callsTo("POST", "/rest/people").length, 1);
});

test("Twenty is never sent a DELETE, and removing a Coxa record only unlinks", async () => {
  const w = await world();
  const p = await w.proposal("Patrocínio 2027");
  await pushDeal(w.ctx(), p, { status: "approved" });
  await removeLinks(w.ctx(), "proposals", p, "The proposal was deleted");
  assert.equal(w.fake.calls.filter((c) => c.method === "DELETE").length, 0);
  assert.equal(w.fake.opportunities.size, 1);
  assert.equal((await w.q("SELECT id FROM public.external_refs WHERE system = 'twenty' AND entity_type = 'proposals' AND unlinked_at IS NULL")).length, 0);
});

test("without a Twenty key nothing is sent", async () => {
  const w = await world();
  delete process.env.TWENTY_API_KEY;
  const r = await enqueueCrmSync({ entity_type: "company", entity_id: CO, operation: "create" }, w.ctx({ basis: "company_created" }));
  assert.equal(r.sync_status, "skipped");
  assert.equal(w.fake.calls.length, 0);
  process.env.TWENTY_API_KEY = "test-twenty-key";
});

test("a Twenty outage does not fail the Pipedrive push", async () => {
  process.env.PIPEDRIVE_API_KEY = "test-key";
  process.env.TWENTY_API_KEY = "test-twenty-key";
  process.env.TWENTY_BASE_URL = "http://twenty.test";
  const db = await freshDb(MIGRATIONS, { seed: seed() });
  const sb = pgClient(db);
  const pd = new FakePipedrive();
  const tw = new FakeTwenty();
  tw.failNext = { count: 8, status: 500, error: "Twenty is down" };
  const ctx = {
    sb, tenantId: T, auth: { ...person, basis: "company_created" as const },
    http: { fetchImpl: pd.fetch, retries: 0 },
    twentyHttp: { fetchImpl: tw.fetch, retries: 0 },
  };
  const r = await enqueueCrmSync({ entity_type: "company", entity_id: CO, operation: "create" }, ctx);
  assert.equal(r.sync_status, "synced", "Pipedrive still accepted the organization");
  assert.equal(pd.organizations.size, 1);
  assert.equal(r.twenty_result?.sync_status, "failed");
  assert.equal(tw.companies.size, 0);
  assert.equal(connectionOf(await loadHealth(sb, T, SYSTEM, true)).state, "failing");
  delete process.env.PIPEDRIVE_API_KEY;
});

test("creating a company in Twenty stores the company link", async () => {
  const w = await world();
  const r = await pushOrganization(w.ctx({ basis: "company_created" }), CO);
  assert.ok(r.ok && r.created);
  assert.equal(w.fake.companies.size, 1);
  assert.equal([...w.fake.companies.values()][0].name, "Ambev Brasil");
});
