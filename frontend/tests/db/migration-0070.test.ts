import assert from "node:assert/strict";
import test from "node:test";
import { freshDb, refusal } from "./harness";

const MIG = ["0069_identity_tombstones_idempotency.sql", "0070_agent_governance.sql"];
const T = "00000000-0000-0000-0000-000000000001";
const T2 = "00000000-0000-0000-0000-000000000002";
const CO_A = "aaaaaaaa-0000-4000-8000-00000000000a";
const CO_B = "bbbbbbbb-0000-4000-8000-00000000000b";
const EMAIL = "eeeeeeee-0000-4000-8000-0000000000e1";
const EMAIL2 = "eeeeeeee-0000-4000-8000-0000000000e2";

const seed = `
  INSERT INTO public.tenants (id, name) VALUES ('${T2}', 'Second');
  INSERT INTO public.platform_users (tenant_id, email, role, is_active) VALUES
    ('${T}', 'ana@club.com', 'admin', true), ('${T}', 'bia@club.com', 'approver', true), ('${T}', 'cid@club.com', 'sales_rep', true),
    ('${T}', 'dan@club.com', 'approver', false), ('${T}', 'eve@club.com', 'admin', true), ('${T2}', 'zed@other.com', 'admin', true);
`;
const val = async (db: any, sql: string, params: unknown[] = []) => (await db.query(sql, params)).rows[0];
const world = () => freshDb(MIG, { seed });

const plan = (over: Record<string, unknown> = {}) => ({
  scope: { company_id: CO_A }, tools: ["send_email"], inputs: { email_id: EMAIL }, expected_effects: ["The email is marked sent and logged in the CRM"],
  cost_ceiling_usd: 0.05, stop_conditions: ["The recipient is on the do-not-contact list", "The approval is withdrawn"], ...over,
});
const assignmentOf = async (db: any, key: string) => (await val(db, "SELECT a.id FROM public.agent_assignments a JOIN public.agent_definitions d ON d.id = a.definition_id WHERE d.key = $1 AND a.revoked_at IS NULL ORDER BY a.created_at DESC LIMIT 1", [key])).id as string;

const request = (db: any, asg: string, o: Record<string, unknown> = {}) => db.query(
  "SELECT public.agent_action_request($1, $2, $3, $4, $5, 'email', $6, $7::jsonb, 'agent', 'agent:outreach-agent@v1', 'cid@club.com', $8, $9) AS id",
  [o.tenant ?? T, asg, o.effect ?? "send_email", o.company ?? CO_A, o.campaign ?? null, o.target ?? EMAIL, JSON.stringify(o.plan ?? plan()), o.idem ?? "idem-key-0001", o.retry ?? null]);
const move = (db: any, id: string, to: string, kind = "service", actor = "service:test", email: string | null = null, detail: Record<string, unknown> = {}) =>
  db.query("SELECT public.agent_action_transition($1, $2, $3, $4, $5, $6::jsonb) AS s", [id, to, kind, actor, email, JSON.stringify(detail)]);
const state = async (db: any, id: string) => (await val(db, "SELECT state FROM public.agent_actions WHERE id = $1", [id])).state as string;

async function toAwaiting(db: any, o: Record<string, unknown> = {}) {
  const asg = await assignmentOf(db, "outreach-agent");
  const id = (await request(db, asg, o)).rows[0].id as string;
  await move(db, id, "validated", "service", "service:t", null, { gates: { do_not_contact: "clear" } });
  await move(db, id, "awaiting_approval", "service", "service:t", null, o.reviewer ? { reviewer_email: o.reviewer } : {});
  return { id, asg };
}
const approve = (db: any, id: string, email = "bia@club.com", kind = "approver") => move(db, id, "authorized", kind, `user:${email}`, email);

// ── agents, versions, assignments ───────────────────────────────────────────

test("the six existing agents are registered, live, and assigned workspace-wide as grandfathered", async () => {
  const db = await world();
  const rows = (await db.query("SELECT d.key, a.scope_kind, a.grandfathered, a.allowed_effects FROM public.agent_definitions d JOIN public.agent_assignments a ON a.definition_id = d.id ORDER BY d.key")).rows as any[];
  assert.equal(rows.length, 6);
  assert.ok(rows.every((r) => r.scope_kind === "all_companies" && r.grandfathered));
  assert.deepEqual(rows.find((r) => r.key === "outreach-agent").allowed_effects.sort(), ["draft_email", "enrich_contacts", "generate_proposal", "scrape_intelligence", "send_email"]);
  const live = (await val(db, "SELECT count(*)::int n FROM public.agent_definitions d WHERE public.agent_active_version(d.id) IS NOT NULL")).n;
  assert.equal(live, 6);
});

test("an agent may act only where it is assigned, for the effects it is assigned, in the scope it is assigned", async () => {
  const db = await world();
  const f = (key: string, co: string | null, effect: string | null) => db.query("SELECT * FROM public.agent_assignment_for($1, $2, $3, NULL, $4)", [T, key, co, effect]);
  assert.equal((await f("outreach-agent", CO_A, "send_email")).rows.length, 1);
  assert.equal((await f("renewal-agent", CO_A, "send_email")).rows.length, 0, "the renewal agent has no authority to send");
  assert.equal((await f("nobody-agent", CO_A, null)).rows.length, 0);
  assert.equal((await db.query("SELECT * FROM public.agent_assignment_for($1, 'outreach-agent', $2, NULL, 'send_email')", [T2, CO_A])).rows.length, 0, "another tenant's agents are not this tenant's");
  // narrow it: revoke the workspace-wide assignment and give it one company
  await db.query("UPDATE public.agent_assignments SET revoked_at = now(), revoked_by = 'ana@club.com', revoke_reason = 'Narrowing to one company' WHERE definition_id = (SELECT id FROM public.agent_definitions WHERE key = 'outreach-agent')");
  assert.equal((await f("outreach-agent", CO_A, "send_email")).rows.length, 0);
  const def = (await val(db, "SELECT id FROM public.agent_definitions WHERE key = 'outreach-agent'")).id;
  await db.query("INSERT INTO public.agent_assignments (tenant_id, definition_id, scope_kind, scope_id, allowed_effects, max_cost_usd, assigned_by) VALUES ($1, $2, 'company', $3, ARRAY['draft_email'], 0.5, 'ana@club.com')", [T, def, CO_A]);
  assert.equal((await f("outreach-agent", CO_A, "draft_email")).rows.length, 1);
  assert.equal((await f("outreach-agent", CO_A, "send_email")).rows.length, 0, "assigned to draft, not to send");
  assert.equal((await f("outreach-agent", CO_B, "draft_email")).rows.length, 0, "assigned to one company, not another");
});

test("the most specific assignment wins, an expired one does not count, and a revoked one is gone", async () => {
  const db = await world();
  const def = (await val(db, "SELECT id FROM public.agent_definitions WHERE key = 'outreach-agent'")).id;
  await db.query("INSERT INTO public.agent_assignments (tenant_id, definition_id, scope_kind, scope_id, allowed_effects, max_cost_usd, assigned_by) VALUES ($1, $2, 'company', $3, ARRAY['draft_email'], 0.1, 'ana@club.com')", [T, def, CO_A]);
  const best = (await val(db, "SELECT scope_kind, max_cost_usd::float c FROM public.agent_assignment_for($1, 'outreach-agent', $2, NULL, 'draft_email')", [T, CO_A]));
  assert.deepEqual([best.scope_kind, best.c], ["company", 0.1]);
  await db.query("INSERT INTO public.agent_assignments (tenant_id, definition_id, scope_kind, scope_id, allowed_effects, max_cost_usd, assigned_by, starts_at, expires_at) VALUES ($1, $2, 'campaign', $3, ARRAY['draft_email'], 0.3, 'ana@club.com', now() - interval '2 days', now() - interval '1 day')", [T, def, CO_B]);
  assert.equal((await db.query("SELECT * FROM public.agent_assignment_for($1, 'outreach-agent', NULL, $2, 'draft_email')", [T, CO_B])).rows.length, 1, "falls back to the workspace-wide assignment; the expired campaign one is ignored");
  assert.equal((await val(db, "SELECT scope_kind FROM public.agent_assignment_for($1, 'outreach-agent', NULL, $2, 'draft_email')", [T, CO_B])).scope_kind, "all_companies");
});

test("an assignment must be asked for in words, stay within the version, and name a real scope", async () => {
  const db = await world();
  const def = (await val(db, "SELECT id FROM public.agent_definitions WHERE key = 'renewal-agent'")).id;
  const ins = (sql: string, params: unknown[]) => refusal(db, `INSERT INTO public.agent_assignments (tenant_id, definition_id, scope_kind, scope_id, allowed_effects, max_cost_usd, justification, assigned_by) VALUES ${sql}`, params);
  assert.match(await ins("($1, $2, 'all_companies', NULL, ARRAY['draft_renewal'], 0.2, NULL, 'ana')", [T, def]), /violates check/);
  assert.match(await ins("($1, $2, 'company', NULL, ARRAY['draft_renewal'], 0.2, NULL, 'ana')", [T, def]), /violates check/);
  assert.match(await ins("($1, $2, 'all_companies', $3, ARRAY['draft_renewal'], 0.2, 'workspace wide for the season', 'ana')", [T, def, CO_A]), /violates check/);
  assert.match(await ins("($1, $2, 'company', $3, ARRAY['send_email'], 0.2, NULL, 'ana')", [T, def, CO_A]), /not one of its effects/);
  assert.match(await ins("($1, $2, 'company', $3, ARRAY['draft_renewal'], 99, NULL, 'ana')", [T, def, CO_A]), /cannot exceed the version/);
  assert.match(await ins("($1, $2, 'company', $3, ARRAY[]::text[], 0.2, NULL, 'ana')", [T, def, CO_A]), /violates check/);
  assert.match(await ins("($1, $2, 'company', $3, ARRAY['draft_renewal'], 0.2, NULL, 'ana')", [T2, def, CO_A]), /another tenant/);
});

test("versions are immutable, a definition can only be retired, and nothing is deleted", async () => {
  const db = await world();
  assert.match(await refusal(db, "UPDATE public.agent_versions SET max_cost_usd = 99"), /immutable/);
  assert.match(await refusal(db, "DELETE FROM public.agent_versions"), /cannot be deleted/);
  assert.match(await refusal(db, "UPDATE public.agent_definitions SET name = 'Renamed'"), /can only be retired/);
  assert.match(await refusal(db, "DELETE FROM public.agent_definitions"), /retire them/);
  assert.match(await refusal(db, "UPDATE public.agent_definitions SET retired_at = now(), retired_by = 'ana'"), /violates check/);
  const def = (await val(db, "SELECT id FROM public.agent_definitions WHERE key = 'reporting-agent'")).id;
  await db.query("UPDATE public.agent_definitions SET retired_at = now(), retired_by = 'ana@club.com', retire_reason = 'Replaced by a new report flow' WHERE id = $1", [def]);
  assert.equal((await db.query("SELECT * FROM public.agent_assignment_for($1, 'reporting-agent', $2, NULL, NULL)", [T, CO_A])).rows.length, 0, "a retired agent has no authority");
  assert.match(await refusal(db, "UPDATE public.agent_definitions SET retire_reason = 'again' WHERE id = $1", [def]), /can only be retired/);
  assert.match(await refusal(db, "INSERT INTO public.agent_versions (tenant_id, definition_id, version, effects, max_cost_usd, created_by) VALUES ($1, (SELECT id FROM public.agent_definitions WHERE key = 'renewal-agent'), 2, ARRAY['teleport'], 1, 'ana')", [T]), /unknown effect/);
});

test("a new version goes live with evidence and retires the one it replaces; assignments follow the live version", async () => {
  const db = await world();
  const def = (await val(db, "SELECT id FROM public.agent_definitions WHERE key = 'renewal-agent'")).id;
  const v2 = (await val(db, "INSERT INTO public.agent_versions (tenant_id, definition_id, version, effects, tools, max_cost_usd, created_by) VALUES ($1, $2, 2, ARRAY['draft_renewal'], ARRAY['draft_renewal'], 0.4, 'ana') RETURNING id", [T, def])).id;
  assert.match(await refusal(db, "INSERT INTO public.agent_version_events (tenant_id, version_id, event_type, evidence, actor_kind, actor_id) VALUES ($1, $2, 'promoted', '{\"x\":1}', 'human', 'ana')", [T, v2]), /another version is live/);
  assert.match(await refusal(db, "SELECT public.agent_version_promote($1, 'human', 'ana@club.com', '{}'::jsonb)", [v2]), /violates check/, "no evidence, no promotion");
  const v1 = (await val(db, "SELECT public.agent_active_version($1) AS v", [def])).v;
  await db.query("SELECT public.agent_version_promote($1, 'human', 'ana@club.com', $2::jsonb)", [v2, JSON.stringify({ eval_run: "2026-10-08", passed: true })]);
  assert.equal((await val(db, "SELECT public.agent_active_version($1) AS v", [def])).v, v2);
  assert.notEqual(v1, v2);
  assert.match(await refusal(db, "SELECT public.agent_version_promote($1, 'human', 'ana@club.com', '{\"a\":1}'::jsonb)", [v2]), /already live/);
  const f = await val(db, "SELECT version, max_cost_usd::float c FROM public.agent_assignment_for($1, 'renewal-agent', $2, NULL, 'draft_renewal')", [T, CO_A]);
  assert.deepEqual([f.version, f.c], [2, 0.4], "the old assignment now runs the live version, capped by it");
  assert.match(await refusal(db, "UPDATE public.agent_version_events SET reason = 'x'"), /immutable/);
});

// ── plans ───────────────────────────────────────────────────────────────────

test("a plan states its scope, tools, inputs, expected effects, cost ceiling and stop conditions, or it is refused", async () => {
  const db = await world();
  const asg = await assignmentOf(db, "outreach-agent");
  for (const [name, bad] of [["scope", { scope: undefined }], ["tools", { tools: [] }], ["inputs", { inputs: [] }], ["expected_effects", { expected_effects: [] }], ["stop_conditions", { stop_conditions: [] }], ["cost_ceiling_usd", { cost_ceiling_usd: "cheap" }]] as const) {
    assert.match(await refusal(db, "SELECT public.agent_action_request($1, $2, 'send_email', $3, NULL, 'email', $4, $5::jsonb, 'agent', 'agent:x', NULL, $6, NULL)", [T, asg, CO_A, EMAIL, JSON.stringify(plan(bad as Record<string, unknown>)), `idem-bad-${name}-1`]), /PLAN: a plan states/, name);
  }
  assert.match(await refusal(db, "SELECT public.agent_action_request($1, $2, 'send_email', $3, NULL, 'email', $4, $5::jsonb, 'agent', 'agent:x', NULL, 'idem-ceiling-01', NULL)", [T, asg, CO_A, EMAIL, JSON.stringify(plan({ cost_ceiling_usd: 50 }))]), /above what this assignment allows/);
  assert.equal(((await db.query("SELECT count(*)::int n FROM public.agent_actions")).rows[0] as any).n, 0);
});

test("a plan is refused unless the agent is assigned that effect and that company", async () => {
  const db = await world();
  const renewal = await assignmentOf(db, "renewal-agent");
  assert.match(await refusal(db, "SELECT public.agent_action_request($1, $2, 'send_email', $3, NULL, 'email', $4, $5::jsonb, 'agent', 'agent:renewal-agent', NULL, 'idem-effect-001', NULL)", [T, renewal, CO_A, EMAIL, JSON.stringify(plan())]), /not assigned the effect "send_email"/);
  const def = (await val(db, "SELECT id FROM public.agent_definitions WHERE key = 'outreach-agent'")).id;
  await db.query("UPDATE public.agent_assignments SET revoked_at = now(), revoked_by = 'ana', revoke_reason = 'Narrow it down' WHERE definition_id = $1", [def]);
  const narrow = (await val(db, "INSERT INTO public.agent_assignments (tenant_id, definition_id, scope_kind, scope_id, allowed_effects, max_cost_usd, assigned_by) VALUES ($1, $2, 'company', $3, ARRAY['send_email'], 0.5, 'ana') RETURNING id", [T, def, CO_A])).id;
  assert.match(await refusal(db, "SELECT public.agent_action_request($1, $2, 'send_email', $3, NULL, 'email', $4, $5::jsonb, 'agent', 'agent:x', NULL, 'idem-scope-0001', NULL)", [T, narrow, CO_B, EMAIL, JSON.stringify(plan())]), /not assigned this company or campaign/);
  assert.ok((await request(db, narrow, { company: CO_A, idem: "idem-scope-0002" })).rows[0].id);
  await db.query("UPDATE public.agent_assignments SET revoked_at = now(), revoked_by = 'ana', revoke_reason = 'No longer needed' WHERE id = $1", [narrow]);
  assert.match(await refusal(db, "SELECT public.agent_action_request($1, $2, 'send_email', $3, NULL, 'email', $4, $5::jsonb, 'agent', 'agent:x', NULL, 'idem-scope-0003', NULL)", [T, narrow, CO_A, EMAIL2, JSON.stringify(plan())]), /revoked, expired/);
});

test("asking twice with the same key returns the same action; a second action on the same target is refused", async () => {
  const db = await world();
  const asg = await assignmentOf(db, "outreach-agent");
  const a = (await request(db, asg)).rows[0].id;
  assert.equal((await request(db, asg)).rows[0].id, a, "same key, same action");
  assert.match(await refusal(db, "SELECT public.agent_action_request($1, $2, 'send_email', $3, NULL, 'email', $4, $5::jsonb, 'agent', 'agent:x', NULL, 'a-different-key-01', NULL)", [T, asg, CO_A, EMAIL, JSON.stringify(plan())]), /DUPLICATE/);
  assert.equal(((await db.query("SELECT count(*)::int n FROM public.agent_actions")).rows[0] as any).n, 1);
  const h = await val(db, "SELECT plan_hash FROM public.agent_actions WHERE id = $1", [a]);
  assert.match(h.plan_hash, /^[0-9a-f]{64}$/);
});

test("only the database functions can create an action or write its history; a plan cannot be changed", async () => {
  const db = await world();
  const asg = await assignmentOf(db, "outreach-agent");
  const id = (await request(db, asg)).rows[0].id;
  assert.match(await refusal(db, "UPDATE public.agent_actions SET state = 'authorized' WHERE id = $1", [id]), /moves only through agent_action_transition/);
  assert.match(await refusal(db, "INSERT INTO public.agent_action_events (tenant_id, action_id, to_state, actor_kind, actor_id) VALUES ($1, $2, 'authorized', 'human', 'x')", [T, id]), /written only by agent_action_transition/);
  assert.match(await refusal(db, "INSERT INTO public.agent_actions (tenant_id, definition_id, version_id, assignment_id, effect, target_type, target_id, plan, plan_hash, requested_by_kind, requested_by, idem_key) SELECT tenant_id, definition_id, version_id, assignment_id, effect, 'email', gen_random_uuid(), plan, plan_hash, 'agent', 'x', 'forged-key-0001' FROM public.agent_actions"), /created through agent_action_request/);
  assert.match(await refusal(db, "UPDATE public.agent_action_events SET detail = '{}'"), /immutable|written only/);
  assert.match(await refusal(db, "DELETE FROM public.agent_actions WHERE id = $1", [id]), /cannot be deleted/);
  // a function call cannot slip a changed plan through either
  await db.exec("SELECT set_config('app.agent_tx', 'on', false)");
  assert.match(await refusal(db, "UPDATE public.agent_actions SET plan = '{\"tools\":[\"other\"]}'::jsonb WHERE id = $1", [id]), /cannot be changed after it is made/);
  await db.exec("SELECT set_config('app.agent_tx', 'off', false)");
});

// ── the state machine ───────────────────────────────────────────────────────

test("an email goes planned, validated, awaiting approval, authorized, executing, accepted, reconciled, in that order", async () => {
  const db = await world();
  const { id } = await toAwaiting(db);
  await approve(db, id);
  await move(db, id, "executing", "service", "service:e", null, { payload_hash: (await val(db, "SELECT plan_hash FROM public.agent_actions WHERE id = $1", [id])).plan_hash });
  await move(db, id, "provider_accepted", "service", "service:e", null, { provider_ref: "pipedrive-activity-91" });
  await move(db, id, "reconciled", "service", "service:e", null, { reconciled_by: "provider" });
  const ev = (await db.query("SELECT from_state, to_state, actor_kind FROM public.agent_action_events WHERE action_id = $1 ORDER BY seq", [id])).rows as any[];
  assert.deepEqual(ev.map((e) => e.to_state), ["planned", "validated", "awaiting_approval", "authorized", "executing", "provider_accepted", "reconciled"]);
  assert.deepEqual(ev.map((e) => e.from_state), [null, "planned", "validated", "awaiting_approval", "authorized", "executing", "provider_accepted"]);
  assert.equal(ev[3].actor_kind, "approver");
  assert.equal(await state(db, id), "reconciled");
});

test("no step can be skipped, repeated or reversed", async () => {
  const db = await world();
  const asg = await assignmentOf(db, "outreach-agent");
  const id = (await request(db, asg)).rows[0].id;
  for (const to of ["awaiting_approval", "authorized", "executing", "provider_accepted", "reconciled", "uncertain", "blocked"]) {
    assert.match(await refusal(db, "SELECT public.agent_action_transition($1, $2, 'service', 'service:t', NULL, '{}'::jsonb)", [id, to]), /STATE: an action that is planned cannot become/, to);
  }
  await move(db, id, "validated", "service", "service:t", null, { gates: { a: 1 } });
  assert.match(await refusal(db, "SELECT public.agent_action_transition($1, 'validated', 'service', 'service:t', NULL, '{\"gates\":{}}'::jsonb)", [id]), /STATE/);
  assert.match(await refusal(db, "SELECT public.agent_action_transition($1, 'authorized', 'human', 'u1', 'bia@club.com', '{}'::jsonb)", [id]), /has to be approved by a person before it is authorized/, "validated cannot jump to authorized for an effect that needs approval");
  assert.match(await refusal(db, "SELECT public.agent_action_transition($1, 'validated', 'service', 'x', NULL, '{}'::jsonb)", [id]), /STATE/);
  await move(db, id, "cancelled", "human", "u1", "ana@club.com", {});
  for (const to of ["validated", "awaiting_approval", "authorized", "executing", "failed", "reconciled"]) {
    assert.match(await refusal(db, "SELECT public.agent_action_transition($1, $2, 'service', 'service:t', NULL, '{\"gates\":{}}'::jsonb)", [id, to]), /STATE: an action that is cancelled/, to);
  }
  assert.match(await refusal(db, "SELECT public.agent_action_transition($1, 'validated', 'service', 'x', NULL, '{}'::jsonb)", [gen()]), /action not found/);
});
const gen = () => "00000000-0000-4000-8000-000000000999";

test("validation records its checks; blocking, uncertain and provider acceptance each record why", async () => {
  const db = await world();
  const asg = await assignmentOf(db, "outreach-agent");
  const id = (await request(db, asg)).rows[0].id;
  assert.match(await refusal(db, "SELECT public.agent_action_transition($1, 'validated', 'service', 's', NULL, '{}'::jsonb)", [id]), /records the checks/);
  await move(db, id, "validated", "service", "s", null, { gates: { ok: true } });
  await move(db, id, "awaiting_approval", "service", "s");
  await approve(db, id);
  const hash = (await val(db, "SELECT plan_hash FROM public.agent_actions WHERE id = $1", [id])).plan_hash;
  await move(db, id, "executing", "service", "s", null, { payload_hash: hash });
  assert.match(await refusal(db, "SELECT public.agent_action_transition($1, 'provider_accepted', 'service', 's', NULL, '{}'::jsonb)", [id]), /provider's reference/);
  assert.match(await refusal(db, "SELECT public.agent_action_transition($1, 'uncertain', 'service', 's', NULL, '{}'::jsonb)", [id]), /says why/);
  assert.match(await refusal(db, "SELECT public.agent_action_transition($1, 'failed', 'service', 's', NULL, '{}'::jsonb)", [id]), /provider's refusal/);
});

// ── who may approve ─────────────────────────────────────────────────────────

test("only a person with standing can approve: not an agent, not the requester, not a sales rep, not someone who left", async () => {
  const db = await world();
  const { id } = await toAwaiting(db);
  assert.match(await approve(db, id, "bia@club.com", "agent").catch((e: Error) => { throw e; }).then(() => "no", (e: Error) => e.message), /only a person can approve/);
  assert.match(await refusal(db, "SELECT public.agent_action_transition($1, 'authorized', 'human', 'agent:outreach-agent@v1', 'bia@club.com', '{}'::jsonb)", [id]), /requester cannot approve their own action/);
  assert.match(await refusal(db, "SELECT public.agent_action_transition($1, 'authorized', 'human', 'u1', 'cid@club.com', '{}'::jsonb)", [id]), /not an active member of the club who may approve this/, "a sales rep may draft but not send");
  assert.match(await refusal(db, "SELECT public.agent_action_transition($1, 'authorized', 'approver', 'u2', 'dan@club.com', '{}'::jsonb)", [id]), /not an active member/, "dan was deactivated");
  assert.match(await refusal(db, "SELECT public.agent_action_transition($1, 'authorized', 'approver', 'u2', 'stranger@elsewhere.com', '{}'::jsonb)", [id]), /not an active member/);
  assert.match(await refusal(db, "SELECT public.agent_action_transition($1, 'authorized', 'approver', 'u2', 'zed@other.com', '{}'::jsonb)", [id]), /not an active member/, "an approver of another club");
  assert.match(await refusal(db, "SELECT public.agent_action_transition($1, 'authorized', 'approver', 'u2', NULL, '{}'::jsonb)", [id]), /not an active member/);
  assert.equal(await state(db, id), "awaiting_approval");
  await approve(db, id, "bia@club.com");
  assert.equal(await state(db, id), "authorized");
});

test("a plan assigned to one reviewer is approved by that reviewer or an administrator, not by another approver", async () => {
  const db = await world();
  await db.query("UPDATE public.platform_users SET role = 'approver' WHERE email = 'eve@club.com'");
  await db.query("INSERT INTO public.platform_users (tenant_id, email, role, is_active) VALUES ($1, 'fay@club.com', 'approver', true)", [T]);
  const { id } = await toAwaiting(db, { reviewer: "bia@club.com" });
  assert.match(await approve(db, id, "fay@club.com").then(() => "no", (e: Error) => e.message), /assigned to another reviewer/);
  await approve(db, id, "ana@club.com");
  assert.equal(await state(db, id), "authorized", "an administrator can step in");
  const { id: id2 } = await toAwaiting(db, { reviewer: "bia@club.com", target: EMAIL2, idem: "idem-key-0002" });
  await approve(db, id2, "bia@club.com");
  assert.equal(await state(db, id2), "authorized");
});

// ── execution rechecks ──────────────────────────────────────────────────────

const hashOf = async (db: any, id: string) => (await val(db, "SELECT plan_hash FROM public.agent_actions WHERE id = $1", [id])).plan_hash as string;

test("an approver who has left cannot have their approval acted on", async () => {
  const db = await world();
  const { id } = await toAwaiting(db);
  await approve(db, id, "bia@club.com");
  await db.query("UPDATE public.platform_users SET is_active = false WHERE email = 'bia@club.com'");
  assert.match(await refusal(db, "SELECT public.agent_action_transition($1, 'executing', 'service', 's', NULL, $2::jsonb)", [id, JSON.stringify({ payload_hash: await hashOf(db, id) })]), /STANDING: the person who approved this no longer has standing/);
  assert.equal(await state(db, id), "authorized", "nothing started");
});

test("a role removed after approval also ends it", async () => {
  const db = await world();
  const { id } = await toAwaiting(db);
  await approve(db, id, "bia@club.com");
  await db.query("UPDATE public.platform_users SET role = 'viewer' WHERE email = 'bia@club.com'");
  assert.match(await refusal(db, "SELECT public.agent_action_transition($1, 'executing', 'service', 's', NULL, $2::jsonb)", [id, JSON.stringify({ payload_hash: await hashOf(db, id) })]), /STANDING/);
});

test("revoking the assignment, or replacing the version, after approval stops the action before it runs", async () => {
  for (const mode of ["revoke", "newversion"]) {
    const db = await world();
    const { id } = await toAwaiting(db);
    await approve(db, id);
    const def = (await val(db, "SELECT id FROM public.agent_definitions WHERE key = 'outreach-agent'")).id;
    if (mode === "revoke") await db.query("UPDATE public.agent_assignments SET revoked_at = now(), revoked_by = 'ana', revoke_reason = 'Stop this agent now' WHERE definition_id = $1", [def]);
    else {
      const v2 = (await val(db, "INSERT INTO public.agent_versions (tenant_id, definition_id, version, effects, max_cost_usd, created_by) VALUES ($1, $2, 2, ARRAY['draft_email', 'send_email'], 0.8, 'ana') RETURNING id", [T, def])).id;
      await db.query("SELECT public.agent_version_promote($1, 'human', 'ana@club.com', '{\"reviewed\":true}'::jsonb)", [v2]);
    }
    assert.match(await refusal(db, "SELECT public.agent_action_transition($1, 'executing', 'service', 's', NULL, $2::jsonb)", [id, JSON.stringify({ payload_hash: await hashOf(db, id) })]), /REVOKED/, mode);
    assert.equal(await state(db, id), "authorized");
  }
});

test("what is about to run must be exactly the plan that was approved", async () => {
  const db = await world();
  const { id } = await toAwaiting(db);
  await approve(db, id);
  assert.match(await refusal(db, "SELECT public.agent_action_transition($1, 'executing', 'service', 's', NULL, '{\"payload_hash\":\"deadbeef\"}'::jsonb)", [id]), /CHANGED: what is about to run is not the plan that was approved/);
  assert.match(await refusal(db, "SELECT public.agent_action_transition($1, 'executing', 'service', 's', NULL, '{}'::jsonb)", [id]), /CHANGED/);
  // even a plan edited behind the functions' backs is caught at execution
  await db.exec("ALTER TABLE public.agent_actions DISABLE TRIGGER USER");
  await db.query("UPDATE public.agent_actions SET plan = jsonb_set(plan, '{inputs,email_id}', '\"someone-elses-email\"') WHERE id = $1", [id]);
  await db.exec("ALTER TABLE public.agent_actions ENABLE TRIGGER USER");
  assert.match(await refusal(db, "SELECT public.agent_action_transition($1, 'executing', 'service', 's', NULL, $2::jsonb)", [id, JSON.stringify({ payload_hash: await hashOf(db, id) })]), /CHANGED/);
});

test("an approval older than a day is stale and must be given again", async () => {
  const db = await world();
  const { id } = await toAwaiting(db);
  await approve(db, id);
  await db.exec("ALTER TABLE public.agent_action_events DISABLE TRIGGER USER");
  await db.query("UPDATE public.agent_action_events SET created_at = now() - interval '25 hours' WHERE action_id = $1 AND to_state = 'authorized'", [id]);
  await db.exec("ALTER TABLE public.agent_action_events ENABLE TRIGGER USER");
  assert.match(await refusal(db, "SELECT public.agent_action_transition($1, 'executing', 'service', 's', NULL, $2::jsonb)", [id, JSON.stringify({ payload_hash: await hashOf(db, id) })]), /STALE/);
});

test("execution can be claimed once", async () => {
  const db = await world();
  const { id } = await toAwaiting(db);
  await approve(db, id);
  const body = JSON.stringify({ payload_hash: await hashOf(db, id) });
  await db.query("SELECT public.agent_action_transition($1, 'executing', 'service', 's', NULL, $2::jsonb)", [id, body]);
  assert.match(await refusal(db, "SELECT public.agent_action_transition($1, 'executing', 'service', 's2', NULL, $2::jsonb)", [id, body]), /STATE: an action that is executing cannot become executing/);
  assert.equal(((await db.query("SELECT count(*)::int n FROM public.agent_action_events WHERE action_id = $1 AND to_state = 'executing'", [id])).rows[0] as any).n, 1);
});

// ── uncertainty, reconciliation, retry ──────────────────────────────────────

async function toExecuting(db: any, o: Record<string, unknown> = {}) {
  const { id } = await toAwaiting(db, o);
  await approve(db, id);
  await db.query("SELECT public.agent_action_transition($1, 'executing', 'service', 's', NULL, $2::jsonb)", [id, JSON.stringify({ payload_hash: await hashOf(db, id) })]);
  return id;
}

test("an outcome nobody knows is uncertain, and an uncertain action is never run again", async () => {
  const db = await world();
  const id = await toExecuting(db);
  await move(db, id, "uncertain", "service", "s", null, { reason: "Timed out after the request was sent" });
  for (const to of ["executing", "authorized", "awaiting_approval", "provider_accepted", "validated"]) {
    assert.match(await refusal(db, "SELECT public.agent_action_transition($1, $2, 'service', 's', NULL, '{\"payload_hash\":\"x\"}'::jsonb)", [id, to]), /STATE: an action that is uncertain/, to);
  }
  assert.match(await refusal(db, "SELECT public.agent_action_transition($1, 'reconciled', 'service', 'service:auto', NULL, '{\"evidence\":{\"ref\":\"x\"}}'::jsonb)", [id]), /reconciled by a person, with evidence/);
  assert.match(await refusal(db, "SELECT public.agent_action_transition($1, 'reconciled', 'human', 'u1', 'ana@club.com', '{}'::jsonb)", [id]), /reconciled by a person, with evidence/);
  assert.match(await refusal(db, "SELECT public.agent_action_transition($1, 'failed', 'human', 'u1', 'ana@club.com', '{\"evidence\":{\"checked\":\"sent folder\"}}'::jsonb)", [id]), /confirms, with evidence, that nothing went out/);
  assert.match(await refusal(db, "SELECT public.agent_action_transition($1, 'failed', 'service', 's', NULL, '{\"confirmed_not_sent\":true,\"evidence\":{\"a\":1}}'::jsonb)", [id]), /confirms, with evidence/);
});

test("a person settles an uncertain outcome with evidence; only a failed action can be tried again, as a new action", async () => {
  const db = await world();
  const id = await toExecuting(db);
  await move(db, id, "uncertain", "service", "s", null, { reason: "Process stopped mid-call" });
  const asg = await assignmentOf(db, "outreach-agent");
  assert.match(await refusal(db, "SELECT public.agent_action_request($1, $2, 'send_email', $3, NULL, 'email', $4, $5::jsonb, 'agent', 'agent:x', NULL, 'idem-retry-0001', $6)", [T, asg, CO_A, EMAIL, JSON.stringify(plan()), id]), /RETRY: only a failed action can be tried again \(this one is uncertain\)/);
  await move(db, id, "failed", "human", "u1", "ana@club.com", { confirmed_not_sent: true, evidence: { checked: "Gmail sent folder, 8 Oct", found: "nothing" } });
  const again = ((await db.query("SELECT public.agent_action_request($1, $2, 'send_email', $3, NULL, 'email', $4, $5::jsonb, 'agent', 'agent:x', NULL, 'idem-retry-0002', $6) AS id", [T, asg, CO_A, EMAIL, JSON.stringify(plan()), id])).rows[0] as any).id;
  assert.notEqual(again, id);
  assert.equal(await state(db, again), "planned");
  assert.equal((await val(db, "SELECT retry_of FROM public.agent_actions WHERE id = $1", [again])).retry_of, id);
  assert.match(await refusal(db, "SELECT public.agent_action_request($1, $2, 'send_email', $3, NULL, 'email', $4, $5::jsonb, 'agent', 'agent:x', NULL, 'idem-retry-0003', $6)", [T, asg, CO_A, EMAIL2, JSON.stringify(plan()), id]), /not an earlier attempt of this action/);
});

test("an uncertain outcome that did go out is reconciled with evidence, and then the email cannot be sent a second time", async () => {
  const db = await world();
  const id = await toExecuting(db);
  await move(db, id, "uncertain", "service", "s", null, { reason: "Timed out" });
  await move(db, id, "reconciled", "human", "u1", "ana@club.com", { outcome: "sent", evidence: { found: "message in the sent folder", at: "2026-10-08T10:02" } });
  assert.equal(await state(db, id), "reconciled");
  const asg = await assignmentOf(db, "outreach-agent");
  assert.match(await refusal(db, "SELECT public.agent_action_request($1, $2, 'send_email', $3, NULL, 'email', $4, $5::jsonb, 'agent', 'agent:x', NULL, 'idem-second-send1', NULL)", [T, asg, CO_A, EMAIL, JSON.stringify(plan())]), /DUPLICATE/);
});

test("a process that died mid-execution is found and marked uncertain, and nothing else is touched", async () => {
  const db = await world();
  const stuck = await toExecuting(db, { target: EMAIL, idem: "idem-stuck-0001" });
  const fresh = await toExecuting(db, { target: EMAIL2, idem: "idem-fresh-0001" });
  await db.exec("ALTER TABLE public.agent_actions DISABLE TRIGGER USER");
  await db.query("UPDATE public.agent_actions SET state_changed_at = now() - interval '30 minutes' WHERE id = $1", [stuck]);
  await db.exec("ALTER TABLE public.agent_actions ENABLE TRIGGER USER");
  assert.equal((await val(db, "SELECT public.agent_actions_sweep_stuck(10) AS n")).n, 1);
  assert.equal(await state(db, stuck), "uncertain");
  assert.equal(await state(db, fresh), "executing");
  assert.equal((await val(db, "SELECT public.agent_actions_sweep_stuck(10) AS n")).n, 0, "a second sweep finds nothing new");
  const e = (await db.query("SELECT actor_id, detail FROM public.agent_action_events WHERE action_id = $1 AND to_state = 'uncertain'", [stuck])).rows[0] as any;
  assert.equal(e.actor_id, "service:sweeper");
  assert.match(e.detail.reason, /not known whether it went out/);
});

// ── blocked approvals ───────────────────────────────────────────────────────

test("when the reviewer has left, the approval is blocked with a reason and an escalation, and only a reassignment frees it", async () => {
  const db = await world();
  const { id } = await toAwaiting(db, { reviewer: "dan@club.com" });
  assert.match(await refusal(db, "SELECT public.agent_action_transition($1, 'blocked', 'service', 's', NULL, '{\"reason\":\"no\"}'::jsonb)", [id]), /says why/);
  assert.match(await refusal(db, "SELECT public.agent_action_transition($1, 'blocked', 'service', 's', NULL, '{\"reason\":\"Reviewer left the club\"}'::jsonb)", [id]), /names who it escalates to/);
  assert.match(await refusal(db, "SELECT public.agent_action_transition($1, 'blocked', 'service', 's', NULL, '{\"reason\":\"Reviewer left the club\",\"escalate_to\":\"cid@club.com\"}'::jsonb)", [id]), /escalated to an active administrator/);
  await move(db, id, "blocked", "service", "service:recovery", null, { reason: "Reviewer dan@club.com is no longer active", escalate_to: "Ana@Club.com" });
  assert.equal(await state(db, id), "blocked");
  const b = (await db.query("SELECT reviewer_email, escalated_to, status, reason FROM public.approval_blocks WHERE subject_id = $1", [id])).rows[0] as any;
  assert.deepEqual([b.reviewer_email, b.escalated_to, b.status], ["dan@club.com", "ana@club.com", "open"]);
  assert.match(await approve(db, id, "bia@club.com").then(() => "no", (e: Error) => e.message), /STATE: an action that is blocked cannot become authorized/, "blocked cannot be approved directly");
  assert.match(await refusal(db, "SELECT public.agent_action_transition($1, 'awaiting_approval', 'human', 'u1', 'ana@club.com', '{\"new_reviewer_email\":\"dan@club.com\"}'::jsonb)", [id]), /dan@club.com cannot approve this/);
  assert.match(await refusal(db, "SELECT public.agent_action_transition($1, 'awaiting_approval', 'human', 'u1', 'ana@club.com', '{\"new_reviewer_email\":\"cid@club.com\"}'::jsonb)", [id]), /cannot approve this/);
  await move(db, id, "awaiting_approval", "human", "u1", "ana@club.com", { new_reviewer_email: "bia@club.com", note: "Reassigned to Bia" });
  assert.equal(await state(db, id), "awaiting_approval");
  assert.equal((await val(db, "SELECT status, resolution FROM public.approval_blocks WHERE subject_id = $1", [id])).resolution, "reassigned");
  assert.equal((await val(db, "SELECT reviewer_email FROM public.agent_actions WHERE id = $1", [id])).reviewer_email, "bia@club.com");
  await approve(db, id, "bia@club.com");
  assert.equal(await state(db, id), "authorized");
});

test("a blocked approval can be cancelled, and with nobody left to approve it cannot be reassigned", async () => {
  const db = await world();
  const { id } = await toAwaiting(db);
  await move(db, id, "blocked", "service", "s", null, { reason: "Nobody active can approve", escalate_to: "ana@club.com" });
  await db.query("UPDATE public.platform_users SET is_active = false WHERE role = 'approver' OR email = 'eve@club.com'");
  await db.query("UPDATE public.platform_users SET role = 'sales_rep' WHERE email = 'ana@club.com'");
  assert.match(await refusal(db, "SELECT public.agent_action_transition($1, 'awaiting_approval', 'human', 'u1', 'ana@club.com', '{}'::jsonb)", [id]), /nobody in the club can approve this/);
  await move(db, id, "cancelled", "human", "u1", "ana@club.com", { note: "Cancelled; no approver left" });
  assert.equal(await state(db, id), "cancelled");
  assert.equal((await val(db, "SELECT resolution FROM public.approval_blocks WHERE subject_id = $1", [id])).resolution, "cancelled");
  assert.match(await refusal(db, "UPDATE public.approval_blocks SET resolution_note = 'again'"), /can only be resolved, once/);
  assert.match(await refusal(db, "DELETE FROM public.approval_blocks"), /cannot be deleted/);
});

test("run blocks (an agent run paused for a reviewer who left) follow the same rules", async () => {
  const db = await world();
  const run = "dddddddd-0000-4000-8000-0000000000d1";
  assert.match(await refusal(db, "INSERT INTO public.approval_blocks (tenant_id, subject_type, subject_id, reviewer_email, reason, escalated_to) VALUES ($1, 'agent_run', $2, 'dan@club.com', 'Reviewer left the club', 'cid@club.com')", [T, run]), /active administrator/);
  await db.query("INSERT INTO public.approval_blocks (tenant_id, subject_type, subject_id, reviewer_email, reason, escalated_to) VALUES ($1, 'agent_run', $2, 'dan@club.com', 'Reviewer left the club', 'ana@club.com')", [T, run]);
  assert.match(await refusal(db, "INSERT INTO public.approval_blocks (tenant_id, subject_type, subject_id, reviewer_email, reason, escalated_to) VALUES ($1, 'agent_run', $2, 'dan@club.com', 'Reviewer left the club again', 'ana@club.com')", [T, run]), /uq_approval_blocks_open/, "one open block per run");
  await db.query("UPDATE public.approval_blocks SET status = 'resolved', resolved_at = now(), resolved_by = 'ana@club.com', resolution = 'reassigned' WHERE subject_id = $1", [run]);
  assert.equal((await val(db, "SELECT status FROM public.approval_blocks WHERE subject_id = $1", [run])).status, "resolved");
});

// ── batch gating ────────────────────────────────────────────────────────────

test("a batch outside the review-size or cost limits cannot be recorded as accepted", async () => {
  const db = await world();
  const ins = (decision: string, items: number, est: number, max = 10, ceil = 5, reason: string | null = null) =>
    db.query("INSERT INTO public.batch_decisions (tenant_id, kind, requested_by, items, per_item_estimate_usd, estimated_cost_usd, max_items, ceiling_usd, decision, reason) VALUES ($1, 'outreach', 'ana@club.com', $2, 0.1, $3, $4, $5, $6, $7)", [T, items, est, max, ceil, decision, reason]);
  await ins("accepted", 10, 1.0);
  await ins("accepted", 10, 5.0);
  assert.match(await refusal(db, "INSERT INTO public.batch_decisions (tenant_id, kind, requested_by, items, per_item_estimate_usd, estimated_cost_usd, max_items, ceiling_usd, decision) VALUES ($1, 'outreach', 'ana', 11, 0.1, 1.1, 10, 5, 'accepted')", [T]), /batch_decisions_limits_chk/);
  assert.match(await refusal(db, "INSERT INTO public.batch_decisions (tenant_id, kind, requested_by, items, per_item_estimate_usd, estimated_cost_usd, max_items, ceiling_usd, decision) VALUES ($1, 'outreach', 'ana', 5, 2, 10, 10, 5, 'accepted')", [T]), /batch_decisions_limits_chk/);
  await ins("refused", 11, 1.1, 10, 5, "Too many to review at once: 11 (the limit is 10)");
  assert.match(await refusal(db, "INSERT INTO public.batch_decisions (tenant_id, kind, requested_by, items, per_item_estimate_usd, estimated_cost_usd, max_items, ceiling_usd, decision) VALUES ($1, 'outreach', 'ana', 11, 0.1, 1.1, 10, 5, 'refused')", [T]), /batch_decisions_reason_chk/);
  assert.match(await refusal(db, "UPDATE public.batch_decisions SET decision = 'accepted'"), /immutable/);
  assert.match(await refusal(db, "DELETE FROM public.batch_decisions"), /cannot be deleted/);
  assert.match(await refusal(db, "INSERT INTO public.batch_limits (tenant_id, max_review_batch, max_batch_cost_usd, updated_by) VALUES ($1, 500, 5, 'ana')", [T]), /violates check/);
});

test("the state machine and its helpers are for the server only", async () => {
  const db = await world();
  for (const fn of ["public.agent_action_transition(uuid, text, text, text, text, jsonb)", "public.agent_action_request(uuid, uuid, text, uuid, uuid, text, uuid, jsonb, text, text, text, text, uuid)", "public.approval_standing(uuid, text, text[])", "public.agent_actions_sweep_stuck(integer)", "public.agent_action_get(uuid)"]) {
    assert.equal((await val(db, "SELECT has_function_privilege('authenticated', $1, 'execute') AS ok", [fn])).ok, false, `authenticated: ${fn}`);
    assert.equal((await val(db, "SELECT has_function_privilege('anon', $1, 'execute') AS ok", [fn])).ok, false, `anon: ${fn}`);
    assert.equal((await val(db, "SELECT has_function_privilege('service_role', $1, 'execute') AS ok", [fn])).ok, true, `service_role: ${fn}`);
  }
});

test("both migrations pasted as one script run clean, and twice", async () => {
  const fs = await import("node:fs");
  const path = await import("node:path");
  const sql = MIG.map((m) => fs.readFileSync(path.resolve(__dirname, "../../../supabase/migrations", m), "utf8")).join("\n\n");
  const db = await freshDb([], { seed });
  await db.exec(sql);
  await db.exec(sql);
  assert.equal((await val(db, "SELECT count(*)::int n FROM public.agent_assignments WHERE grandfathered")).n, 6, "the second run registered nothing new");
});
