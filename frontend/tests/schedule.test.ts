import assert from "node:assert/strict";
import test from "node:test";
import {
  DELIVERABLES_WAIT_ON, downstreamOf, effectiveDate, impactOfObligationMove, impactOfProjectMove, isIsoDate, plannedDependencies, predecessorsOf, unresolvedAfterCascade,
  validateMove, wouldCycle, type Edge, type Node,
} from "../lib/schedule/model";
import { handoffContract, listObligations, recordEvent } from "../lib/obligations/store";
import { addDependency, listDateChanges, moveObligation, moveProjectDate, previewObligationMove, previewProjectMove, removeDependency } from "../lib/schedule/store";
import { getProject } from "../lib/projects/store";
import { db, type Tables } from "./helpers/fake-db";

// ── the graph ───────────────────────────────────────────────────────────────

const node = (id: string, due: string, owner = "o@club.com", finished = false): Node => ({ id, title: id.toUpperCase(), owner_email: owner, due, finished });
// a -> b -> c, and a -> d   (b waits on a, c waits on b, d waits on a)
const edges: Edge[] = [{ obligation_id: "b", predecessor_id: "a" }, { obligation_id: "c", predecessor_id: "b" }, { obligation_id: "d", predecessor_id: "a" }];

test("everything that waits on a piece of work, directly or through others, is found nearest first", () => {
  assert.deepEqual(downstreamOf(edges, "a").map((d) => [d.id, d.depth]), [["b", 1], ["d", 1], ["c", 2]]);
  assert.deepEqual(downstreamOf(edges, "c"), []);
  assert.deepEqual(predecessorsOf(edges, "c"), ["b"]);
});

test("a dependency that would make work wait on itself is recognised", () => {
  assert.ok(wouldCycle(edges, "a", "c"), "a would wait on c, which waits (through b) on a");
  assert.ok(wouldCycle(edges, "a", "a"));
  assert.ok(!wouldCycle(edges, "d", "c"), "d waiting on c is fine");
  assert.ok(wouldCycle([...edges, { obligation_id: "a", predecessor_id: "z" }], "z", "c"), "a longer loop");
});

test("the standard order of onboarding work, and every sold item waits on the season calendar", () => {
  const keys = ["standard:signed-contract-and-invoice", "standard:billing-schedule", "standard:kickoff-meeting", "standard:season-activation-calendar", "allocation:a1", "deliverable:x"];
  const planned = plannedDependencies(keys);
  assert.equal(planned.length, 3 + 2);
  assert.ok(planned.some((p) => p.successor === "standard:kickoff-meeting" && p.predecessor === "standard:signed-contract-and-invoice"));
  assert.ok(planned.filter((p) => p.predecessor === DELIVERABLES_WAIT_ON).length === 2);
  assert.deepEqual(plannedDependencies(["allocation:a1"]), [], "no steps to wait on, so nothing is invented");
});

// ── the impact of a move ────────────────────────────────────────────────────

const ctx = (nodes: Node[], over: any = {}) => ({ nodes, edges, contractEnd: "2027-12-31", projectEnd: "2027-12-31", ...over });

test("moving work later shows what waits on it, who owns it, and which of that would now be due too early", () => {
  const nodes = [node("a", "2026-11-10", "ana@club.com"), node("b", "2026-11-20", "bia@club.com"), node("c", "2027-03-01", "cid@club.com"), node("d", "2026-12-15", "dan@club.com")];
  const i = impactOfObligationMove(ctx(nodes), "a", "2026-12-01")!;
  assert.equal(i.subject.direction, "later");
  assert.deepEqual(i.downstream.map((d) => [d.id, d.becomes_late, d.suggested_due]), [["b", true, "2026-12-01"], ["d", false, null], ["c", false, null]]);
  assert.equal(i.conflicts.length, 1);
  assert.equal(i.conflicts[0].kind, "successor_before_this");
  assert.match(i.conflicts[0].message, /B.*bia@club.com.*2026-11-20.*2026-12-01/);
  assert.deepEqual(i.owners, ["ana@club.com", "bia@club.com", "cid@club.com", "dan@club.com"]);
  assert.equal(i.needs_acknowledgement, true);
  assert.equal(i.resolved_by_cascade, 1);
  assert.deepEqual(unresolvedAfterCascade(i), [], "a cascade clears it");
});

test("a move that leaves everything in order needs no acknowledgement", () => {
  const nodes = [node("a", "2026-11-10"), node("b", "2026-11-20"), node("c", "2027-03-01"), node("d", "2026-12-15")];
  const i = impactOfObligationMove(ctx(nodes), "a", "2026-11-12")!;
  assert.deepEqual([i.conflicts.length, i.needs_acknowledgement], [0, false]);
  assert.equal(i.downstream.length, 3, "still shown, because the owners should know");
});

test("moving work earlier than the work it waits on is a conflict a cascade cannot clear", () => {
  const nodes = [node("a", "2026-11-10", "ana@club.com"), node("b", "2026-11-20"), node("c", "2027-03-01"), node("d", "2026-12-15")];
  const i = impactOfObligationMove(ctx(nodes), "b", "2026-11-01")!;
  assert.equal(i.subject.direction, "earlier");
  assert.deepEqual(i.conflicts.map((c) => c.kind), ["before_predecessor"]);
  assert.match(i.conflicts[0].message, /before "A" \(ana@club.com\)/);
  assert.equal(unresolvedAfterCascade(i).length, 1);
});

test("finished work is not dragged along, and its owner is not told to act", () => {
  const nodes = [node("a", "2026-11-10"), node("b", "2026-11-20", "bia@club.com", true), node("c", "2027-03-01", "cid@club.com"), node("d", "2026-12-15", "dan@club.com")];
  const i = impactOfObligationMove(ctx(nodes), "a", "2027-04-01")!;
  assert.equal(i.downstream.find((d) => d.id === "b")!.becomes_late, false);
  assert.ok(!i.owners.includes("bia@club.com"));
  assert.deepEqual(i.downstream.filter((d) => d.becomes_late).map((d) => d.id).sort(), ["c", "d"]);
});

test("a date past the contract or the delivery period is flagged", () => {
  const nodes = [node("a", "2026-11-10"), node("b", "2026-11-20"), node("c", "2027-03-01"), node("d", "2026-12-15")];
  const i = impactOfObligationMove(ctx(nodes, { contractEnd: "2027-06-30", projectEnd: "2027-05-31" }), "d", "2027-08-01")!;
  assert.deepEqual(i.conflicts.map((c) => c.kind).sort(), ["after_contract_end", "after_project_end"]);
  assert.equal(impactOfObligationMove(ctx(nodes), "zzz", "2027-01-01"), null);
});

test("pulling a delivery period's end earlier names the unfinished work left outside it", () => {
  const work = [node("a", "2026-11-10", "ana@club.com"), node("b", "2027-09-01", "bia@club.com"), node("c", "2027-10-01", "cid@club.com", true)];
  const i = impactOfProjectMove({ type: "delivery", field: "period_end", current: "2027-10-31", newValue: "2027-06-30", periodStart: "2026-11-01", periodEnd: "2027-10-31", contractEnd: "2027-10-31", work, owner_email: "lead@club.com" });
  assert.deepEqual(i.affected.map((a) => a.id), ["b"], "finished work and work still inside are left out");
  assert.deepEqual(i.owners, ["bia@club.com", "lead@club.com"]);
  assert.equal(i.needs_acknowledgement, true);
  const later = impactOfProjectMove({ type: "delivery", field: "period_end", current: "2027-10-31", newValue: "2028-01-31", periodStart: "2026-11-01", periodEnd: "2027-10-31", contractEnd: "2027-10-31", work, owner_email: "lead@club.com" });
  assert.deepEqual(later.conflicts.map((c) => c.kind), ["after_contract_end"]);
  const sales = impactOfProjectMove({ type: "commercial", field: "target_date", current: "2026-12-01", newValue: "2027-01-15", periodStart: null, periodEnd: null, contractEnd: null, work: [], owner_email: "rep@club.com" });
  assert.deepEqual([sales.affected.length, sales.needs_acknowledgement], [0, false]);
});

test("a move needs a real, different date and a reason", () => {
  assert.deepEqual(validateMove({ current: "2026-11-01", newValue: "2026-11-09", reason: "Match rescheduled by the league" }), []);
  assert.match(validateMove({ current: "2026-11-01", newValue: "2026-11-01", reason: "x long enough" }).join(), /already 2026-11-01/);
  assert.match(validateMove({ current: "2026-11-01", newValue: "soon", reason: "x long enough" }).join(), /YYYY-MM-DD/);
  assert.match(validateMove({ current: "2026-11-01", newValue: "2026-02-30", reason: "x long enough" }).join(), /real date/);
  assert.match(validateMove({ current: "2026-11-01", newValue: "2026-11-09", reason: "no" }).join(), /reason/);
  assert.ok(isIsoDate("2028-02-29") && !isIsoDate("2027-02-29"));
});

test("the date in force is the original until it is moved, then the newest move", () => {
  assert.equal(effectiveDate("2026-11-01", []), "2026-11-01");
  const a = { field: "due_date", old_value: "2026-11-01", new_value: "2026-11-09", created_at: "2026-10-01T10:00:00Z" };
  const b = { field: "due_date", old_value: "2026-11-09", new_value: "2026-11-20", created_at: "2026-10-05T10:00:00Z" };
  assert.equal(effectiveDate("2026-11-01", [a]), "2026-11-09");
  assert.equal(effectiveDate("2026-11-01", [a, b]), "2026-11-20");
  assert.equal(effectiveDate("2026-11-01", [b, a]), "2026-11-20", "the later one wins whatever the order given");
});

// ── the store, with real handoffs on an in-memory stand-in ──────────────────

const T = "t";
const alloc = (id: string, name: string, quantity = 1) => ({ allocation_id: id, inventory_name: name, quantity, unit: "per_season", contract_id: "k1", tenant_id: T });
const world = (over: Tables = {}): Tables => ({
  contracts: [{ id: "k1", tenant_id: T, title: "Acme 2027", company_id: "co1", status: "active", start_date: "2026-11-01", end_date: "2027-10-31", proposal_id: "pr1", opportunity_id: null }],
  companies: [{ id: "co1", tenant_id: T, company_name: "Acme" }], proposals: [{ id: "pr1", tenant_id: T, opportunity_id: null, content: {} }],
  contract_allocations: [alloc("a1", "LED"), alloc("a2", "Banner", 2)], opportunities: [], platform_users: [],
  obligations: [], obligation_events: [], obligation_dependencies: [], date_changes: [], projects: [], project_events: [], ...over,
});
const byKey = (t: Tables, k: string) => t.obligations.find((o) => o.source_key === k)!;
const KICKOFF = "standard:kickoff-meeting", CALENDAR = "standard:season-activation-calendar", SIGNED = "standard:signed-contract-and-invoice";

async function setup() {
  const tables = world();
  const sb = db(tables);
  const r = await handoffContract(sb, T, "k1", { email: "lead@club.com" });
  assert.ok(r.ok);
  return { tables, sb, report: r.ok ? r.value : null! };
}

test("the handoff sets up the standard order of work once, and a rerun adds nothing", async () => {
  const { tables, sb, report } = await setup();
  assert.equal(report.dependencies_created, 3 + 2);
  assert.equal(tables.obligation_dependencies.length, 5);
  assert.ok(tables.obligation_dependencies.every((d) => d.basis === "standard" && d.contract_id === "k1"));
  const again = await handoffContract(sb, T, "k1", { email: "lead@club.com" });
  assert.ok(again.ok && again.value.dependencies_created === 0);
  assert.equal(tables.obligation_dependencies.length, 5);
});

test("a preview shows the work behind a slipping kickoff and its owners, and changes nothing", async () => {
  const { tables, sb } = await setup();
  const kick = byKey(tables, KICKOFF);
  const p = await previewObligationMove(sb, T, kick.id, "2026-11-30");
  assert.ok(p.ok);
  if (!p.ok) return;
  assert.deepEqual(p.value.downstream.map((d) => d.title).slice(0, 1), ["Compartilhar calendário de ativações da temporada"]);
  assert.equal(p.value.downstream.length, 3, "the calendar and the two sold items");
  assert.deepEqual(p.value.waiting_on.map((w) => w.id), [byKey(tables, SIGNED).id]);
  assert.deepEqual(p.value.owners, ["lead@club.com"]);
  assert.equal(p.value.conflicts.length, 1, "the calendar (due 11-15) would fall due before the new kickoff date");
  assert.equal(tables.date_changes.length, 0, "a preview records nothing");
});

test("a move that would leave conflicts is refused, and shows them", async () => {
  const { tables, sb } = await setup();
  const r = await moveObligation(sb, T, byKey(tables, KICKOFF).id, { newDue: "2026-11-30", reason: "Sponsor cannot meet before the 30th" }, "ana@club.com");
  assert.ok(!r.ok && r.status === 409);
  if (r.ok) return;
  assert.match(r.error, /1 conflict/);
  assert.match(r.error, /cascade the later work/);
  assert.equal(r.conflicts?.length, 1);
  assert.equal(tables.date_changes.length, 0, "nothing was recorded");
});

test("acknowledging the conflict records the move with what it affected; the original date is kept", async () => {
  const { tables, sb } = await setup();
  const kick = byKey(tables, KICKOFF);
  const r = await moveObligation(sb, T, kick.id, { newDue: "2026-11-30", reason: "Sponsor cannot meet before the 30th", acknowledge: true }, "ana@club.com");
  assert.ok(r.ok && r.value.cascaded === 0);
  assert.equal(tables.date_changes.length, 1);
  const row = tables.date_changes[0];
  assert.deepEqual([row.old_value, row.new_value, row.changed_by, row.subject_kind, row.field], ["2026-11-15", "2026-11-30", "ana@club.com", "obligation", "due_date"]);
  assert.equal(row.impact.conflicts.length, 1);
  assert.equal(row.impact.decision.acknowledged_conflicts.length, 1, "the unresolved conflict is on the record");
  assert.equal(kick.due_date, "2026-11-15", "the stored original is untouched");
  const list = await listObligations(sb, T, { contractId: "k1" });
  assert.ok(list.ok);
  if (!list.ok) return;
  const k = list.value.find((o) => o.id === kick.id)!;
  assert.deepEqual([k.due_date, k.original_due_date, k.moved], ["2026-11-30", "2026-11-15", true]);
});

test("cascading moves the later work along, each move recorded and linked to the first", async () => {
  const { tables, sb } = await setup();
  const kick = byKey(tables, KICKOFF);
  const calendar = byKey(tables, CALENDAR);
  const r = await moveObligation(sb, T, kick.id, { newDue: "2026-11-30", reason: "Sponsor cannot meet before the 30th", cascade: true }, "ana@club.com");
  assert.ok(r.ok && r.value.cascaded === 1);
  assert.equal(tables.date_changes.length, 2);
  const [root, child] = tables.date_changes;
  assert.equal(child.parent_change_id, root.id);
  assert.equal(child.subject_id, calendar.id);
  assert.deepEqual(child.impact.owners, [calendar.owner_email], "a cascaded move names the owner it affected");
  assert.match(child.reason, /Moved with "Agendar reunião de kickoff/);
  const list = await listObligations(sb, T, { contractId: "k1" });
  assert.ok(list.ok && list.value.find((o) => o.id === calendar.id)!.due_date === "2026-11-30");
  // the sold items were due at the contract end, so they are untouched
  assert.ok(list.ok && list.value.filter((o) => o.kind === "deliverable").every((o) => !o.moved));
  const history = await listDateChanges(sb, T, { companyId: "co1" });
  assert.ok(history.ok && history.value.length === 2 && history.value.filter((h) => h.automatic).length === 1);
});

test("a second move starts from the date in force, and a past-the-end or wrong-order date needs acknowledging", async () => {
  const { tables, sb } = await setup();
  const kick = byKey(tables, KICKOFF);
  await moveObligation(sb, T, kick.id, { newDue: "2026-11-30", reason: "Sponsor cannot meet before the 30th", cascade: true }, "ana@club.com");
  const same = await moveObligation(sb, T, kick.id, { newDue: "2026-11-30", reason: "again", acknowledge: true }, "ana@club.com");
  assert.ok(!same.ok && same.status === 400 && /already 2026-11-30/.test(same.error));
  const beyond = await moveObligation(sb, T, byKey(tables, "allocation:a1").id, { newDue: "2027-12-01", reason: "Season extended into December" }, "ana@club.com");
  assert.ok(!beyond.ok && beyond.status === 409 && /after the contract ends/.test(beyond.error));
  const before = await moveObligation(sb, T, byKey(tables, CALENDAR).id, { newDue: "2026-11-02", reason: "Sponsor wants it sooner" }, "ana@club.com");
  assert.ok(!before.ok && /before "Agendar reunião/.test(before.error) || (!before.ok && /due before/.test(before.error)));
  const noReason = await moveObligation(sb, T, kick.id, { newDue: "2026-12-05", reason: "no", acknowledge: true }, "ana@club.com");
  assert.ok(!noReason.ok && noReason.status === 400);
  assert.equal(((await moveObligation(sb, T, kick.id, { newDue: "2026-12-05", reason: "valid reason", acknowledge: true }, "")) as any).status, 403);
});

test("finished work cannot be moved: reopen it first", async () => {
  const { tables, sb } = await setup();
  const o = byKey(tables, SIGNED);
  await recordEvent(sb, T, o.id, { action: "deliver" }, "ana@club.com");
  await recordEvent(sb, T, o.id, { action: "evidence", evidenceKind: "link", evidenceRef: "https://club.com/proof" }, "ana@club.com");
  const r = await moveObligation(sb, T, o.id, { newDue: "2026-11-20", reason: "valid reason", acknowledge: true }, "ana@club.com");
  assert.ok(!r.ok && r.status === 409 && /evidenced.*Reopen it first/.test(r.error));
});

test("dependencies: loops, other contracts and repeats are refused; ending one needs a reason and keeps it on record", async () => {
  const { tables, sb } = await setup();
  const kick = byKey(tables, KICKOFF), calendar = byKey(tables, CALENDAR), signed = byKey(tables, SIGNED), billing = byKey(tables, "standard:billing-schedule");
  const loop = await addDependency(sb, T, signed.id, calendar.id, "ana@club.com");
  assert.ok(!loop.ok && loop.status === 409 && /wait on itself/.test(loop.error));
  assert.equal(((await addDependency(sb, T, kick.id, kick.id, "ana@club.com")) as any).status, 400);
  assert.match(((await addDependency(sb, T, kick.id, signed.id, "ana@club.com")) as any).error, /already waits/);
  tables.obligations.push({ ...billing, id: "elsewhere", contract_id: "k2", source_key: "standard:x" });
  assert.match(((await addDependency(sb, T, kick.id, "elsewhere", "ana@club.com")) as any).error, /same contract/);
  const ok = await addDependency(sb, T, billing.id, kick.id, "ana@club.com");
  assert.ok(ok.ok);
  if (ok.ok) assert.ok(ok.value.warnings[0].includes("is due 2026-11-15, after"), "billing (due 11-08) now waits on a later kickoff");
  const dep = tables.obligation_dependencies.at(-1)!;
  assert.equal(dep.basis, "manual");
  assert.equal(((await removeDependency(sb, T, billing.id, dep.id, "no", "ana@club.com")) as any).status, 400);
  assert.ok((await removeDependency(sb, T, billing.id, dep.id, "Billing no longer waits on kickoff", "ana@club.com")).ok);
  assert.equal(tables.obligation_dependencies.find((d) => d.id === dep.id)!.removed_by, "ana@club.com");
  assert.match(((await removeDependency(sb, T, billing.id, dep.id, "once more please", "ana@club.com")) as any).error, /already been ended/);
  const p = await previewObligationMove(sb, T, kick.id, "2026-11-20");
  assert.ok(p.ok && !p.value.downstream.some((d) => d.id === billing.id), "an ended dependency no longer carries impact");
});

test("a delivery project's end date moves with a reason, naming the unfinished work left outside it", async () => {
  const { tables, sb, report } = await setup();
  const proj = report.project_id!;
  const preview = await previewProjectMove(sb, T, proj, "period_end", "2027-06-30");
  assert.ok(preview.ok);
  if (!preview.ok) return;
  assert.equal(preview.value.affected.length, 2, "the two sold items are due at the end of the contract");
  assert.deepEqual(preview.value.owners, ["lead@club.com"]);
  const refused = await moveProjectDate(sb, T, proj, { field: "period_end", newValue: "2027-06-30", reason: "Season ends early for this sponsor" }, "ana@club.com");
  assert.ok(!refused.ok && refused.status === 409 && /2 conflicts/.test(refused.error));
  const moved = await moveProjectDate(sb, T, proj, { field: "period_end", newValue: "2027-06-30", reason: "Season ends early for this sponsor", acknowledge: true }, "ana@club.com");
  assert.ok(moved.ok);
  const view = await getProject(sb, T, proj);
  assert.ok(view.ok && view.value.period_end === "2027-06-30" && view.value.dates_moved && view.value.date_history.length === 1);
  assert.equal(tables.projects[0].period_end, "2027-10-31", "the original is untouched");
  assert.ok((await moveProjectDate(sb, T, proj, { field: "target_date", newValue: "2027-01-01", reason: "valid reason" }, "ana@club.com") as any).error.includes("movable dates are: period_start, period_end"));
  assert.match(((await moveProjectDate(sb, T, proj, { field: "period_end", newValue: "2026-10-01", reason: "valid reason", acknowledge: true }, "ana@club.com")) as any).error, /before it starts/);
  assert.match(((await moveProjectDate(sb, T, proj, { field: "period_start", newValue: "2027-08-01", reason: "valid reason", acknowledge: true }, "ana@club.com")) as any).error, /after it ends/);
  tables.project_events.push({ project_id: proj, event_type: "cancelled", created_at: "2099-01-01" });
  assert.match(((await moveProjectDate(sb, T, proj, { field: "period_end", newValue: "2027-07-30", reason: "valid reason", acknowledge: true }, "ana@club.com")) as any).error, /cancelled project's dates cannot be moved/);
});
