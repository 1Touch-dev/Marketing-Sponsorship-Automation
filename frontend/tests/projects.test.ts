import assert from "node:assert/strict";
import test from "node:test";
import { allowedActions, completionCheck, deriveStatus, eventFor, isTerminal, TYPE_DEFINITIONS, validateProjectInput, type ProjectInput } from "../lib/projects/model";
import { createProject, transition, updateProject } from "../lib/projects/store";

const TODAY = "2026-10-07";
const ev = (event_type: any, created_at: string) => ({ event_type, created_at });

test("a project is planned until its first event, then the newest event decides", () => {
  assert.equal(deriveStatus([]), "planned");
  assert.equal(deriveStatus([ev("started", "2026-10-01")]), "active");
  assert.equal(deriveStatus([ev("started", "2026-10-01"), ev("paused", "2026-10-02")]), "on_hold");
  assert.equal(deriveStatus([ev("paused", "2026-10-02"), ev("started", "2026-10-01"), ev("resumed", "2026-10-03")]), "active");
  assert.equal(deriveStatus([ev("started", "2026-10-01"), ev("completed", "2026-10-09")]), "completed");
  assert.equal(deriveStatus([ev("cancelled", "2026-10-01")]), "cancelled");
});

test("only the right moves are open from each status, and finished is final", () => {
  assert.deepEqual(allowedActions("planned").sort(), ["cancel", "start"]);
  assert.deepEqual(allowedActions("active").sort(), ["cancel", "complete", "pause"]);
  assert.deepEqual(allowedActions("on_hold").sort(), ["cancel", "resume"]);
  assert.deepEqual(allowedActions("completed"), []);
  assert.deepEqual(allowedActions("cancelled"), []);
  assert.equal(eventFor("planned", "complete"), null, "cannot complete what was never started");
  assert.equal(eventFor("on_hold", "complete"), null, "cannot complete while on hold");
  assert.equal(eventFor("active", "start"), null);
  assert.ok(isTerminal("completed") && isTerminal("cancelled") && !isTerminal("on_hold"));
});

test("each type spells out what it needs and what completes it", () => {
  assert.ok(TYPE_DEFINITIONS.commercial.required.some((r) => r.includes("opportunity")));
  assert.ok(TYPE_DEFINITIONS.delivery.required.some((r) => r.includes("contract")));
  assert.ok(TYPE_DEFINITIONS.commercial.completion.length >= 2 && TYPE_DEFINITIONS.delivery.completion.length >= 2);
});

const commercial: ProjectInput = { type: "commercial", company_id: "co1", owner_email: "rep@club.com", opportunity_id: "o1", objective: "Close the 2027 cash deal", target_date: "2026-12-01", next_action: "Send the rate card" };
const delivery: ProjectInput = { type: "delivery", company_id: "co1", owner_email: "ops@club.com", contract_id: "k1", period_start: "2026-11-01", period_end: "2027-10-31" };

test("a complete commercial or delivery project passes, and each lists what it lacks", () => {
  assert.deepEqual(validateProjectInput(commercial, TODAY), []);
  assert.deepEqual(validateProjectInput(delivery, TODAY), []);
  const none = validateProjectInput({ type: "commercial", company_id: "co1", owner_email: "x" }, TODAY).join(" | ");
  for (const w of ["owner", "opportunity", "objective", "next action", "target date"]) assert.match(none, new RegExp(w), w);
  const dNone = validateProjectInput({ type: "delivery", company_id: "co1", owner_email: "ops@club.com" }, TODAY).join(" | ");
  for (const w of ["signed contract", "period start", "period end"]) assert.match(dNone, new RegExp(w), w);
});

test("a type cannot carry the other type's fields", () => {
  assert.match(validateProjectInput({ ...commercial, contract_id: "k1" }, TODAY).join(), /no contract or delivery period/);
  assert.match(validateProjectInput({ ...commercial, period_end: "2027-01-01" }, TODAY).join(), /no contract or delivery period/);
  assert.match(validateProjectInput({ ...delivery, objective: "sell more" }, TODAY).join(), /no sales objective/);
  assert.match(validateProjectInput({ ...delivery, next_action: "call" }, TODAY).join(), /no sales objective/);
});

test("dates must make sense: a target in the past and a period that ends before it starts are refused", () => {
  assert.match(validateProjectInput({ ...commercial, target_date: "2026-01-01" }, TODAY).join(), /in the past/);
  assert.match(validateProjectInput({ ...commercial, target_date: "next week" }, TODAY).join(), /target date/);
  assert.match(validateProjectInput({ ...delivery, period_end: "2026-10-01" }, TODAY).join(), /cannot end before it starts/);
  assert.match(validateProjectInput({ ...delivery, period_start: "" }, TODAY).join(), /period start/);
});

test("a commercial project cannot finish while its deal is still being worked, and needs the outcome written", () => {
  const base = { type: "commercial" as const, today: TODAY, outcomeNote: "Won: they chose us for the family reach" };
  for (const s of ["draft", "open"]) assert.match(completionCheck({ ...base, opportunityStatus: s }).blockers[0], new RegExp(`still ${s}`), s);
  for (const s of ["won", "lost", "closed"]) assert.deepEqual(completionCheck({ ...base, opportunityStatus: s }), { blockers: [], inputs: [] }, s);
  assert.match(completionCheck({ ...base, opportunityStatus: "won", outcomeNote: "ok" }).inputs[0], /outcome note/);
  assert.match(completionCheck({ ...base, opportunityStatus: null }).blockers[0], /cannot be found/);
});

test("a delivery project cannot finish with open tasks, and needs a reason to finish before the period ends", () => {
  const base = { type: "delivery" as const, today: TODAY, contractStatus: "active", periodEnd: "2026-09-30", openTasks: 0 };
  assert.deepEqual(completionCheck(base), { blockers: [], inputs: [] }, "period over, nothing open");
  assert.match(completionCheck({ ...base, openTasks: 1 }).blockers[0], /1 delivery task is still open/);
  assert.match(completionCheck({ ...base, openTasks: 3 }).blockers[0], /3 delivery tasks are still open/);
  const early = completionCheck({ ...base, periodEnd: "2027-10-31" });
  assert.match(early.inputs[0], /reason for finishing early.*2027-10-31/);
  assert.deepEqual(completionCheck({ ...base, periodEnd: "2027-10-31", earlyReason: "The sponsor ended the season activation early" }), { blockers: [], inputs: [] });
  assert.match(completionCheck({ ...base, contractStatus: "terminated" }).blockers[0], /not active/);
  assert.equal(completionCheck({ ...base, periodEnd: TODAY }).inputs.length, 1, "the last day itself still counts as running");
});

// ── the store, against an in-memory stand-in ────────────────────────────────

function db(tables: Record<string, any[]>) {
  const inserted: Array<{ table: string; row: any }> = [];
  const updated: Array<{ table: string; patch: any }> = [];
  const from = (table: string) => {
    const rows = () => tables[table] ?? [];
    const c: any = {
      select: () => c, eq: () => c, in: () => c, is: () => c, order: () => c, limit: () => c,
      maybeSingle: async () => ({ data: rows()[0] ?? null, error: null }),
      single: async () => ({ data: rows()[0] ?? null, error: null }),
      then: (res: any) => res({ data: rows(), error: null }),
      insert: (row: any) => { inserted.push({ table, row }); const r = { id: `new-${inserted.length}`, ...row }; (tables[table] ??= []).push(r); const i: any = { select: () => i, single: async () => ({ data: r, error: null }), then: (res: any) => res({ error: null }) }; return i; },
      update: (patch: any) => { updated.push({ table, patch }); const u: any = { eq: () => u, then: (res: any) => res({ error: null }) }; return u; },
    };
    return c;
  };
  return { from, inserted, updated };
}

const project = (over: any = {}) => ({ id: "p1", tenant_id: "t", project_type: "delivery", title: "Delivery", description: null, company_id: "co1", opportunity_id: null, proposal_id: "pr1", contract_id: "k1", owner_email: "ops@club.com", created_by: "x", objective: null, target_date: null, next_action: null, period_start: "2026-11-01", period_end: "2027-10-31", external_system: null, external_id: null, created_at: "2026-10-01", updated_at: "2026-10-01", ...over });
const oppRow = (status: "open" | "won") => ({ id: "o1", company_id: "co1", kind: "cash", title: "Cash 2027", owner_email: null, renews_contract_id: null, created_by_kind: "human", created_by: "x", rule_name: null, pipedrive_deal_id: null, created_at: "2026-01-01", _status: status });
const contract = (over: any = {}) => ({ id: "k1", company_id: "co1", status: "active", start_date: "2026-11-01", end_date: "2027-10-31", proposal_id: "pr1", title: "Contract 2027", ...over });

test("a delivery project needs a person, a real company, and an active contract of that company", async () => {
  assert.equal((await createProject(db({}), "t", delivery, "") as any).status, 403);
  assert.equal((await createProject(db({ companies: [] }), "t", delivery, "ops@club.com") as any).status, 404);
  assert.equal((await createProject(db({ companies: [{ id: "co1", company_name: "Acme" }], contracts: [] }), "t", delivery, "ops@club.com") as any).status, 404);
  const other = await createProject(db({ companies: [{ id: "co1", company_name: "Acme" }], contracts: [contract({ company_id: "co2" })] }), "t", delivery, "ops@club.com");
  assert.equal(!other.ok && other.status, 409);
  assert.match(!other.ok ? other.error : "", /not linked to this company/);
  const draft = await createProject(db({ companies: [{ id: "co1", company_name: "Acme" }], contracts: [contract({ status: "draft" })] }), "t", delivery, "ops@club.com");
  assert.match(!draft.ok ? draft.error : "", /needs an active contract/);
});

test("a delivery project takes its period and proposal from the contract when none is given", async () => {
  const sb = db({ companies: [{ id: "co1", company_name: "Acme" }], contracts: [contract()], projects: [], project_events: [] });
  const r = await createProject(sb, "t", { type: "delivery", company_id: "co1", contract_id: "k1" }, "ops@club.com");
  assert.equal(r.ok, true);
  const row = sb.inserted.find((i) => i.table === "projects")!.row;
  assert.deepEqual([row.project_type, row.period_start, row.period_end, row.proposal_id, row.owner_email, row.created_by], ["delivery", "2026-11-01", "2027-10-31", "pr1", "ops@club.com", "ops@club.com"]);
  assert.match(row.title, /Contract 2027/);
  assert.equal(row.objective, null);
});

test("there cannot be two unfinished projects for one contract, but a finished one does not block a new one", async () => {
  const base = { companies: [{ id: "co1", company_name: "Acme" }], contracts: [contract()] };
  const busy = await createProject(db({ ...base, projects: [project()], project_events: [] }), "t", delivery, "ops@club.com");
  assert.equal(!busy.ok && busy.status, 409);
  assert.match(!busy.ok ? busy.error : "", /already an unfinished delivery project/);
  const done = await createProject(db({ ...base, projects: [project()], project_events: [{ project_id: "p1", event_type: "completed", created_at: "2026-12-01" }] }), "t", delivery, "ops@club.com");
  assert.equal(done.ok, true);
});

test("a commercial project works on a deal that is still being worked, and belongs to the same company", async () => {
  // the opportunity store derives status from proposals: an open opportunity has one under review
  const open = { companies: [{ id: "co1", company_name: "Acme" }], opportunities: [oppRow("open")], proposals: [{ id: "p", title: "t", status: "under_review", proposal_type: "sponsorship", pipedrive_deal_id: null, created_at: "x", opportunity_id: "o1" }], contracts: [], opportunity_events: [], projects: [], project_events: [] };
  const ok = await createProject(db(open), "t", commercial, "rep@club.com");
  assert.equal(ok.ok, true);
  const won = await createProject(db({ ...open, proposals: [{ id: "p", title: "t", status: "active_contract", proposal_type: "sponsorship", pipedrive_deal_id: null, created_at: "x", opportunity_id: "o1" }] }), "t", commercial, "rep@club.com");
  assert.match(!won.ok ? won.error : "", /opportunity is won/);
  const missing = await createProject(db({ ...open, opportunities: [] }), "t", commercial, "rep@club.com");
  assert.equal(!missing.ok && missing.status, 404);
  const incomplete = await createProject(db(open), "t", { ...commercial, objective: " ", next_action: null }, "rep@club.com");
  assert.equal(!incomplete.ok && incomplete.status, 400);
  assert.match(!incomplete.ok ? incomplete.error : "", /objective.*next action/);
});

const view = (over: any = {}, events: any[] = [], proposals: any[] = [{ id: "pr1", content: { fulfillment_tasks: [{ status: "done" }] } }], contracts: any[] = [contract()]) =>
  db({ projects: [project(over)], project_events: events, proposals, contracts, opportunities: [oppRow("open")], opportunity_events: [] });

test("a project is moved only along allowed paths, and cancelling or pausing needs a reason", async () => {
  const planned = view();
  assert.match((await transition(planned, "t", "p1", { action: "complete", actorEmail: "a@b.c" }) as any).error, /cannot be completed/);
  assert.equal((await transition(planned, "t", "p1", { action: "cancel", reason: "no", actorEmail: "a@b.c" }) as any).status, 400);
  assert.equal((await transition(planned, "t", "p1", { action: "start", actorEmail: "" }) as any).status, 403);
  const started = await transition(planned, "t", "p1", { action: "start", actorEmail: "a@b.c" });
  assert.equal(started.ok, true);
  assert.equal(planned.inserted.find((i) => i.table === "project_events")!.row.event_type, "started");
  const notActive = view({}, [], undefined, [contract({ status: "terminated" })]);
  assert.match((await transition(notActive, "t", "p1", { action: "start", actorEmail: "a@b.c" }) as any).error, /not active/);
});

test("completing is refused while the records say otherwise, and succeeds once they agree", async () => {
  const running = [{ event_type: "started", reason: null, outcome_note: null, actor_email: "x", created_at: "2026-10-02" }];
  const openTask = view({ period_end: "2026-09-30" }, running, [{ id: "pr1", content: { fulfillment_tasks: [{ status: "done" }, { status: "pending" }] } }]);
  const blocked = await transition(openTask, "t", "p1", { action: "complete", actorEmail: "a@b.c" });
  assert.equal(!blocked.ok && blocked.status, 409);
  assert.match(!blocked.ok ? blocked.error : "", /1 delivery task is still open/);
  assert.equal(openTask.inserted.filter((i) => i.table === "project_events").length, 0, "nothing was recorded");

  const early = view({}, running);
  assert.match((await transition(early, "t", "p1", { action: "complete", actorEmail: "a@b.c" }) as any).error, /reason for finishing early/);
  const doneEarly = await transition(early, "t", "p1", { action: "complete", earlyReason: "The sponsor closed the season early by agreement", actorEmail: "a@b.c" });
  assert.equal(doneEarly.ok, true);
  assert.equal(early.inserted.find((i) => i.table === "project_events")!.row.event_type, "completed");

  const finished = view({ period_end: "2026-09-30" }, running);
  assert.equal((await transition(finished, "t", "p1", { action: "complete", actorEmail: "a@b.c" })).ok, true);
});

test("a commercial project completes with the outcome written, once the deal has one", async () => {
  const running = [{ event_type: "started", reason: null, outcome_note: null, actor_email: "x", created_at: "2026-10-02" }];
  const c = (opp: "open" | "won") => db({ projects: [project({ project_type: "commercial", opportunity_id: "o1", contract_id: null, period_start: null, period_end: null, objective: "o", target_date: "2026-12-01", next_action: "n" })], project_events: running, opportunities: [oppRow(opp)], proposals: opp === "won" ? [{ id: "x", status: "active_contract", opportunity_id: "o1" }] : [{ id: "x", status: "under_review", opportunity_id: "o1" }], contracts: [], opportunity_events: [] });
  const still = await transition(c("open"), "t", "p1", { action: "complete", outcomeNote: "Won: family reach convinced them", actorEmail: "a@b.c" });
  assert.match(!still.ok ? still.error : "", /deal is still open/);
  const noNote = await transition(c("won"), "t", "p1", { action: "complete", actorEmail: "a@b.c" });
  assert.match(!noNote.ok ? noNote.error : "", /outcome note/);
  const sb = c("won");
  const ok = await transition(sb, "t", "p1", { action: "complete", outcomeNote: "Won: family reach convinced them", actorEmail: "a@b.c" });
  assert.equal(ok.ok, true);
  assert.equal(sb.inserted.find((i) => i.table === "project_events")!.row.outcome_note, "Won: family reach convinced them");
});

test("only day-to-day fields change, a finished project cannot be edited, and the external pointer comes as a pair", async () => {
  const live = view();
  assert.equal((await updateProject(live, "t", "p1", { owner_email: "not-an-email" }) as any).status, 400);
  assert.equal((await updateProject(live, "t", "p1", { next_action: "call them" }) as any).status, 400, "a delivery project has no next action");
  assert.equal((await updateProject(live, "t", "p1", { external_system: "plane" }) as any).status, 400);
  assert.equal((await updateProject(live, "t", "p1", {}) as any).status, 400);
  assert.equal((await updateProject(live, "t", "p1", { owner_email: "new@club.com", external_system: "plane", external_id: "PRJ-12" })).ok, true);
  assert.deepEqual(live.updated[0].patch, { owner_email: "new@club.com", external_system: "plane", external_id: "PRJ-12" });
  const finished = view({}, [{ event_type: "cancelled", reason: "x", outcome_note: null, actor_email: "x", created_at: "2026-10-02" }]);
  assert.equal((await updateProject(finished, "t", "p1", { owner_email: "new@club.com" }) as any).status, 409);
});
