import assert from "node:assert/strict";
import test from "node:test";
import type { PGlite } from "@electric-sql/pglite";
import { freshDb } from "./harness";
import { pgClient } from "../helpers/pg-from";
import { authorizeAgent, governedActor } from "../../lib/agents/governance";
import { approveAndSend, emailSendPlan, planEmailSend, toExecOutcome } from "../../lib/actions/broker";
import { listActions, viewAction } from "../../lib/actions/queries";
import { hasOpenBlock, listBlocks, resolveBlock, scanApprovals } from "../../lib/approvals/recovery";
import { assign, installStandardAgents, createDefinition, createVersion, listRegistry, promoteVersion, retireDefinition, retireVersion, revokeAssignment } from "../../lib/agents/registry";
import { decideBatch, gateBatch, loadLimits, saveLimits } from "../../lib/batch/gate";
import { insertAudit, type AuditEntry } from "../../lib/audit/log";
import { agentActor, userActor } from "../../lib/identity/actor";

const MIG = ["0069_identity_tombstones_idempotency.sql", "0070_agent_governance.sql", "0071_tombstones_full_undo.sql", "0072_langgraph_runtime.sql"];
const T = "00000000-0000-0000-0000-000000000001";
const CO = "aaaaaaaa-0000-4000-8000-00000000000a";
const CO2 = "bbbbbbbb-0000-4000-8000-00000000000b";
const EM1 = "eeeeeeee-0000-4000-8000-0000000000e1";
const EM2 = "eeeeeeee-0000-4000-8000-0000000000e2";
const RUN = "dddddddd-0000-4000-8000-0000000000d1";

const seed = `
  INSERT INTO public.platform_users (tenant_id, email, role, is_active) VALUES
    ('${T}', 'ana@club.com', 'admin', true), ('${T}', 'bia@club.com', 'approver', true), ('${T}', 'cid@club.com', 'sales_rep', true), ('${T}', 'dan@club.com', 'approver', false);
  CREATE TABLE public.emails (id uuid PRIMARY KEY, tenant_id uuid NOT NULL, recipient text, subject text, body_text text, body_html text, company_id uuid, proposal_id uuid, sender_member_id uuid, status text NOT NULL DEFAULT 'pending_approval');
  INSERT INTO public.emails (id, tenant_id, recipient, subject, company_id) VALUES
    ('${EM1}', '${T}', 'buyer@sponsor.com', 'Proposta', '${CO}'), ('${EM2}', '${T}', 'other@sponsor.com', 'Outra', '${CO}');
  CREATE TABLE public.agent_runs (id uuid PRIMARY KEY, tenant_id uuid NOT NULL, company_id uuid, created_by uuid, status text NOT NULL, result jsonb, updated_at timestamptz NOT NULL DEFAULT now());
`;
const user = (email: string, role: string) => ({ id: `u-${email}`, email, full_name: email, role });
const audits = () => { const log: AuditEntry[] = []; return { log, audit: async (e: AuditEntry) => { log.push(e); } }; };

async function world() {
  const db = await freshDb(MIG, { seed });
  return { db, sb: pgClient(db) };
}
const stateOf = async (db: PGlite, id: string) => ((await db.query("SELECT state FROM public.agent_actions WHERE id = $1", [id])).rows[0] as any).state as string;

// ── who may act ─────────────────────────────────────────────────────────────

test("an agent is authorized only for what it is assigned, and a refusal says exactly what is missing", async () => {
  const { sb } = await world();
  const ok = await authorizeAgent(sb, T, "outreach-agent", { companyId: CO, effects: ["enrich_contacts", "draft_email", "send_email"] });
  assert.ok(ok.ok);
  if (ok.ok) assert.deepEqual([ok.authority.version, ok.authority.grandfathered, ok.authority.scopeKind, ok.authority.legacy, ok.authority.maxCostUsd], [1, true, "all_companies", false, 1]);
  const no = await authorizeAgent(sb, T, "renewal-agent", { companyId: CO, effects: ["draft_renewal", "send_email"] });
  assert.ok(!no.ok && no.status === 403 && /not assigned "send_email" for this company/.test(no.error));
  const unknown = await authorizeAgent(sb, T, "ghost-agent", { effects: ["draft_email"] });
  assert.ok(!unknown.ok && /not assigned "draft_email" for the workspace/.test(unknown.error));
});

test("narrowing an agent to one company leaves it nowhere else; revoking leaves it nowhere", async () => {
  const { db, sb } = await world();
  const reg = await listRegistry(sb, T);
  assert.ok(reg.ok);
  const outreach = reg.ok ? reg.value.find((e) => e.key === "outreach-agent")! : null;
  assert.ok(outreach && outreach.live_version && outreach.assignments.length === 1 && outreach.assignments[0].grandfathered);
  assert.ok((await revokeAssignment(sb, T, outreach!.assignments[0].id, "Narrowing to one company", "ana@club.com")).ok);
  assert.equal(((await revokeAssignment(sb, T, outreach!.assignments[0].id, "again please", "ana@club.com")) as any).status, 409);
  assert.ok((await assign(sb, T, "outreach-agent", { scope_kind: "company", scope_id: CO, allowed_effects: ["draft_email", "send_email"], max_cost_usd: 0.4 }, "ana@club.com")).ok);
  assert.ok((await authorizeAgent(sb, T, "outreach-agent", { companyId: CO, effects: ["draft_email", "send_email"] })).ok);
  const other = await authorizeAgent(sb, T, "outreach-agent", { companyId: CO2, effects: ["draft_email"] });
  assert.ok(!other.ok && other.status === 403);
  const cost = await authorizeAgent(sb, T, "outreach-agent", { companyId: CO, effects: ["draft_email"] });
  assert.ok(cost.ok && cost.authority.maxCostUsd === 0.4 && cost.authority.scopeKind === "company");
  void db;
});

test("before migration 0070 an agent runs as it always has; any other failure to check is reported, not ignored", async () => {
  const missing = { rpc: async () => ({ data: null, error: { code: "PGRST202", message: "Could not find the function public.agent_assignment_for in the schema cache" } }) };
  const r = await authorizeAgent(missing, T, "outreach-agent", { effects: ["send_email"] });
  assert.ok(r.ok && r.authority.legacy);
  const broken = { rpc: async () => ({ data: null, error: { code: "XX000", message: "connection reset" } }) };
  const b = await authorizeAgent(broken, T, "outreach-agent", { effects: ["send_email"] });
  assert.ok(!b.ok && b.status === 500 && /connection reset/.test(b.error));
});

test("the audit actor for an agent carries the version that was live", async () => {
  const { sb } = await world();
  const a = await authorizeAgent(sb, T, "outreach-agent", { companyId: CO, effects: ["send_email"] });
  assert.ok(a.ok);
  if (a.ok) assert.equal(governedActor("outreach-agent", a.authority, { onBehalfOf: "cid@club.com", runId: "r1" }).id, "agent:outreach-agent@v1");
});

// ── registry ────────────────────────────────────────────────────────────────

test("a new agent does nothing until a version is promoted with evidence and it is assigned", async () => {
  const { sb } = await world();
  assert.ok((await createDefinition(sb, T, { key: "scout-agent", name: "Scout", runtime: "service" }, "ana@club.com")).ok);
  assert.equal(((await createDefinition(sb, T, { key: "scout-agent", name: "Scout", runtime: "service" }, "ana@club.com")) as any).status, 409);
  const v = await createVersion(sb, T, "scout-agent", { effects: ["flag_pipeline"], max_cost_usd: 0.1 }, "ana@club.com");
  assert.ok(v.ok && v.value.version === 1);
  assert.equal(((await createVersion(sb, T, "scout-agent", { effects: ["teleport"], max_cost_usd: 0.1 }, "ana@club.com")) as any).status, 409);
  const early = await assign(sb, T, "scout-agent", { scope_kind: "all_companies", allowed_effects: ["flag_pipeline"], max_cost_usd: 0.05, justification: "Daily pipeline sweep for the whole club" }, "ana@club.com");
  assert.ok(!early.ok && /no live version/.test(early.error));
  assert.equal(((await promoteVersion(sb, T, "scout-agent", 1, {}, { kind: "human", id: "ana@club.com" })) as any).status, 400);
  assert.ok((await promoteVersion(sb, T, "scout-agent", 1, { gate_override: "Read the code and the prompt with Bia before release" }, { kind: "human", id: "ana@club.com" })).ok);
  assert.ok((await assign(sb, T, "scout-agent", { scope_kind: "all_companies", allowed_effects: ["flag_pipeline"], max_cost_usd: 0.05, justification: "Daily pipeline sweep for the whole club" }, "ana@club.com")).ok);
  assert.ok((await authorizeAgent(sb, T, "scout-agent", { effects: ["flag_pipeline"] })).ok);
  const wide = await assign(sb, T, "scout-agent", { scope_kind: "all_companies", allowed_effects: ["flag_pipeline"], max_cost_usd: 0.05 }, "ana@club.com");
  assert.ok(!wide.ok && /asked for in words/.test(wide.error), "authority everywhere has to be asked for in words");
});

test("retiring the live version, or the agent, takes its authority away at once", async () => {
  const { sb } = await world();
  assert.ok((await authorizeAgent(sb, T, "reporting-agent", { effects: ["draft_report_email"] })).ok);
  assert.ok(!(await retireVersion(sb, T, "reporting-agent", 1, "no", { kind: "human", id: "ana" })).ok, "a retirement needs a real reason");
  assert.ok((await retireVersion(sb, T, "reporting-agent", 1, "Report format is being redesigned", { kind: "human", id: "ana@club.com" })).ok);
  assert.ok(!(await authorizeAgent(sb, T, "reporting-agent", { effects: ["draft_report_email"] })).ok);
  assert.ok((await retireDefinition(sb, T, "renewal-agent", "Replaced by a new renewal flow", "ana@club.com")).ok);
  assert.ok(!(await authorizeAgent(sb, T, "renewal-agent", { effects: ["draft_renewal"] })).ok);
  const reg = await listRegistry(sb, T);
  const rep = reg.ok ? reg.value.find((e) => e.key === "reporting-agent")! : null;
  assert.ok(rep && rep.live_version === null && rep.versions[0].status === "retired");
});

// ── the send plan ───────────────────────────────────────────────────────────

test("an agent that wants to send an email makes a plan in front of a person, and says exactly what will happen", async () => {
  const { db, sb } = await world();
  const { log, audit } = audits();
  const r = await planEmailSend(sb, { tenantId: T, emailId: EM1, onBehalfOf: "cid@club.com", runId: "run-1", audit });
  assert.ok(r.ok && !r.legacy && r.state === "awaiting_approval");
  const id = (r as any).actionId as string;
  const v = await viewAction(sb, T, id);
  assert.ok(v.ok);
  if (!v.ok) return;
  assert.deepEqual([v.value.effect, v.value.requested_by, v.value.on_behalf_of, v.value.target_id], ["send_email", "agent:outreach-agent@v1", "cid@club.com", EM1]);
  assert.match(v.value.plan.expected_effects[0], /no email provider connected, so the recipient is not emailed/);
  assert.equal(v.value.plan.inputs.recipient, "buyer@sponsor.com");
  assert.ok(v.value.plan.stop_conditions.length >= 3 && v.value.plan.cost_ceiling_usd <= 0.01);
  assert.deepEqual(v.value.events.map((e) => e.to), ["planned", "validated", "awaiting_approval"]);
  assert.deepEqual(log.map((e) => [e.action, e.actor.id, e.actor.onBehalfOf]), [["agent.action.planned", "agent:outreach-agent@v1", "cid@club.com"]]);
  assert.equal((await planEmailSend(sb, { tenantId: T, emailId: EM1, onBehalfOf: "cid@club.com", audit })).ok, true);
  assert.equal(((await db.query("SELECT count(*)::int n FROM public.agent_actions")).rows[0] as any).n, 1, "planning again is the same plan");
});

test("a plan that fails a check never reaches a person: the email was already sent, or the agent is not assigned", async () => {
  const { db, sb } = await world();
  await db.query("UPDATE public.emails SET status = 'sent' WHERE id = $1", [EM2]);
  const sent = await planEmailSend(sb, { tenantId: T, emailId: EM2, onBehalfOf: null, audit: audits().audit });
  assert.ok(!sent.ok && sent.status === 409 && /already sent/.test(sent.error) && sent.state === "failed");
  await db.query("UPDATE public.agent_assignments SET revoked_at = now(), revoked_by = 'ana', revoke_reason = 'Stop the outreach agent' WHERE definition_id = (SELECT id FROM public.agent_definitions WHERE key = 'outreach-agent')");
  const revoked = await planEmailSend(sb, { tenantId: T, emailId: EM1, onBehalfOf: null, audit: audits().audit });
  assert.ok(!revoked.ok && revoked.status === 403 && /not assigned/.test(revoked.error));
  assert.equal(((await db.query("SELECT count(*)::int n FROM public.agent_actions WHERE target_id = $1", [EM1])).rows[0] as any).n, 0);
});

test("before the governance tables exist, an agent's send is not planned and the old direct send stands", async () => {
  const legacySb = { ...pgClient(await freshDb([], { seed })), rpc: async () => ({ data: null, error: { code: "PGRST202", message: "Could not find the function public.agent_assignment_for in the schema cache" } }) };
  const r = await planEmailSend(legacySb, { tenantId: T, emailId: EM1, onBehalfOf: null, audit: audits().audit });
  assert.ok(r.ok && r.legacy === true);
});

// ── approving and sending ───────────────────────────────────────────────────

const sendOk = (n: { v: number }) => async () => { n.v++; return { success: true, data: { sent: true, pipedrive_activity_id: 4412 }, summary: "Email marked sent and logged in the CRM (Pipedrive activity #4412)." }; };

test("a person with standing approves the plan and it runs once; approving again changes nothing", async () => {
  const { db, sb } = await world();
  const { log, audit } = audits();
  const planned = await planEmailSend(sb, { tenantId: T, emailId: EM1, onBehalfOf: "cid@club.com", audit });
  const id = (planned as any).actionId as string;
  const calls = { v: 0 };
  const out = await approveAndSend(sb, { tenantId: T, actionId: id, approver: user("bia@club.com", "approver"), send: sendOk(calls), audit });
  assert.ok(out.ok && out.state === "reconciled");
  assert.equal(calls.v, 1);
  assert.equal(await stateOf(db, id), "reconciled");
  assert.deepEqual(log.map((e) => [e.action, e.actor.kind === "agent" || e.actor.kind === "human" || e.actor.kind === "approver" ? e.actor.kind : e.actor.kind]), [["agent.action.planned", "agent"], ["agent.action.approved", "human"], ["agent.action.reconciled", "agent"]]);
  const again = await approveAndSend(sb, { tenantId: T, actionId: id, approver: user("bia@club.com", "approver"), send: sendOk(calls), audit });
  assert.ok(again.ok && /already sent/.test(again.summary));
  assert.equal(calls.v, 1, "never sent twice");
  const row = (await db.query("SELECT actor_email FROM public.agent_action_events WHERE action_id = $1 AND to_state = 'authorized'", [id])).rows[0] as any;
  assert.equal(row.actor_email, "bia@club.com");
});

test("someone without standing cannot approve: a sales rep, someone who left, or the agent's own requester path", async () => {
  const { db, sb } = await world();
  const id = ((await planEmailSend(sb, { tenantId: T, emailId: EM1, onBehalfOf: "cid@club.com", audit: audits().audit })) as any).actionId as string;
  const calls = { v: 0 };
  for (const [email, role] of [["cid@club.com", "sales_rep"], ["dan@club.com", "approver"], ["stranger@elsewhere.com", "admin"]] as const) {
    const out = await approveAndSend(sb, { tenantId: T, actionId: id, approver: user(email, role), send: sendOk(calls), audit: audits().audit });
    assert.ok(!out.ok && out.status === 403 && /not an active member of the club who may approve this/.test(out.error), email);
  }
  assert.equal(calls.v, 0);
  assert.equal(await stateOf(db, id), "awaiting_approval");
});

test("a send whose outcome is unknown leaves the action uncertain, and approving again does not send it again", async () => {
  const { db, sb } = await world();
  const id = ((await planEmailSend(sb, { tenantId: T, emailId: EM1, onBehalfOf: null, audit: audits().audit })) as any).actionId as string;
  const calls = { v: 0 };
  const flaky = async () => { calls.v++; throw new Error("socket hang up"); };
  const first = await approveAndSend(sb, { tenantId: T, actionId: id, approver: user("bia@club.com", "approver"), send: flaky as never, audit: audits().audit });
  assert.ok(!first.ok && first.status === 409 && first.state === "uncertain");
  const again = await approveAndSend(sb, { tenantId: T, actionId: id, approver: user("ana@club.com", "admin"), send: sendOk(calls), audit: audits().audit });
  assert.ok(!again.ok && /outcome of the last attempt is unknown/.test(again.error));
  assert.equal(calls.v, 1, "the provider was called once");
  assert.equal(await stateOf(db, id), "uncertain");
  const plan = await planEmailSend(sb, { tenantId: T, emailId: EM1, onBehalfOf: null, audit: audits().audit });
  assert.ok(!plan.ok && plan.state === "uncertain" && /unknown outcome/.test(plan.error));
});

test("a failed attempt can be planned again as a new, linked plan; a CRM failure after the email was marked sent is uncertain, not failed", async () => {
  assert.deepEqual(toExecOutcome({ success: true, data: { sent: true, pipedrive_activity_id: 9 }, summary: "ok" }), { kind: "accepted", providerRef: "crm-activity:9", detail: { summary: "ok" } });
  assert.deepEqual(toExecOutcome({ success: false, data: { sent: true }, summary: "CRM down" }).kind, "unknown");
  assert.deepEqual(toExecOutcome({ success: false, data: { sent: false }, summary: "Email not found" }), { kind: "refused", error: "Email not found" });
  const { db, sb } = await world();
  const id = ((await planEmailSend(sb, { tenantId: T, emailId: EM1, onBehalfOf: null, audit: audits().audit })) as any).actionId as string;
  const out = await approveAndSend(sb, { tenantId: T, actionId: id, approver: user("bia@club.com", "approver"), send: async () => ({ success: false, data: { sent: false }, summary: "Email not found" }), audit: audits().audit });
  assert.ok(!out.ok && out.state === "failed");
  const retry = await planEmailSend(sb, { tenantId: T, emailId: EM1, onBehalfOf: null, audit: audits().audit });
  assert.ok(retry.ok && (retry as any).actionId !== id);
  const row = (await db.query("SELECT retry_of FROM public.agent_actions WHERE id = $1", [(retry as any).actionId])).rows[0] as any;
  assert.equal(row.retry_of, id);
});

test("the plan for an email has the shape the database requires", () => {
  const p = emailSendPlan({ id: EM1, recipient: "x@y.com", subject: "S", company_id: CO }, 0.5);
  assert.deepEqual(Object.keys(p).sort(), ["cost_ceiling_usd", "expected_effects", "inputs", "scope", "stop_conditions", "tools"]);
  assert.equal(emailSendPlan({ id: EM1, recipient: "x@y.com", subject: "S", company_id: CO }, 0.004).cost_ceiling_usd, 0.004);
});

// ── approvals whose reviewer has left ───────────────────────────────────────

test("an approval waiting on someone who has left is found and blocked, with a reason and an administrator to escalate to", async () => {
  const { db, sb } = await world();
  const id = ((await planEmailSend(sb, { tenantId: T, emailId: EM1, onBehalfOf: null, reviewerEmail: "dan@club.com", audit: audits().audit })) as any).actionId as string;
  const scan = await scanApprovals(sb, T);
  assert.ok(scan.ok);
  if (!scan.ok) return;
  assert.equal(scan.value.blocked.length, 1);
  assert.match(scan.value.blocked[0].reason, /dan@club.com is no longer an active member/);
  assert.equal(await stateOf(db, id), "blocked");
  const open = await listBlocks(sb, T);
  assert.ok(open.ok && open.value.length === 1 && open.value[0].escalated_to === "ana@club.com" && open.value[0].reviewer_email === "dan@club.com");
  assert.deepEqual(((await scanApprovals(sb, T)) as any).value.blocked, [], "a second scan finds nothing new");
  const calls = { v: 0 };
  const attempt = await approveAndSend(sb, { tenantId: T, actionId: id, approver: user("bia@club.com", "approver"), send: sendOk(calls), audit: audits().audit });
  assert.ok(!attempt.ok && attempt.status === 409 && attempt.state === "blocked" && /reviewer is no longer available/.test(attempt.error));
  assert.equal(calls.v, 0);
});

test("an administrator reassigns a blocked approval to someone who can act, and only then can it go ahead", async () => {
  const { db, sb } = await world();
  const id = ((await planEmailSend(sb, { tenantId: T, emailId: EM1, onBehalfOf: null, reviewerEmail: "dan@club.com", audit: audits().audit })) as any).actionId as string;
  await scanApprovals(sb, T);
  const block = ((await listBlocks(sb, T)) as any).value[0];
  const admin = { id: "u-ana", email: "ana@club.com" };
  const bad = await resolveBlock(sb, T, block.id, { action: "reassign", newReviewerEmail: "cid@club.com" }, admin);
  assert.ok(!bad.ok && bad.status === 409);
  assert.equal(((await resolveBlock(sb, T, "00000000-0000-4000-8000-000000000999", { action: "cancel" }, admin)) as any).status, 404);
  assert.equal(((await resolveBlock(sb, T, block.id, { action: "dismiss" }, admin)) as any).status, 400, "a blocked action cannot just be dismissed");
  const good = await resolveBlock(sb, T, block.id, { action: "reassign", newReviewerEmail: "bia@club.com", note: "Bia covers while Dan is away" }, admin);
  assert.ok(good.ok);
  assert.equal(await stateOf(db, id), "awaiting_approval");
  const calls = { v: 0 };
  const out = await approveAndSend(sb, { tenantId: T, actionId: id, approver: user("bia@club.com", "approver"), send: sendOk(calls), audit: audits().audit });
  assert.ok(out.ok && calls.v === 1);
  assert.equal(((await resolveBlock(sb, T, block.id, { action: "cancel" }, admin)) as any).status, 409, "already resolved");
});

test("a run paused for approval is blocked when nobody can approve it or it has waited too long, and cannot proceed until an administrator acts", async () => {
  const { db, sb } = await world();
  await db.query("INSERT INTO public.agent_runs (id, tenant_id, company_id, status, updated_at) VALUES ($1, $2, $3, 'paused_for_approval', now() - interval '9 days')", [RUN, T, CO]);
  await db.query("INSERT INTO public.agent_runs (id, tenant_id, company_id, status) VALUES ('dddddddd-0000-4000-8000-0000000000d2', $1, $2, 'paused_for_approval')", [T, CO2]);
  const scan = await scanApprovals(sb, T);
  assert.ok(scan.ok && scan.value.blocked.length === 1 && scan.value.blocked[0].subject_id === RUN);
  assert.match(scan.ok ? scan.value.blocked[0].reason : "", /waiting for approval for 9 days/);
  const b = await hasOpenBlock(sb, "agent_run", RUN);
  assert.ok(b && b.escalated_to === "ana@club.com");
  assert.equal(await hasOpenBlock(sb, "agent_run", "dddddddd-0000-4000-8000-0000000000d2"), null);
  assert.ok((await resolveBlock(sb, T, b!.id, { action: "reassign", newReviewerEmail: "bia@club.com" }, { id: "u", email: "ana@club.com" })).ok);
  assert.equal(await hasOpenBlock(sb, "agent_run", RUN), null);
  // nobody left who can approve anything
  await db.query("UPDATE public.platform_users SET is_active = false WHERE role IN ('approver', 'admin') AND email <> 'ana@club.com'");
  await db.query("UPDATE public.platform_users SET role = 'sales_rep' WHERE email = 'ana@club.com'");
  const nobody = await scanApprovals(sb, T);
  assert.ok(nobody.ok && nobody.value.cannot_escalate && /no active administrator/.test(nobody.value.cannot_escalate));
});

test("listing actions shows the plans and what state each is in", async () => {
  const { sb } = await world();
  await planEmailSend(sb, { tenantId: T, emailId: EM1, onBehalfOf: null, audit: audits().audit });
  const l = await listActions(sb, T, { state: "awaiting_approval" });
  assert.ok(l.ok && l.value.length === 1 && l.value[0].effect === "send_email");
  assert.ok(((await listActions(sb, T, { state: "uncertain" })) as any).value.length === 0);
  assert.equal(((await viewAction(sb, T, "00000000-0000-4000-8000-000000000999")) as any).status, 404);
});

// ── batch gating ────────────────────────────────────────────────────────────

test("the decision about a batch is a pure comparison against the limits", () => {
  const base = { perItemUsd: 0.25, maxItems: 10, ceilingUsd: 5 };
  assert.equal(decideBatch({ ...base, items: 10 }).decision, "accepted");
  assert.match(decideBatch({ ...base, items: 11 }).reason!, /Too many to review at once: 11 items, and the limit is 10/);
  assert.match(decideBatch({ ...base, items: 10, perItemUsd: 0.6 }).reason!, /above the batch ceiling of \$5.00/);
  assert.match(decideBatch({ ...base, items: 0 }).reason!, /nothing in this batch/);
  assert.match(decideBatch({ ...base, items: 8, todaySpendUsd: 24, dailyCapUsd: 25 }).reason!, /daily cap of \$25.00/);
  assert.equal(decideBatch({ ...base, items: 8, todaySpendUsd: 10, dailyCapUsd: 25 }).estimatedUsd, 2);
});

test("a batch is recorded either way, a refusal stops it before anything is spent, and the limits can be changed by name", async () => {
  const { db, sb } = await world();
  const ok = await gateBatch(sb, T, "ana@club.com", { kind: "outreach_run", items: 8, dailyCheck: async () => ({ todaySpendUsd: 1, capUsd: 25 }) });
  assert.ok(ok.ok && ok.decisionId && ok.decision.estimatedUsd === 2);
  const many = await gateBatch(sb, T, "ana@club.com", { kind: "outreach_run", items: 40 });
  assert.ok(!many.ok && many.status === 409 && /Too many to review at once/.test(many.error));
  const dear = await gateBatch(sb, T, "ana@club.com", { kind: "outreach_run", items: 10, perItemUsd: 0.8 });
  assert.ok(!dear.ok && /above the batch ceiling/.test(dear.error));
  const rows = (await db.query("SELECT decision, items, reason FROM public.batch_decisions ORDER BY created_at")).rows as any[];
  assert.deepEqual(rows.map((r) => [r.decision, r.items]), [["accepted", 8], ["refused", 40], ["refused", 10]]);
  assert.equal(((await saveLimits(sb, T, { max_review_batch: 500 }, "ana@club.com")) as any).status, 400);
  assert.equal(((await saveLimits(sb, T, { max_review_batch: 20 }, "")) as any).status, 403);
  assert.ok((await saveLimits(sb, T, { max_review_batch: 20, max_batch_cost_usd: 10 }, "ana@club.com")).ok);
  const bigger = await gateBatch(sb, T, "ana@club.com", { kind: "outreach_run", items: 20, perItemUsd: 0.4 });
  assert.ok(bigger.ok);
  const l = await loadLimits(sb, T);
  assert.ok(l.ok && l.value.max_review_batch === 20 && !l.value.isDefault);
});

test("before migration 0070 a bulk job is not blocked: the limits are simply not enforced yet", async () => {
  const bare = pgClient(await freshDb([], { seed }));
  const l = await loadLimits(bare, T);
  assert.ok(l.ok && !l.value.enforced);
  const g = await gateBatch(bare, T, "ana@club.com", { kind: "outreach_run", items: 50 });
  assert.ok(g.ok && g.decisionId === null);
});

// ── the audit writer against the real table ─────────────────────────────────

test("a signed-in person's audit entry is stored (performed_by points at the legacy users table, so it is not used)", async () => {
  const { db, sb } = await world();
  const pu = { id: "7d6a1e0e-0000-4000-8000-000000000001", email: "bia@club.com", full_name: "Bia", role: "approver" };
  const r = await insertAudit(sb, T, { actor: userActor(pu as never), entity_type: "platform_user", entity_id: pu.id, action: "user.updated", metadata: { role: "viewer" } });
  assert.ok(r.ok, r.error);
  const a = await insertAudit(sb, T, { actor: agentActor("outreach-agent", { onBehalfOf: "cid@club.com" }), entity_type: "email", entity_id: EM1, action: "agent.tool.send_email" });
  assert.ok(a.ok, a.error);
  const rows = (await db.query("SELECT actor_kind, actor_email, performed_by FROM public.audit_logs ORDER BY seq")).rows as any[];
  assert.deepEqual(rows.map((x) => [x.actor_kind, x.actor_email, x.performed_by]), [["human", "bia@club.com", null], ["agent", null, null]]);
});

// ── a new tenant gets the standard agents ───────────────────────────────────

test("a new tenant starts with no agents; installing the standard ones grants no authority unless asked", async () => {
  const T2 = "00000000-0000-0000-0000-000000000002";
  const { db, sb } = await world();
  await db.query("INSERT INTO public.tenants (id, name) VALUES ($1, 'Second club')", [T2]);
  const none = await authorizeAgent(sb, T2, "outreach-agent", { effects: ["draft_email"] });
  assert.ok(!none.ok && none.status === 403, "a tenant with no agents can do nothing");
  const r = await installStandardAgents(sb, T2, "ana@second.com", false);
  assert.ok(r.ok && r.value.installed.length === 6 && r.value.skipped.length === 0 && !r.value.assigned);
  const still = await authorizeAgent(sb, T2, "outreach-agent", { effects: ["draft_email"] });
  assert.ok(!still.ok && /not assigned/.test(still.error), "installed is not assigned");
  const again = await installStandardAgents(sb, T2, "ana@second.com", true);
  assert.ok(again.ok && again.value.installed.length === 0 && again.value.skipped.length === 6, "running it twice changes nothing");
  assert.ok((await assign(sb, T2, "outreach-agent", { scope_kind: "company", scope_id: CO, allowed_effects: ["draft_email"], max_cost_usd: 0.2 }, "ana@second.com")).ok);
  assert.ok((await authorizeAgent(sb, T2, "outreach-agent", { companyId: CO, effects: ["draft_email"] })).ok);
  // the first tenant's agents are untouched
  assert.ok((await authorizeAgent(sb, T, "outreach-agent", { effects: ["send_email"] })).ok);
});

test("installing with assign gives each agent a workspace-wide assignment that names who chose it", async () => {
  const T3 = "00000000-0000-0000-0000-000000000003";
  const { db, sb } = await world();
  await db.query("INSERT INTO public.tenants (id, name) VALUES ($1, 'Third club')", [T3]);
  const r = await installStandardAgents(sb, T3, "zed@third.com", true);
  assert.ok(r.ok && r.value.installed.length === 6 && r.value.assigned);
  const a = await authorizeAgent(sb, T3, "reporting-agent", { effects: ["draft_report_email"] });
  assert.ok(a.ok && a.authority.scopeKind === "all_companies" && !a.authority.grandfathered);
  const row = (await db.query("SELECT justification, assigned_by FROM public.agent_assignments WHERE tenant_id = $1 LIMIT 1", [T3])).rows[0] as any;
  assert.match(row.justification, /zed@third.com/);
  assert.equal(((await installStandardAgents(sb, T3, "", false)) as any).ok, false);
  assert.equal(((await installStandardAgents(sb, "00000000-0000-0000-0000-0000000000ff", "zed@third.com", false)) as any).ok, false);
});

// ── the email must still be the one that was approved ───────────────────────

for (const [what, change] of [
  ["its recipient", "UPDATE public.emails SET recipient = 'attacker@evil.example' WHERE id = $1"],
  ["its subject", "UPDATE public.emails SET subject = 'Pay this invoice today' WHERE id = $1"],
  ["its text", "UPDATE public.emails SET body_text = 'Send your bank details to this address.' WHERE id = $1"],
] as const) {
  test(`if ${what} is changed after the plan was made, nothing is sent and the approver is told`, async () => {
    const { db, sb } = await world();
    await db.query("UPDATE public.emails SET body_text = 'Olá, segue a proposta.' WHERE id = $1", [EM1]);
    const id = ((await planEmailSend(sb, { tenantId: T, emailId: EM1, onBehalfOf: "cid@club.com", audit: audits().audit })) as any).actionId as string;
    await db.query(change, [EM1]);
    const calls = { v: 0 };
    const out = await approveAndSend(sb, { tenantId: T, actionId: id, approver: user("bia@club.com", "approver"), send: sendOk(calls), audit: audits().audit });
    assert.ok(!out.ok && out.state === "failed" && /changed after this plan was made/.test(out.error), JSON.stringify(out));
    assert.equal(calls.v, 0, "the provider was never called");
    assert.equal(await stateOf(db, id), "failed");
  });
}

test("an email that has not changed since the plan is sent as approved", async () => {
  const { db, sb } = await world();
  await db.query("UPDATE public.emails SET body_text = 'Olá, segue a proposta.' WHERE id = $1", [EM1]);
  const id = ((await planEmailSend(sb, { tenantId: T, emailId: EM1, onBehalfOf: "cid@club.com", audit: audits().audit })) as any).actionId as string;
  const plan = (await viewAction(sb, T, id)) as any;
  assert.match(plan.value.plan.inputs.content_fingerprint, /^[0-9a-f]{64}$/);
  const calls = { v: 0 };
  const out = await approveAndSend(sb, { tenantId: T, actionId: id, approver: user("bia@club.com", "approver"), send: sendOk(calls), audit: audits().audit });
  assert.ok(out.ok && calls.v === 1);
});

test("a changed email can be planned again, as a new plan that a person reads again", async () => {
  const { db, sb } = await world();
  const first = ((await planEmailSend(sb, { tenantId: T, emailId: EM1, onBehalfOf: null, audit: audits().audit })) as any).actionId as string;
  await db.query("UPDATE public.emails SET recipient = 'corrected@sponsor.com' WHERE id = $1", [EM1]);
  await approveAndSend(sb, { tenantId: T, actionId: first, approver: user("bia@club.com", "approver"), send: sendOk({ v: 0 }), audit: audits().audit });
  const second = await planEmailSend(sb, { tenantId: T, emailId: EM1, onBehalfOf: null, audit: audits().audit });
  assert.ok(second.ok && (second as any).actionId !== first && second.state === "awaiting_approval");
  const v = (await viewAction(sb, T, (second as any).actionId)) as any;
  assert.equal(v.value.plan.inputs.recipient, "corrected@sponsor.com");
});
