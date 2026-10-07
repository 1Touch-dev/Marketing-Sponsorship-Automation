import assert from "node:assert/strict";
import test from "node:test";
import { DELIVERY_STATUSES, STATUS_DEFINITIONS, contractDeliveryStatus, deriveCompanyStatus, statusSignature, type ContractFacts, type WorkFact } from "../lib/company-status/model";
import { loadCompanyStatus, loadCompanyStatuses, refreshAll, refreshCompanyStatus, loadHistory, sinceOf } from "../lib/company-status/store";
import { db, type Tables } from "./helpers/fake-db";

const TODAY = "2026-10-07";
let n = 0;
const w = (status: WorkFact["status"], over: Partial<WorkFact> = {}): WorkFact => ({ id: `w${++n}`, contract_id: "k1", title: `Item ${n}`, owner_email: "ana@club.com", due_date: "2027-03-01", status, proof: "none", ...over });
const k = (over: Partial<ContractFacts> = {}): ContractFacts => ({ id: "k1", contract_number: "C-1", status: "active", start_date: "2026-09-01", end_date: "2027-08-31", signature: { verified: true, label: "Signed" }, ...over });
const derive = (over: any = {}) => deriveCompanyStatus({ companyId: "co1", today: TODAY, contracts: [k()], work: [], edges: [], projects: [], ...over });

test("every status has a definition, in order from nothing promised to evidence accepted", () => {
  assert.deepEqual([...DELIVERY_STATUSES], ["no_commitments", "promised", "scheduled", "delivered", "evidence_accepted"]);
  for (const s of DELIVERY_STATUSES) assert.ok(STATUS_DEFINITIONS[s].length > 20, s);
});

test("one contract's status follows its obligations: promised, scheduled, delivered, evidence accepted", () => {
  assert.equal(contractDeliveryStatus([]), "promised");
  assert.equal(contractDeliveryStatus([w("open"), w("accepted")]), "scheduled");
  assert.equal(contractDeliveryStatus([w("delivered"), w("evidenced"), w("accepted")]), "delivered", "delivered, but not all of it accepted");
  assert.equal(contractDeliveryStatus([w("accepted"), w("accepted"), w("waived")]), "evidence_accepted", "waived items are set aside");
  assert.equal(contractDeliveryStatus([w("evidenced"), w("accepted")]), "delivered", "proof not yet accepted is not accepted evidence");
  assert.equal(contractDeliveryStatus([w("waived")]), "delivered", "nothing left to deliver");
});

test("a company takes the least advanced status of its contracts in force; drafts and lapsed contracts do not count", () => {
  assert.equal(derive({ contracts: [] }).delivery_status, "no_commitments");
  assert.equal(derive({ contracts: [k({ status: "draft" })], work: [w("open")] }).delivery_status, "no_commitments", "a draft promises nothing");
  assert.equal(derive({ contracts: [k({ status: "terminated" })] }).delivery_status, "no_commitments");
  const two = derive({ contracts: [k(), k({ id: "k2", contract_number: "C-2" })], work: [w("accepted"), w("accepted", { contract_id: "k2" }), w("open", { contract_id: "k2" })] });
  assert.equal(two.delivery_status, "scheduled", "the weaker contract decides");
  assert.deepEqual(two.contracts.map((c) => c.delivery_status), ["evidence_accepted", "scheduled"]);
  const finished = derive({ contracts: [k({ id: "old", status: "expired", end_date: "2026-01-01" }), k({ id: "new" })], work: [w("accepted", { contract_id: "old" })] });
  assert.equal(finished.delivery_status, "promised", "the old finished contract does not hide the new one's lack of scheduled work");
  assert.equal(derive({ contracts: [k({ status: "draft" }), k({ id: "k9" })], work: [w("open", { contract_id: "k9" })] }).contracts.find((c) => c.contract_id === "k1")!.delivery_status, "not_in_force");
});

test("at risk is never a bare flag: each risk is named, ranked, and says what fixes it", () => {
  const clean = derive({ work: [w("open")] });
  assert.deepEqual([clean.at_risk, clean.risks], [false, []]);
  const r = derive({
    contracts: [k({ start_date: "2025-09-01", end_date: "2026-09-30" })],
    work: [w("open", { due_date: "2026-09-01", title: "Late LED" }), w("delivered", { due_date: "2026-09-02", title: "Claimed kit" }), w("accepted")],
  });
  assert.equal(r.at_risk, true);
  const kinds = r.risks.map((x) => x.kind);
  for (const kind of ["overdue_work", "proof_missing", "ended_unproven"]) assert.ok(kinds.includes(kind as never), kind);
  assert.ok(r.risks.every((x) => x.fix.length > 10 && x.message.startsWith("Contract C-1:")));
  assert.match(r.risks.find((x) => x.kind === "overdue_work")!.message, /Late LED.*ana@club.com.*2026-09-01/);
  assert.equal(r.risks[0].severity, "high", "ranked, high first");
});

test("each remaining risk is recognised on its own", () => {
  const only = (over: any) => derive(over).risks.map((x) => x.kind);
  assert.deepEqual(only({ contracts: [k({ end_date: "2026-11-15" })], work: [w("open"), w("open"), w("open"), w("accepted")] }), ["renewal_unproven"], "ends within 60 days with 25% proven");
  assert.deepEqual(only({ contracts: [k({ end_date: "2026-11-15" })], work: [w("accepted"), w("accepted"), w("open")] }), [], "enough proven for a renewal to stand on");
  assert.deepEqual(only({ work: [] }), ["not_scheduled"], "started over 14 days ago and never handed off");
  assert.deepEqual(only({ contracts: [k({ start_date: "2026-10-01" })], work: [] }), [], "just started: promised is not a risk yet");
  const a = w("open", { due_date: "2026-11-01" }), b = w("open", { due_date: "2026-12-01" });
  assert.deepEqual(only({ work: [a, b], edges: [{ obligation_id: a.id, predecessor_id: b.id }] }), ["schedule_conflict"], "due before the work it waits on");
  assert.deepEqual(only({ work: [a, b], edges: [{ obligation_id: b.id, predecessor_id: a.id }] }), [], "in order");
  assert.deepEqual(only({ work: [w("open")], projects: [{ contract_id: "k1", project_type: "delivery", status: "on_hold" }] }), ["project_on_hold"]);
  assert.deepEqual(only({ work: [w("open")], contracts: [k({ signature: { verified: false, label: "Signature claimed" } })] }), ["signature_unproven"]);
  assert.equal(derive({ work: [w("open")], contracts: [k({ signature: { verified: false, label: "x" } })] }).risks[0].severity, "low");
});

test("finished work never counts as a risk, and a draft contract is never at risk", () => {
  assert.equal(derive({ contracts: [k({ status: "draft", start_date: "2020-01-01" })] }).at_risk, false);
  const done = derive({ contracts: [k({ end_date: "2026-09-30" })], work: [w("accepted", { due_date: "2026-08-01" }), w("waived", { due_date: "2026-08-01" }), w("evidenced", { due_date: "2026-08-01", proof: "attached" })] });
  assert.equal(done.at_risk, false);
});

test("the counts, next due date and who has open work are reported", () => {
  const r = derive({ work: [w("open", { due_date: "2027-05-01", owner_email: "z@club.com", title: "Later" }), w("open", { due_date: "2027-02-01", owner_email: "a@club.com", title: "Sooner" }), w("accepted"), w("waived")] });
  assert.deepEqual([r.counts.obligations, r.counts.accepted, r.counts.waived, r.counts.open, r.counts.contracts_in_force], [4, 1, 1, 2, 1]);
  assert.deepEqual(r.next_due, { title: "Sooner", due_date: "2027-02-01", owner_email: "a@club.com" });
  assert.deepEqual(r.owners_with_open_work, ["a@club.com", "z@club.com"]);
  assert.equal(derive({ contracts: [] }).next_due, null);
});

test("the log signature changes with the status or the set of risks, not with counts", () => {
  const a = derive({ work: [w("open", { due_date: "2026-09-01" })] });
  const b = derive({ work: [w("open", { due_date: "2026-09-01" }), w("open", { due_date: "2026-09-02" })] });
  assert.equal(statusSignature(a), statusSignature(b), "two overdue instead of one is the same status");
  assert.notEqual(statusSignature(a), statusSignature(derive({ work: [w("open")] })));
  assert.notEqual(statusSignature(a), statusSignature(derive({ work: [w("accepted")] })));
});

// ── the store, on an in-memory stand-in ─────────────────────────────────────

const T = "t";
const ob = (id: string, over: any = {}) => ({ id, tenant_id: T, contract_id: "k1", company_id: "co1", title: `Item ${id}`, kind: "deliverable", quantity: 1, unit: "x", allocation_id: null, source_key: id, due_date: "2027-03-01", owner_email: "ana@club.com", created_at: "2026-09-01", ...over });
const world = (over: Tables = {}): Tables => ({
  companies: [{ id: "co1", tenant_id: T, company_name: "Acme" }, { id: "co2", tenant_id: T, company_name: "Quiet" }],
  contracts: [{ id: "k1", tenant_id: T, company_id: "co1", contract_number: "C-1", status: "active", start_date: "2026-09-01", end_date: "2027-08-31" }],
  obligations: [ob("a"), ob("b")], obligation_events: [], obligation_dependencies: [], date_changes: [], projects: [], project_events: [], company_status_log: [], ...over,
});

test("the status is derived from the real tables, for one company or all of them", async () => {
  const sb = db(world());
  assert.equal(((await loadCompanyStatus(sb, T, "nope")) as any).status, 404);
  const one = await loadCompanyStatus(sb, T, "co1");
  assert.ok(one.ok && one.value.delivery_status === "scheduled" && one.value.counts.obligations === 2);
  const quiet = await loadCompanyStatus(sb, T, "co2");
  assert.ok(quiet.ok && quiet.value.delivery_status === "no_commitments");
  const all = await loadCompanyStatuses(sb, T);
  assert.ok(all.ok && all.value.length === 1 && all.value[0].company_id === "co1", "a company with no contract is not listed");
});

test("before obligations are set up, a contract in force reads as promised instead of failing", async () => {
  const r = await loadCompanyStatus(db(world(), { missing: ["obligations"] }), T, "co1");
  assert.ok(r.ok && r.value.delivery_status === "promised");
});

test("a change is logged once, a repeat is not, and a move or a new risk is logged again", async () => {
  const tables = world();
  const sb = db(tables);
  assert.deepEqual(await refreshCompanyStatus(sb, T, "co2", "x"), { logged: false, changed: false }, "nothing promised, nothing to log");
  const first = await refreshCompanyStatus(sb, T, "co1", "contract.created");
  assert.deepEqual([first.logged, first.changed], [true, true]);
  assert.equal(tables.company_status_log.length, 1);
  assert.deepEqual([tables.company_status_log[0].delivery_status, tables.company_status_log[0].source], ["scheduled", "contract.created"]);
  assert.equal((await refreshCompanyStatus(sb, T, "co1", "again")).logged, false, "unchanged");
  assert.equal(tables.company_status_log.length, 1);
  // everything delivered and accepted: the status moves
  tables.obligation_events.push({ obligation_id: "a", event_type: "accepted", created_at: "2026-10-01" }, { obligation_id: "b", event_type: "accepted", created_at: "2026-10-01" });
  assert.equal((await refreshCompanyStatus(sb, T, "co1", "obligation.accept")).logged, true);
  assert.equal(tables.company_status_log.at(-1).delivery_status, "evidence_accepted");
  // a due date passes on new open work: the same status, but now at risk
  tables.obligations.push(ob("c", { due_date: "2026-09-15" }));
  assert.equal((await refreshCompanyStatus(sb, T, "co1", "refresh")).logged, true);
  const last = tables.company_status_log.at(-1);
  // with no signature evidence in these tables the contract also carries the low-severity signature risk
  assert.deepEqual([last.delivery_status, last.at_risk, last.risk_reasons.map((r: any) => r.kind)], ["scheduled", true, ["overdue_work", "signature_unproven"]]);
  assert.equal(tables.company_status_log.length, 3);
});

test("a refresh never throws and says why when it could not log", async () => {
  const r = await refreshCompanyStatus(db(world(), { missing: ["company_status_log"] }), T, "co1", "x");
  assert.deepEqual([r.logged, r.changed, r.reason], [false, false, "not set up"]);
  assert.equal((await refreshCompanyStatus(db(world()), T, null, "x")).reason, "no company");
  assert.equal((await refreshCompanyStatus(db(world()), T, "ghost", "x")).logged, false);
});

test("since when: the first row of the unbroken run that matches the current status", async () => {
  const mk = (status: string, risk: boolean, at: string) => ({ id: at, delivery_status: status, at_risk: risk, risk_reasons: risk ? [{ kind: "overdue_work", severity: "high", contract_id: "k1", message: "m" }] : [], counts: {}, source: "s", created_at: at });
  const newestFirst = [mk("scheduled", true, "2026-10-05"), mk("scheduled", true, "2026-10-03"), mk("scheduled", false, "2026-09-20"), mk("promised", false, "2026-09-01")] as any;
  assert.equal(sinceOf(newestFirst), "2026-10-03");
  assert.equal(sinceOf([]), null);
  const tables = world({ company_status_log: [] });
  tables.company_status_log.push(...newestFirst.map((r: any) => ({ ...r, tenant_id: T, company_id: "co1" })));
  const h = await loadHistory(db(tables), T, "co1");
  assert.ok(h.ok && h.value.length === 4);
});

test("a bulk refresh checks every company with a contract and logs only what changed", async () => {
  const tables = world({ contracts: [{ id: "k1", tenant_id: T, company_id: "co1", contract_number: "C-1", status: "active", start_date: "2026-09-01", end_date: "2027-08-31" }, { id: "k2", tenant_id: T, company_id: "co2", contract_number: "C-2", status: "active", start_date: "2026-10-01", end_date: "2027-08-31" }] });
  const sb = db(tables);
  const first = await refreshAll(sb, T, "refresh:admin");
  assert.deepEqual(first.ok && first.value, { checked: 2, logged: 2 });
  assert.deepEqual(await refreshAll(sb, T, "refresh:admin").then((r) => r.ok && r.value), { checked: 2, logged: 0 });
});
