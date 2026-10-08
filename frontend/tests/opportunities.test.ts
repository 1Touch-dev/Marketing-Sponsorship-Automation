import assert from "node:assert/strict";
import test from "node:test";
import { deriveOpportunityStatus, isAttachable, kindFromProposalType, type StatusFacts } from "../lib/opportunities/model";
import { attachNewProposal, closeOrReopen, createOpportunity, assignProposal } from "../lib/opportunities/store";

const facts = (over: Partial<StatusFacts>): StatusFacts => ({ proposalStatuses: [], hasActiveContract: false, lastEvent: null, ...over });

test("a proposal type maps to a deal kind, and no type counts as a cash sponsorship", () => {
  assert.equal(kindFromProposalType("sponsorship"), "cash");
  assert.equal(kindFromProposalType(null), "cash");
  assert.equal(kindFromProposalType(undefined), "cash");
  assert.equal(kindFromProposalType("national_brand"), "cash");
  assert.equal(kindFromProposalType("barter"), "barter");
  assert.equal(kindFromProposalType("mixed"), "hybrid");
  assert.equal(kindFromProposalType("lei_de_incentivo"), "incentive");
  assert.equal(kindFromProposalType("nil_creator"), "other");
});

test("status is derived from proposals, contract and events", () => {
  assert.equal(deriveOpportunityStatus(facts({})), "draft");
  assert.equal(deriveOpportunityStatus(facts({ proposalStatuses: ["draft", "draft"] })), "draft");
  for (const s of ["under_review", "revision_requested", "approved", "sent", "scheduled"]) {
    assert.equal(deriveOpportunityStatus(facts({ proposalStatuses: ["draft", s] })), "open", s);
  }
  assert.equal(deriveOpportunityStatus(facts({ proposalStatuses: ["rejected"] })), "lost");
  assert.equal(deriveOpportunityStatus(facts({ proposalStatuses: ["rejected", "under_review"] })), "open", "one live proposal keeps it open");
  assert.equal(deriveOpportunityStatus(facts({ proposalStatuses: ["approved"], hasActiveContract: true })), "won");
  assert.equal(deriveOpportunityStatus(facts({ proposalStatuses: ["active_contract"] })), "won", "marked in contract counts as won");
  assert.equal(deriveOpportunityStatus(facts({ proposalStatuses: ["under_review"], lastEvent: "closed" })), "closed");
  assert.equal(deriveOpportunityStatus(facts({ proposalStatuses: ["active_contract"], lastEvent: "closed" })), "closed", "a person closing it wins over won");
  assert.equal(deriveOpportunityStatus(facts({ proposalStatuses: ["under_review"], lastEvent: "reopened" })), "open");
});

test("a proposal may join an opportunity that is still being worked, not a finished one", () => {
  assert.deepEqual((["draft", "open", "won", "lost", "closed"] as const).map(isAttachable), [true, true, false, false, false]);
});

// A small in-memory stand-in for the database: tables of rows, chainable filters, recorded writes.
function db(tables: Record<string, any[]>) {
  const inserted: Array<{ table: string; row: any }> = [];
  const updated: Array<{ table: string; patch: any }> = [];
  const from = (table: string) => {
    const rows = () => tables[table] ?? [];
    const c: any = {
      select: () => c, eq: () => c, in: () => c, order: () => c, limit: () => c,
      maybeSingle: async () => ({ data: rows()[0] ?? null, error: null }),
      single: async () => ({ data: rows()[0] ?? null, error: null }),
      then: (res: any) => res({ data: rows(), error: null }),
      insert: (row: any) => { inserted.push({ table, row }); const r = { id: `new-${table}-${inserted.length}`, ...row }; (tables[table] ??= []).push(r); const i: any = { select: () => i, single: async () => ({ data: r, error: null }) }; return i; },
      update: (patch: any) => { updated.push({ table, patch }); const u: any = { eq: () => u, then: (res: any) => res({ error: null }) }; return u; },
    };
    return c;
  };
  return { from, inserted, updated };
}

const company = [{ id: "co1", company_name: "Acme" }];
const human = { kind: "human" as const, email: "rep@club.com", userId: "u1" };

test("an agent can never open an opportunity, and the only rule that can is a contract's renewal", async () => {
  const sb = db({ companies: company });
  const a = await createOpportunity(sb, "t", "co1", { kind: "cash", actor: { kind: "agent", name: "outreach" } });
  assert.equal(!a.ok && a.status, 403);
  const r1 = await createOpportunity(sb, "t", "co1", { kind: "cash", actor: { kind: "rule", name: "x" } });
  assert.equal(!r1.ok && r1.status, 400);
  const r2 = await createOpportunity(sb, "t", "co1", { kind: "renewal", actor: { kind: "rule", name: "renewal_of_signed_contract" } });
  assert.equal(!r2.ok && r2.status, 400, "a renewal must name the contract it renews");
  const none = await createOpportunity(sb, "t", "co1", { kind: "cash", actor: { kind: "human", email: "" } });
  assert.equal(!none.ok && none.status, 403);
  assert.equal(sb.inserted.filter((i) => i.table === "opportunities").length, 0);
});

test("a person opening an opportunity also records the human decision that the account is real", async () => {
  const sb = db({ companies: company, company_research: [], company_qualifications: [] });
  const r = await createOpportunity(sb, "t", "co1", { kind: "barter", actor: human });
  assert.equal(r.ok, true);
  const opp = sb.inserted.find((i) => i.table === "opportunities")!.row;
  assert.equal(opp.created_by_kind, "human");
  assert.equal(opp.created_by, "rep@club.com");
  assert.equal(opp.title, "Barter deal");
  const q = sb.inserted.find((i) => i.table === "company_qualifications")!.row;
  assert.equal(q.actor_kind, "human");
  assert.match(q.reason, /Opened the opportunity/);
});

test("an account that is already qualified is not qualified a second time", async () => {
  const sb = db({ companies: company, company_research: [], company_qualifications: [{ id: "q", created_at: "2026-01-01", decision: "qualified", actor_kind: "human", qualified_by_email: "x", reason: "r" }] });
  const r = await createOpportunity(sb, "t", "co1", { kind: "cash", actor: human });
  assert.equal(r.ok && r.value.qualifiedAccount, false);
  assert.equal(sb.inserted.filter((i) => i.table === "company_qualifications").length, 0);
});

const open = (over: Record<string, unknown> = {}) => ({ id: "o1", company_id: "co1", kind: "cash", title: "Cash", owner_email: null, renews_contract_id: null, created_by_kind: "human", created_by: "x", rule_name: null, pipedrive_deal_id: null, created_at: "2026-01-01", ...over });

test("a new proposal joins an open opportunity of its own kind", async () => {
  const sb = db({ companies: company, opportunities: [open()], proposals: [{ id: "p0", title: "t", status: "under_review", proposal_type: "sponsorship", pipedrive_deal_id: null, created_at: "x", opportunity_id: "o1" }], contracts: [], opportunity_events: [] });
  const r = await attachNewProposal(sb, "t", "co1", "p1", { proposalType: "sponsorship", actor: { kind: "agent", name: "batch" } });
  assert.deepEqual(r, { opportunityId: "o1", created: false });
  assert.equal(sb.inserted.filter((i) => i.table === "opportunities").length, 0);
});

test("an agent's proposal with no open opportunity stays unattached; a person's opens one", async () => {
  const empty = () => db({ companies: company, opportunities: [], proposals: [], contracts: [], opportunity_events: [], company_research: [], company_qualifications: [] });
  const agentDb = empty();
  const agent = await attachNewProposal(agentDb, "t", "co1", "p1", { actor: { kind: "agent", name: "batch" } });
  assert.equal(agent.opportunityId, null);
  assert.equal(agentDb.inserted.filter((i) => i.table === "opportunities").length, 0);

  const personDb = empty();
  const person = await attachNewProposal(personDb, "t", "co1", "p1", { proposalType: "barter", actor: human });
  assert.equal(person.created, true);
  assert.equal(personDb.inserted.find((i) => i.table === "opportunities")!.row.kind, "barter");
  assert.deepEqual(personDb.updated.find((u) => u.table === "proposals")!.patch, { opportunity_id: person.opportunityId });
});

test("parallel deals stay separate: a barter proposal does not join an open cash opportunity", async () => {
  const sb = db({ companies: company, opportunities: [open()], proposals: [{ id: "p0", status: "under_review", opportunity_id: "o1" }], contracts: [], opportunity_events: [], company_research: [], company_qualifications: [] });
  const r = await attachNewProposal(sb, "t", "co1", "p1", { proposalType: "barter", actor: human });
  assert.equal(r.created, true);
  assert.equal(sb.inserted.find((i) => i.table === "opportunities")!.row.kind, "barter");
});

test("a won opportunity does not take new proposals: a new deal starts instead", async () => {
  const sb = db({ companies: company, opportunities: [open()], proposals: [{ id: "p0", status: "active_contract", opportunity_id: "o1" }], contracts: [], opportunity_events: [], company_research: [], company_qualifications: [] });
  const r = await attachNewProposal(sb, "t", "co1", "p1", { actor: human });
  assert.equal(r.created, true);
});

test("a renewal opens a renewal opportunity under the renewal rule, tied to the contract it renews", async () => {
  const sb = db({ companies: company, contracts: [{ id: "k1" }], opportunities: [], proposals: [], opportunity_events: [] });
  const r = await attachNewProposal(sb, "t", "co1", "p1", { actor: { kind: "rule", name: "renewal_of_signed_contract" }, renewsContractId: "k1" });
  assert.equal(r.created, true);
  const row = sb.inserted.find((i) => i.table === "opportunities")!.row;
  assert.deepEqual([row.kind, row.created_by_kind, row.rule_name, row.renews_contract_id], ["renewal", "rule", "renewal_of_signed_contract", "k1"]);
});

test("attaching never throws: a failure leaves the proposal unattached", async () => {
  const broken = { from: () => { throw new Error("db down"); } };
  const r = await attachNewProposal(broken, "t", "co1", "p1", { actor: human });
  assert.equal(r.opportunityId, null);
  assert.match(r.reason ?? "", /db down/);
});

test("closing and reopening need a person and a reason, and follow the current state", async () => {
  const base = { companies: company, proposals: [], contracts: [] };
  const live = db({ ...base, opportunities: [open()], opportunity_events: [] });
  assert.equal((await closeOrReopen(live, "t", "o1", { action: "close", reason: "no", actorEmail: "a@b.c" }) as any).status, 400);
  assert.equal((await closeOrReopen(live, "t", "o1", { action: "close", reason: "Sponsor went elsewhere", actorEmail: "" }) as any).status, 403);
  assert.equal((await closeOrReopen(live, "t", "o1", { action: "reopen", reason: "Not closed at all", actorEmail: "a@b.c" }) as any).status, 409);
  const ok = await closeOrReopen(live, "t", "o1", { action: "close", reason: "Sponsor went elsewhere", actorEmail: "a@b.c" });
  assert.equal(ok.ok, true);
  assert.equal(live.inserted.find((i) => i.table === "opportunity_events")!.row.event_type, "closed");

  const closed = db({ ...base, opportunities: [open()], opportunity_events: [{ opportunity_id: "o1", event_type: "closed", reason: "r", actor_email: "x", created_at: "2026-02-01" }] });
  assert.equal((await closeOrReopen(closed, "t", "o1", { action: "close", reason: "Close it again", actorEmail: "a@b.c" }) as any).status, 409);
  assert.equal((await closeOrReopen(closed, "t", "o1", { action: "reopen", reason: "Sponsor is back", actorEmail: "a@b.c" })).ok, true);
});

test("a proposal can only move to an opportunity of its own company that is still being worked", async () => {
  const sb = db({ proposals: [{ id: "p1", company_id: "co1" }], opportunities: [open({ id: "o1" })], contracts: [], opportunity_events: [{ opportunity_id: "o1", event_type: "closed", reason: "r", actor_email: "x", created_at: "z" }] });
  const closedTarget = await assignProposal(sb, "t", "p1", "o1");
  assert.equal(!closedTarget.ok && closedTarget.status, 409);
  const missing = await assignProposal(db({ proposals: [{ id: "p1", company_id: "co1" }], opportunities: [], contracts: [], opportunity_events: [] }), "t", "p1", "elsewhere");
  assert.equal(!missing.ok && missing.status, 404);
  const detach = await assignProposal(db({ proposals: [{ id: "p1", company_id: "co1" }] }), "t", "p1", null);
  assert.equal(detach.ok, true);
});
