import assert from "node:assert/strict";
import test from "node:test";
import { freshDb } from "./harness";
import { pgClient } from "../helpers/pg-from";
import { runEvaluation } from "../../lib/evals/runner";
import { acceptBaseline, evalBudget, evalSpend, getRun, listRuns, loadBaselines, recordRun } from "../../lib/evals/store";
import { promoteWithGate } from "../../lib/evals/promotion";
import { faithful, gullible } from "../helpers/fake-models";

const MIG = ["0069_identity_tombstones_idempotency.sql", "0070_agent_governance.sql", "0071_tombstones_full_undo.sql", "0072_langgraph_runtime.sql"];
const T = "00000000-0000-0000-0000-000000000001";
const PV = "v-test-1";
const human = { kind: "human" as const, id: "ana@club.com" };

async function world() {
  const db = await freshDb(MIG);
  const sb = pgClient(db);
  const def = (await db.query("SELECT id FROM public.agent_definitions WHERE tenant_id = $1 AND key = 'negotiation-agent'", [T])).rows[0] as any;
  const v1 = (await db.query("SELECT id FROM public.agent_versions WHERE definition_id = $1 AND version = 1", [def.id])).rows[0] as any;
  const v2 = (await db.query("INSERT INTO public.agent_versions (tenant_id, definition_id, version, effects, max_cost_usd, created_by, notes) VALUES ($1, $2, 2, ARRAY['draft_email'], 0.25, 'ana', 'New wording') RETURNING id", [T, def.id])).rows[0] as any;
  const evaluate = async (model: Parameters<typeof runEvaluation>[0]["model"], opts: { versionId?: string; promptVersion?: string } = {}) => {
    const baselines = await loadBaselines(sb, T, "negotiation-agent");
    assert.ok(baselines.ok);
    const report = await runEvaluation({
      sb, agentKey: "negotiation-agent", version: { id: opts.versionId ?? v2.id, version: 2, max_cost_usd: 0.25, model: null }, promptVersion: opts.promptVersion ?? PV, model,
      baselines: baselines.value, budget: { perRunUsd: 4, remainingUsd: 15 },
    });
    const saved = await recordRun(sb, { tenantId: T, definitionId: def.id, versionId: opts.versionId ?? v2.id, report, startedBy: "ana@club.com", startedAt: new Date().toISOString(), config: { model: null } });
    assert.ok(saved.ok, JSON.stringify(saved));
    return { report, runId: (saved as { value: { id: string } }).value.id };
  };
  return { db, sb, def, v1, v2, evaluate };
}

test("the live probes all pass against the deployed rules, and the whole evaluation passes for a faithful model", async () => {
  const { evaluate } = await world();
  const { report } = await evaluate(faithful());
  const failed = report.gates.flatMap((g) => g.results.filter((r) => !r.passed).map((r) => `${r.id}: ${r.detail}`));
  assert.deepEqual(failed, []);
  assert.equal(report.status, "passed");
  assert.deepEqual(report.gates.map((g) => g.gate), ["injection_resistance", "isolation", "permissions", "cost_regression", "quality_regression"]);
  const perm = report.gates.find((g) => g.gate === "permissions")!;
  assert.ok(perm.cases >= 25, `the permission gate ran ${perm.cases} checks, including the ones in code`);
  assert.ok(perm.results.some((r) => r.id === "perm.recipient_changed_after_approval" && r.kind === "static"));
  assert.ok(perm.results.some((r) => r.id === "perm.revoked_credentials" && r.kind === "probe"));
});

test("a version goes live on its passing evaluation, and the evidence of why is recorded with the promotion", async () => {
  const { db, sb, def, v2, evaluate } = await world();
  const { runId } = await evaluate(faithful());
  const early = await promoteWithGate(sb, T, "negotiation-agent", 2, {}, human, PV);
  assert.ok(!early.ok && early.status === 400 && /passing evaluation|written override/.test(early.error));
  const done = await promoteWithGate(sb, T, "negotiation-agent", 2, { evalRunId: runId }, human, PV);
  assert.ok(done.ok && done.value.basis === "evaluation", JSON.stringify(done));
  assert.equal(((await db.query("SELECT public.agent_active_version($1) AS v", [def.id])).rows[0] as any).v, v2.id, "version 2 is live and version 1 was retired");
  const ev = (await db.query("SELECT evidence, actor_id FROM public.agent_version_events WHERE version_id = $1 AND event_type = 'promoted'", [v2.id])).rows[0] as any;
  assert.equal(ev.evidence.eval_run_id, runId);
  assert.equal(ev.evidence.gates.length, 5);
  assert.equal(ev.actor_id, "ana@club.com");
});

test("a version that failed its evaluation cannot go live on it, and nothing but a written override gets around that", async () => {
  const { db, sb, def, v1, evaluate } = await world();
  const { report, runId } = await evaluate(gullible());
  assert.equal(report.status, "failed");
  const run = await getRun(sb, T, runId);
  assert.ok(run.ok && run.value.status === "failed");
  const blocked = await promoteWithGate(sb, T, "negotiation-agent", 2, { evalRunId: runId }, human, PV);
  assert.ok(!blocked.ok && blocked.status === 409 && /did not pass/.test(blocked.error));
  const short = await promoteWithGate(sb, T, "negotiation-agent", 2, { overrideReason: "later" }, human, PV);
  assert.ok(!short.ok && short.status === 400);
  assert.equal(((await db.query("SELECT public.agent_active_version($1) AS v", [def.id])).rows[0] as any).v, v1.id, "the old version is still live");
  const forced = await promoteWithGate(sb, T, "negotiation-agent", 2, { overrideReason: "Deadline fix for the Ouro sponsor; Bia reviewed the diff" }, human, PV);
  assert.ok(forced.ok && forced.value.basis === "override");
});

test("an evaluation of the wrong version, or made with older prompts, does not count", async () => {
  const { sb, v1, evaluate } = await world();
  const forV1 = await evaluate(faithful(), { versionId: v1.id });
  const wrong = await promoteWithGate(sb, T, "negotiation-agent", 2, { evalRunId: forV1.runId }, human, PV);
  assert.ok(!wrong.ok && /different version/.test(wrong.error));
  const old = await evaluate(faithful(), { promptVersion: "v-old" });
  const stale = await promoteWithGate(sb, T, "negotiation-agent", 2, { evalRunId: old.runId }, human, PV);
  assert.ok(!stale.ok && stale.status === 409 && /prompts have changed since this evaluation \(v-old, now v-test-1\)/.test(stale.error));
  const missing = await promoteWithGate(sb, T, "negotiation-agent", 2, { evalRunId: "00000000-0000-4000-8000-0000000000ff" }, human, PV);
  assert.ok(!missing.ok && missing.status === 404);
});

test("accepting a passing run as the reference makes the next version's cost and quality count against it", async () => {
  const { sb, evaluate } = await world();
  const first = await evaluate(faithful({ inputTokens: 1500, outputTokens: 400 }));
  assert.equal(first.report.status, "passed");
  const failedRun = await evaluate(gullible());
  const refused = await acceptBaseline(sb, T, failedRun.runId, "ana@club.com");
  assert.ok(!refused.ok && refused.status === 409);
  assert.equal(((await acceptBaseline(sb, T, first.runId, "")) as any).status, 403);
  const accepted = await acceptBaseline(sb, T, first.runId, "ana@club.com");
  assert.ok(accepted.ok && accepted.value.cases === 18, JSON.stringify(accepted));
  const loaded = await loadBaselines(sb, T, "negotiation-agent");
  assert.ok(loaded.ok && loaded.value.size === 18 && loaded.value.get("neg.price_push")!.quality_pass === true);
  // the next version costs far more per answer: the cost gate now fails
  const next = await evaluate(faithful({ inputTokens: 5000, outputTokens: 1200 }));
  const cost = next.report.gates.find((g) => g.gate === "cost_regression")!;
  assert.ok(!cost.passed && next.report.status === "failed");
  assert.match(cost.results.find((r) => !r.passed)!.detail, /6200 tokens \(reference 1900/);
  const runs = await listRuns(sb, T, ((await sb.from("agent_eval_runs").select("version_id").limit(1)) as any).data[0].version_id);
  assert.ok(runs.ok && runs.value.length >= 3);
});

test("the evaluation budget counts what runs have cost in the window, and nothing outside it", async () => {
  const { db, sb, evaluate } = await world();
  await evaluate(faithful({ costUsd: 0.05 }));
  await evaluate(faithful({ costUsd: 0.05 }));
  const spent = await evalSpend(sb, T);
  assert.ok(spent.ok && Math.abs(spent.value.spentUsd - 3.4) < 1e-6 && spent.value.runs === 2, JSON.stringify(spent));
  assert.ok(Math.abs(spent.value.remainingUsd - (evalBudget().totalUsd - 3.4)) < 1e-6);
  const later = await evalSpend(sb, T, Date.now() + 40 * 86_400_000);
  assert.ok(later.ok && later.value.spentUsd === 0 && later.value.remainingUsd === evalBudget().totalUsd, "runs older than the window no longer count");
  void db;
});
