import assert from "node:assert/strict";
import test from "node:test";
import { freshDb, refusal } from "./harness";

const MIG = ["0069_identity_tombstones_idempotency.sql", "0070_agent_governance.sql", "0072_langgraph_runtime.sql"];
const T = "00000000-0000-0000-0000-000000000001";
const val = async (db: any, sql: string, params: unknown[] = []) => (await db.query(sql, params)).rows[0];

const probes = async (db: any) => (await val(db, "SELECT public.agent_eval_probes() AS p")).p as Array<{ id: string; gate: string; title: string; passed: boolean; detail: string }>;

test("the probes run against the live rules, every one passes, and they leave nothing behind", async () => {
  const db = await freshDb(MIG);
  const before = await val(db, "SELECT (SELECT count(*)::int FROM public.tenants) t, (SELECT count(*)::int FROM public.audit_logs) a, (SELECT count(*)::int FROM public.agent_actions) x, (SELECT count(*)::int FROM public.platform_users) u, (SELECT count(*)::int FROM public.agent_definitions) d");
  const out = await probes(db);
  const failed = out.filter((p) => !p.passed);
  assert.deepEqual(failed.map((f) => `${f.id}: ${f.detail}`), [], "every probe passes against the migrations as written");
  assert.ok(out.length >= 25, `expected the full set, saw ${out.length}`);
  assert.ok(out.every((p) => p.id && p.gate && p.title), "each says what it checked");
  assert.deepEqual(new Set(out.map((p) => p.gate)), new Set(["isolation", "permissions"]));
  const after = await val(db, "SELECT (SELECT count(*)::int FROM public.tenants) t, (SELECT count(*)::int FROM public.audit_logs) a, (SELECT count(*)::int FROM public.agent_actions) x, (SELECT count(*)::int FROM public.platform_users) u, (SELECT count(*)::int FROM public.agent_definitions) d");
  assert.deepEqual(after, before, "nothing was left behind: no tenant, user, agent, action or audit entry");
});

test("the probes can be run again and again, and are for the server only", async () => {
  const db = await freshDb(MIG);
  for (let i = 0; i < 3; i++) assert.ok((await probes(db)).every((p) => p.passed));
  const priv = await val(db, "SELECT has_function_privilege('authenticated', 'public.agent_eval_probes()', 'execute') a, has_function_privilege('service_role', 'public.agent_eval_probes()', 'execute') s");
  assert.deepEqual([priv.a, priv.s], [false, true]);
});

test("the probes really detect a broken rule: with a protection removed, the matching probe fails", async () => {
  const cases: Array<[string, string, string]> = [
    ["DROP TRIGGER trg_agent_actions_guard ON public.agent_actions", "perm.state_cannot_be_written_directly", "writing state directly"],
    ["DROP TRIGGER trg_audit_logs_immutable ON public.audit_logs", "audit.cannot_be_edited", "editing audit"],
    ["DROP TRIGGER trg_audit_logs_chain ON public.audit_logs", "audit.needs_an_actor", "unattributed audit"],
    ["DROP TRIGGER trg_agent_version_events_guard ON public.agent_version_events", "perm.promotion_needs_evaluation", "promotion gate"],
    ["ALTER TABLE public.langgraph_checkpoints DROP CONSTRAINT langgraph_checkpoints_thread_tenant_chk", "iso.run_state_other_club", "tenant prefix on run state"],
  ];
  for (const [sabotage, id, what] of cases) {
    const db = await freshDb(MIG);
    // the probes' own scaffolding needs the promotion gate to be live, so only that case removes it after setup would; here it is removed up front
    await db.exec(sabotage);
    const out = await probes(db);
    const hit = out.find((p) => p.id === id);
    // either that probe fails, or a later step could not even be set up without the protection (which also fails the gate)
    const setupBroke = out.some((p) => p.id === "probe.setup" && !p.passed);
    assert.ok(setupBroke || (hit && !hit.passed), `with ${what} removed, the probes must fail (${id}: ${hit?.detail})`);
  }
});

// ── the promotion gate ──────────────────────────────────────────────────────

async function agent(db: any) {
  const def = (await val(db, "INSERT INTO public.agent_definitions (tenant_id, key, name, runtime, created_by) VALUES ($1, 'gated-agent', 'Gated', 'service', 'ana') RETURNING id", [T])).id;
  const ver = (await val(db, "INSERT INTO public.agent_versions (tenant_id, definition_id, version, effects, max_cost_usd, created_by) VALUES ($1, $2, 1, ARRAY['draft_email'], 0.5, 'ana') RETURNING id", [T, def])).id;
  return { def, ver };
}
const run = async (db: any, def: string, ver: string, over: { status?: string; gates?: unknown } = {}) => {
  const names = ["injection_resistance", "isolation", "permissions", "cost_regression", "quality_regression"];
  const gates = over.gates ?? names.map((g) => ({ gate: g, passed: true, cases: 3 }));
  return (await val(db, "INSERT INTO public.agent_eval_runs (tenant_id, definition_id, version_id, agent_key, status, gates, started_by) VALUES ($1, $2, $3, 'gated-agent', $4, $5::jsonb, 'ana@club.com') RETURNING id", [T, def, ver, over.status ?? "passed", JSON.stringify(gates)])).id;
};

test("a version goes live only with a passing evaluation of that version, or a person's written override", async () => {
  const db = await freshDb(MIG); const { def, ver } = await agent(db);
  assert.match(await refusal(db, "SELECT public.agent_version_promote($1, 'human', 'ana@club.com', '{\"reviewed_by\": \"ana\", \"note\": \"read the prompt\"}')", [ver]), /GATE: a version goes live only with a passing evaluation/);
  const good = await run(db, def, ver);
  await db.query("SELECT public.agent_version_promote($1, 'human', 'ana@club.com', $2::jsonb)", [ver, JSON.stringify({ eval_run_id: good })]);
  assert.equal(((await val(db, "SELECT public.agent_active_version($1) AS v", [def])).v), ver);
});

test("an evaluation of another version, a failed one, or an old one does not count", async () => {
  const db = await freshDb(MIG); const { def, ver } = await agent(db);
  const ver2 = (await val(db, "INSERT INTO public.agent_versions (tenant_id, definition_id, version, effects, max_cost_usd, created_by) VALUES ($1, $2, 2, ARRAY['draft_email'], 0.5, 'ana') RETURNING id", [T, def])).id;
  const forOther = await run(db, def, ver2);
  assert.match(await refusal(db, "SELECT public.agent_version_promote($1, 'human', 'ana', $2::jsonb)", [ver, JSON.stringify({ eval_run_id: forOther })]), /not for this version/);
  const failedRun = await run(db, def, ver, { status: "failed", gates: [{ gate: "injection_resistance", passed: false, cases: 3 }] });
  assert.match(await refusal(db, "SELECT public.agent_version_promote($1, 'human', 'ana', $2::jsonb)", [ver, JSON.stringify({ eval_run_id: failedRun })]), /did not pass/);
  const old = await run(db, def, ver);
  await db.exec("ALTER TABLE public.agent_eval_runs DISABLE TRIGGER USER");
  await db.query("UPDATE public.agent_eval_runs SET finished_at = now() - interval '20 days' WHERE id = $1", [old]);
  await db.exec("ALTER TABLE public.agent_eval_runs ENABLE TRIGGER USER");
  assert.match(await refusal(db, "SELECT public.agent_version_promote($1, 'human', 'ana', $2::jsonb)", [ver, JSON.stringify({ eval_run_id: old })]), /more than 14 days old/);
  assert.match(await refusal(db, "SELECT public.agent_version_promote($1, 'human', 'ana', '{\"eval_run_id\": \"00000000-0000-4000-8000-0000000000ff\"}')", [ver]), /not for this version/);
});

test("skipping the evaluation takes a person and a written reason, and is recorded in the promotion", async () => {
  const db = await freshDb(MIG); const { ver } = await agent(db);
  assert.match(await refusal(db, "SELECT public.agent_version_promote($1, 'service', 'svc', '{\"gate_override\": \"the script said so, trust it\"}')", [ver]), /needs a person and a written reason/);
  assert.match(await refusal(db, "SELECT public.agent_version_promote($1, 'human', 'ana', '{\"gate_override\": \"later\"}')", [ver]), /needs a person and a written reason/);
  await db.query("SELECT public.agent_version_promote($1, 'human', 'ana@club.com', '{\"gate_override\": \"Urgent fix for the sponsor deadline; reviewed the diff with Bia\"}')", [ver]);
  const ev = await val(db, "SELECT evidence, actor_id FROM public.agent_version_events WHERE event_type = 'promoted' AND actor_id = 'ana@club.com'");
  assert.match(ev.evidence.gate_override, /Urgent fix/);
  assert.equal(ev.actor_id, "ana@club.com");
});

test("an evaluation run cannot be recorded as passed unless every gate ran, had cases and passed; and it can never be edited", async () => {
  const db = await freshDb(MIG); const { def, ver } = await agent(db);
  const names = ["injection_resistance", "isolation", "permissions", "cost_regression", "quality_regression"];
  assert.match(await refusal(db, "INSERT INTO public.agent_eval_runs (tenant_id, definition_id, version_id, agent_key, status, gates, started_by) VALUES ($1, $2, $3, 'g', 'passed', $4::jsonb, 'ana')", [T, def, ver, JSON.stringify(names.slice(0, 4).map((g) => ({ gate: g, passed: true, cases: 2 })))]), /missing or failed: quality_regression/);
  assert.match(await refusal(db, "INSERT INTO public.agent_eval_runs (tenant_id, definition_id, version_id, agent_key, status, gates, started_by) VALUES ($1, $2, $3, 'g', 'passed', $4::jsonb, 'ana')", [T, def, ver, JSON.stringify(names.map((g) => ({ gate: g, passed: g !== "isolation", cases: 2 })))]), /missing or failed: isolation/);
  assert.match(await refusal(db, "INSERT INTO public.agent_eval_runs (tenant_id, definition_id, version_id, agent_key, status, gates, started_by) VALUES ($1, $2, $3, 'g', 'passed', $4::jsonb, 'ana')", [T, def, ver, JSON.stringify(names.map((g) => ({ gate: g, passed: true, cases: g === "permissions" ? 0 : 2 })))]), /missing or failed: permissions/);
  const ok = await run(db, def, ver);
  await assert.rejects(() => db.query("UPDATE public.agent_eval_runs SET status = 'failed' WHERE id = $1", [ok]), /immutable/);
  await assert.rejects(() => db.query("DELETE FROM public.agent_eval_runs WHERE id = $1", [ok]), /cannot be deleted/);
});

test("a reference baseline can only come from a passing run, and is never rewritten", async () => {
  const db = await freshDb(MIG); const { def, ver } = await agent(db);
  const failed = await run(db, def, ver, { status: "failed", gates: [{ gate: "isolation", passed: false, cases: 1 }] });
  assert.match(await refusal(db, "INSERT INTO public.agent_eval_baselines (tenant_id, agent_key, case_id, input_tokens, output_tokens, cost_usd, quality_pass, eval_run_id, recorded_by) VALUES ($1, 'g', 'c1', 10, 5, 0.01, true, $2, 'ana')", [T, failed]), /only a run that passed/);
  const ok = await run(db, def, ver);
  await db.query("INSERT INTO public.agent_eval_baselines (tenant_id, agent_key, case_id, input_tokens, output_tokens, cost_usd, quality_pass, eval_run_id, recorded_by) VALUES ($1, 'g', 'c1', 10, 5, 0.01, true, $2, 'ana')", [T, ok]);
  await assert.rejects(() => db.query("UPDATE public.agent_eval_baselines SET cost_usd = 0.5"), /immutable/);
  await assert.rejects(() => db.query("DELETE FROM public.agent_eval_baselines"), /cannot be deleted/);
});
