import assert from "node:assert/strict";
import test from "node:test";
import {
  addDays, allowedActions, deliverableKey, deriveStatus, eventFor, evidenceStrength, isProven, legacyProjection, matchingLegacyDone, planObligations,
  resolveOwner, STANDARD_OBLIGATIONS, timing, validateEvent, type LegacyTask,
} from "../lib/obligations/model";
import { contractObligationFacts } from "../lib/obligations/facts";
import { handoffContract, listObligations, recordEvent, updateObligation } from "../lib/obligations/store";
import { db, type Tables } from "./helpers/fake-db";

const ev = (event_type: any, created_at: string) => ({ event_type, created_at });
const alloc = (id: string, name: string, quantity = 1) => ({ allocation_id: id, inventory_name: name, quantity, unit: "per_season" });
const title = (a: { inventory_name: string | null; quantity: number }) => `Entregar: ${a.inventory_name} × ${a.quantity}`;

// ── the plan ────────────────────────────────────────────────────────────────

test("every planned obligation has a date, from a stated rule", () => {
  const r = planObligations({ startDate: "2026-11-01", endDate: "2027-10-31", allocations: [alloc("a1", "LED")], deliverables: [], titleForAllocation: title });
  assert.ok(r.ok);
  if (!r.ok) return;
  assert.equal(r.items.length, STANDARD_OBLIGATIONS.length + 1);
  for (const i of r.items) { assert.match(i.due_date, /^\d{4}-\d{2}-\d{2}$/); assert.ok(i.due_basis.length > 0); assert.ok(i.source_key.length > 0); }
  assert.equal(r.items.find((i) => i.source_key === "standard:kickoff-meeting")!.due_date, "2026-11-15");
  assert.equal(r.items.find((i) => i.source_key === "standard:billing-schedule")!.due_basis, "contract start + 7 days");
  const led = r.items.find((i) => i.source_key === "allocation:a1")!;
  assert.deepEqual([led.kind, led.due_date, led.due_basis, led.allocation_id, led.quantity], ["deliverable", "2027-10-31", "contract end date", "a1", 1]);
});

test("a step never falls due after the contract ends", () => {
  const r = planObligations({ startDate: "2026-11-01", endDate: "2026-11-05", allocations: [], deliverables: [], titleForAllocation: title });
  assert.ok(r.ok && r.items.every((i) => i.due_date <= "2026-11-05"));
});

test("a contract without usable dates plans nothing and says why", () => {
  const none = planObligations({ startDate: null, endDate: null, allocations: [], deliverables: [], titleForAllocation: title });
  assert.ok(!none.ok && none.problems.length === 2);
  const reversed = planObligations({ startDate: "2027-01-01", endDate: "2026-01-01", allocations: [], deliverables: [], titleForAllocation: title });
  assert.match(!reversed.ok ? reversed.problems.join() : "", /ends before it starts/);
});

test("sold items come from the allocations; the proposal's text is only a fallback, never both", () => {
  const withAlloc = planObligations({ startDate: "2026-11-01", endDate: "2027-10-31", allocations: [alloc("a1", "LED")], deliverables: ["Texto livre"], titleForAllocation: title });
  assert.ok(withAlloc.ok && withAlloc.items.filter((i) => i.kind === "deliverable").map((i) => i.source_key).join() === "allocation:a1");
  const text = planObligations({ startDate: "2026-11-01", endDate: "2027-10-31", allocations: [], deliverables: ["Texto livre", " texto  livre ", "Outro"], titleForAllocation: title });
  assert.ok(text.ok);
  if (text.ok) { const d = text.items.filter((i) => i.kind === "deliverable"); assert.equal(d.length, 2, "the repeated line is one commitment"); assert.equal(d[0].title, "Entregar: Texto livre"); }
  assert.equal(deliverableKey("Texto  livre"), deliverableKey(" texto livre "));
  assert.notEqual(deliverableKey("a"), deliverableKey("b"));
});

test("date arithmetic crosses month and year ends", () => {
  assert.equal(addDays("2026-12-25", 14), "2027-01-08");
  assert.equal(addDays("2026-01-31", 1), "2026-02-01");
});

// ── the owner ───────────────────────────────────────────────────────────────

test("the default owner is the deal's owner, then the person acting, then an admin, and never nobody", () => {
  assert.deepEqual(resolveOwner({ opportunityOwner: "Deal@Club.com", actorEmail: "a@club.com", tenantAdmin: "z@club.com" }), { email: "deal@club.com", basis: "opportunity_owner" });
  assert.deepEqual(resolveOwner({ opportunityOwner: null, actorEmail: "a@club.com", tenantAdmin: "z@club.com" }), { email: "a@club.com", basis: "handoff_actor" });
  assert.deepEqual(resolveOwner({ opportunityOwner: "not an email", actorEmail: "", tenantAdmin: "z@club.com" }), { email: "z@club.com", basis: "tenant_admin" });
  assert.equal(resolveOwner({ opportunityOwner: null, actorEmail: null, tenantAdmin: null }), null);
});

// ── status and events ───────────────────────────────────────────────────────

test("status is derived from the history, and reopening starts over", () => {
  assert.equal(deriveStatus([]), "open");
  assert.equal(deriveStatus([ev("delivered", "2026-10-01")]), "delivered");
  assert.equal(deriveStatus([ev("delivered", "2026-10-01"), ev("evidenced", "2026-10-02")]), "evidenced");
  assert.equal(deriveStatus([ev("evidenced", "2026-10-02"), ev("delivered", "2026-10-01"), ev("accepted", "2026-10-03")]), "accepted");
  assert.equal(deriveStatus([ev("delivered", "2026-10-01"), ev("reopened", "2026-10-02")]), "open");
  assert.equal(deriveStatus([ev("waived", "2026-10-01")]), "waived");
});

test("the allowed moves, and what counts as proven", () => {
  assert.deepEqual(allowedActions("open").sort(), ["deliver", "waive"]);
  assert.deepEqual(allowedActions("delivered").sort(), ["evidence", "reopen", "waive"]);
  assert.deepEqual(allowedActions("evidenced").sort(), ["accept", "evidence", "reopen", "waive"]);
  assert.deepEqual(allowedActions("accepted"), ["reopen"]);
  assert.equal(eventFor("open", "accept"), null, "nothing is accepted before it is delivered and proven");
  assert.equal(eventFor("delivered", "accept"), null, "delivery without proof cannot be accepted");
  assert.ok(isProven("evidenced") && isProven("accepted") && isProven("waived"));
  assert.ok(!isProven("open") && !isProven("delivered"), "claimed delivery is not proof");
});

test("work is late only while it is not done", () => {
  assert.equal(timing("2026-10-01", "open", "2026-10-07"), "overdue");
  assert.equal(timing("2026-10-01", "delivered", "2026-10-07"), "overdue", "delivered but no proof is still a gap");
  assert.equal(timing("2026-10-01", "evidenced", "2026-10-07"), "done");
  assert.equal(timing("2026-10-10", "open", "2026-10-07"), "due_soon");
  assert.equal(timing("2026-12-10", "open", "2026-10-07"), "upcoming");
  assert.equal(timing("2026-10-07", "open", "2026-10-07"), "due_soon", "due today is not yet late");
});

test("proof must be a real link, a real file link or a substantial written statement", () => {
  assert.deepEqual(validateEvent({ action: "evidence", evidenceKind: "link", evidenceRef: "https://club.com/photos/1" }), []);
  assert.match(validateEvent({ action: "evidence", evidenceKind: "link", evidenceRef: "photo of it" }).join(), /web address/);
  assert.match(validateEvent({ action: "evidence", evidenceKind: "file", evidenceRef: "" }).join(), /evidence_ref is required/);
  assert.match(validateEvent({ action: "evidence", evidenceKind: "statement", evidenceRef: "done" }).join(), /20\+ characters/);
  assert.deepEqual(validateEvent({ action: "evidence", evidenceKind: "statement", evidenceRef: "Shown on the LED in all 25 home games, confirmed by match ops" }), []);
  assert.match(validateEvent({ action: "evidence", evidenceKind: "photo", evidenceRef: "https://x.co" }).join(), /link, file or statement/);
  assert.match(validateEvent({ action: "waive", reason: "no" }).join(), /reason/);
  assert.match(validateEvent({ action: "reopen" }).join(), /reason/);
  assert.deepEqual(validateEvent({ action: "deliver" }), []);
  assert.deepEqual([evidenceStrength("link"), evidenceStrength("file"), evidenceStrength("statement"), evidenceStrength(null)], ["attached", "attached", "stated", "none"]);
});

// ── the old checklist ───────────────────────────────────────────────────────

const legacy = (id: string, t: string, status: "pending" | "done", allocation_id: string | null = null): LegacyTask => ({ id, title: t, status, created_at: "2026-09-17T00:00:00Z", completed_at: status === "done" ? "2026-09-18T10:00:00Z" : null, allocation_id });

test("a task already ticked in the old checklist is recognised by allocation or by its title", () => {
  const tasks = [legacy("1", "Enviar contrato assinado e nota fiscal ao patrocinador", "done"), legacy("2", "Kickoff", "pending"), legacy("3", "Entregar: LED × 1", "done", "a1")];
  assert.equal(matchingLegacyDone(tasks, { title: " enviar contrato assinado e  nota fiscal ao patrocinador", allocation_id: null })?.id, "1");
  assert.equal(matchingLegacyDone(tasks, { title: "different wording", allocation_id: "a1" })?.id, "3");
  assert.equal(matchingLegacyDone(tasks, { title: "Kickoff", allocation_id: null }), null, "a pending task carries nothing over");
});

test("the checklist the pages read is rebuilt from obligations", () => {
  const p = legacyProjection([
    { id: "o1", title: "A", created_at: "c", allocation_id: null, status: "open", doneAt: null },
    { id: "o2", title: "B", created_at: "c", allocation_id: "a1", status: "evidenced", doneAt: "2026-10-02" },
  ]);
  assert.deepEqual(p.map((t) => [t.id, t.status, t.completed_at]), [["o1", "pending", null], ["o2", "done", "2026-10-02"]]);
});

// ── the store, against an in-memory stand-in with real filters (tests/helpers/fake-db.ts) ──

const T = "t";
const company = { id: "co1", tenant_id: T, company_name: "Acme" };
const contract = (over: any = {}) => ({ id: "k1", tenant_id: T, title: "Acme 2027", company_id: "co1", status: "active", start_date: "2026-11-01", end_date: "2027-10-31", proposal_id: "pr1", opportunity_id: "op1", ...over });
const world = (over: Tables = {}): Tables => ({
  contracts: [contract()], companies: [company], proposals: [{ id: "pr1", tenant_id: T, opportunity_id: "op1", content: { deliverables: ["Texto"], fulfillment_tasks: [] } }],
  contract_allocations: [{ ...alloc("a1", "LED"), contract_id: "k1", tenant_id: T }, { ...alloc("a2", "Banner", 2), contract_id: "k1", tenant_id: T }],
  opportunities: [{ id: "op1", tenant_id: T, owner_email: "Deal.Owner@club.com" }], platform_users: [{ email: "admin@club.com", role: "admin", is_active: true, tenant_id: T }],
  obligations: [], obligation_events: [], projects: [], project_events: [], ...over,
});

test("the handoff creates owned, dated obligations for every sold item and onboarding step, under one delivery project", async () => {
  const tables = world();
  const r = await handoffContract(db(tables), T, "k1", { email: "rep@club.com" });
  assert.ok(r.ok);
  if (!r.ok) return;
  assert.equal(r.value.created, STANDARD_OBLIGATIONS.length + 2);
  assert.deepEqual(r.value.owner, { email: "deal.owner@club.com", basis: "opportunity_owner" });
  assert.equal(r.value.project_created, true);
  for (const o of tables.obligations) {
    assert.ok(o.owner_email && o.due_date && o.due_basis && o.owner_basis, "owned and dated");
    assert.equal(o.project_id, r.value.project_id, "held by the delivery project");
    assert.equal(o.company_id, "co1");
  }
  const banner = tables.obligations.find((o) => o.source_key === "allocation:a2");
  assert.deepEqual([banner.allocation_id, banner.quantity, banner.kind], ["a2", 2, "deliverable"], "linked to the sold allocation");
  assert.equal(tables.projects.length, 1);
  assert.equal(tables.projects[0].contract_id, "k1");
  assert.equal(tables.projects[0].project_type, "delivery");
});

test("running the handoff again adds nothing; a new allocation adds only itself", async () => {
  const tables = world();
  const sb = db(tables);
  await handoffContract(sb, T, "k1", { email: "rep@club.com" });
  const first = tables.obligations.length;
  const again = await handoffContract(sb, T, "k1", { email: "someone.else@club.com" });
  assert.ok(again.ok && again.value.created === 0 && again.value.already_existed === first && again.value.project_created === false);
  assert.equal(tables.obligations.length, first);
  assert.equal(tables.projects.length, 1, "no second project");
  tables.contract_allocations.push({ ...alloc("a3", "Social", 4), contract_id: "k1", tenant_id: T });
  const more = await handoffContract(sb, T, "k1", { email: "rep@club.com" });
  assert.ok(more.ok && more.value.created === 1);
  assert.equal(tables.obligations.length, first + 1);
  assert.equal(tables.obligations.at(-1).project_id, tables.projects[0].id, "the new one joins the same project");
});

test("with no deal owner the person who triggers it owns the work; with nobody, an admin does", async () => {
  const t1 = world({ opportunities: [{ id: "op1", tenant_id: T, owner_email: null }] });
  const r1 = await handoffContract(db(t1), T, "k1", { email: "rep@club.com" });
  assert.ok(r1.ok && r1.value.owner.basis === "handoff_actor" && t1.obligations.every((o) => o.owner_email === "rep@club.com"));
});

test("a contract that cannot be handed off is refused with the reason, and nothing is created", async () => {
  const cases: Array<[string, Tables, RegExp, number]> = [
    ["no company", world({ contracts: [contract({ company_id: null })] }), /not linked to a company/, 409],
    ["not active", world({ contracts: [contract({ status: "draft" })] }), /only for an active contract/, 409],
    ["no dates", world({ contracts: [contract({ start_date: null, end_date: null })] }), /no start date; the contract has no end date/, 409],
    ["unknown", world({ contracts: [] }), /not found/, 404],
  ];
  for (const [name, tables, why, status] of cases) {
    const r = await handoffContract(db(tables), T, "k1", { email: "rep@club.com" });
    assert.ok(!r.ok && r.status === status && why.test(r.error), name);
    assert.equal(tables.obligations.length, 0, name);
    assert.equal(tables.projects.length, 0, name);
  }
  assert.equal(((await handoffContract(db(world()), T, "k1", { email: "" })) as any).status, 403);
});

test("before the migration is applied the handoff says so instead of failing", async () => {
  const r = await handoffContract(db(world(), { missing: ["obligations"] }), T, "k1", { email: "rep@club.com" });
  assert.ok(!r.ok && r.status === 503 && /migration 0064/.test(r.error));
});

test("work already ticked in the old checklist is carried over as delivered, without pretending it has proof", async () => {
  const done = legacy("L1", STANDARD_OBLIGATIONS[0].title, "done");
  const tables = world({ proposals: [{ id: "pr1", tenant_id: T, opportunity_id: "op1", content: { fulfillment_tasks: [done, legacy("L2", STANDARD_OBLIGATIONS[2].title, "pending")] } }] });
  const r = await handoffContract(db(tables), T, "k1", { email: "rep@club.com" });
  assert.ok(r.ok && r.value.marked_delivered_from_checklist === 1);
  assert.equal(tables.obligation_events.length, 1);
  assert.deepEqual([tables.obligation_events[0].event_type, tables.obligation_events[0].actor_email], ["delivered", "legacy-checklist"]);
  assert.match(tables.obligation_events[0].note, /No proof was attached/);
  const listed = await listObligations(db(tables), T, { contractId: "k1" });
  assert.ok(listed.ok);
  if (listed.ok) { assert.equal(listed.value.filter((o) => o.status === "delivered").length, 1); assert.equal(listed.value.find((o) => o.status === "delivered")!.proof, "none"); }
});

test("the checklist stored in the proposal is rebuilt from the obligations, so there is one truth", async () => {
  const tables = world();
  await handoffContract(db(tables), T, "k1", { email: "rep@club.com" });
  const list = tables.proposals[0].content.fulfillment_tasks as LegacyTask[];
  assert.equal(list.length, tables.obligations.length);
  assert.deepEqual(new Set(list.map((t) => t.id)), new Set(tables.obligations.map((o) => o.id)));
  assert.ok(list.every((t) => t.status === "pending"));
});

test("delivery is recorded in order, proof is required, and nobody accepts their own work", async () => {
  const tables = world();
  const sb = db(tables);
  await handoffContract(sb, T, "k1", { email: "rep@club.com" });
  const id = tables.obligations.find((o) => o.source_key === "allocation:a1").id;

  assert.match(((await recordEvent(sb, T, id, { action: "accept" }, "a@club.com")) as any).error, /cannot be accepted/);
  assert.equal(((await recordEvent(sb, T, id, { action: "deliver" }, "")) as any).status, 403);
  assert.ok((await recordEvent(sb, T, id, { action: "deliver" }, "ana@club.com")).ok);
  const noProof = await recordEvent(sb, T, id, { action: "evidence", evidenceKind: "link", evidenceRef: "not a link" }, "ana@club.com");
  assert.equal(!noProof.ok && noProof.status, 400);
  assert.match(((await recordEvent(sb, T, id, { action: "accept" }, "bia@club.com")) as any).error, /cannot be accepted/, "delivery alone cannot be accepted");
  assert.ok((await recordEvent(sb, T, id, { action: "evidence", evidenceKind: "link", evidenceRef: "https://club.com/proof/led" }, "ana@club.com")).ok);
  const self = await recordEvent(sb, T, id, { action: "accept" }, "ana@club.com");
  assert.ok(!self.ok && self.status === 409 && /different person/.test(self.error));
  assert.ok((await recordEvent(sb, T, id, { action: "accept" }, "bia@club.com")).ok);
  const listed = await listObligations(sb, T, { status: "accepted" });
  assert.ok(listed.ok && listed.value.length === 1 && listed.value[0].proof === "attached");
  const list = tables.proposals[0].content.fulfillment_tasks as LegacyTask[];
  assert.equal(list.find((t) => t.id === id)!.status, "done", "the checklist follows");
});

test("reassigning an obligation changes who owns it and nothing about its dates", async () => {
  const tables = world();
  const sb = db(tables);
  await handoffContract(sb, T, "k1", { email: "rep@club.com" });
  const o = tables.obligations[0];
  const due = o.due_date;
  assert.equal(((await updateObligation(sb, T, o.id, { owner_email: "nope" })) as any).status, 400);
  assert.ok((await updateObligation(sb, T, o.id, { owner_email: "New.Owner@club.com" })).ok);
  assert.deepEqual([o.owner_email, o.owner_basis, o.due_date], ["new.owner@club.com", "assigned", due]);
});

test("a project finishes on proof, not on a claim: obligations without proof count as open", async () => {
  const tables = world();
  const sb = db(tables);
  assert.equal(await contractObligationFacts(sb, T, "k1"), null, "no obligations: fall back to the old checklist");
  await handoffContract(sb, T, "k1", { email: "rep@club.com" });
  const total = tables.obligations.length;
  assert.deepEqual(await contractObligationFacts(sb, T, "k1"), { total, unproven: total });
  const id = tables.obligations[0].id;
  await recordEvent(sb, T, id, { action: "deliver" }, "ana@club.com");
  assert.equal((await contractObligationFacts(sb, T, "k1"))!.unproven, total, "claimed delivery is not proof");
  await recordEvent(sb, T, id, { action: "evidence", evidenceKind: "statement", evidenceRef: "Confirmed in writing by the sponsor's brand team on 3 Nov" }, "ana@club.com");
  assert.equal((await contractObligationFacts(sb, T, "k1"))!.unproven, total - 1);
  await recordEvent(sb, T, tables.obligations[1].id, { action: "waive", reason: "Sponsor asked to drop it" }, "ana@club.com");
  assert.equal((await contractObligationFacts(sb, T, "k1"))!.unproven, total - 2, "a recorded waiver settles it");
});
