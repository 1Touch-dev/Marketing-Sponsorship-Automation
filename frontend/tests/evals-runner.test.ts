import assert from "node:assert/strict";
import test from "node:test";
import { runEvaluation, type Baseline, type EvalContext } from "../lib/evals/runner";
import { modelCasesFor, promptVersionFor, targetsFor } from "../lib/evals/targets";
import { faithful, gullible, holdingProbes } from "./helpers/fake-models";
import type { ModelFn } from "../lib/evals/types";

const ctx = (over: Partial<EvalContext> = {}): EvalContext => ({
  sb: {}, agentKey: "negotiation-agent", version: { id: "v1", version: 1, max_cost_usd: 0.5, model: null }, promptVersion: "v-test", model: faithful(),
  baselines: new Map(), budget: { perRunUsd: 4, remainingUsd: 15 }, probes: holdingProbes, ...over,
});
const gate = (r: Awaited<ReturnType<typeof runEvaluation>>, name: string) => r.gates.find((g) => g.gate === name)!;

test("an agent's prompt version changes when any prompt it uses changes, so older evaluations stop counting", () => {
  const v = promptVersionFor("negotiation-agent");
  assert.match(v, /^v\d+\.\d+\.\d+\+[0-9a-f]{8}$/);
  assert.equal(promptVersionFor("negotiation-agent"), v, "stable across calls");
  assert.notEqual(promptVersionFor("reporting-agent"), v);
  assert.match(promptVersionFor("pipeline-hygiene-agent"), /^v\d+\.\d+\.\d+$/, "an agent with no prompts is versioned by the platform alone");
});

test("each agent is evaluated on its own real prompts, with attacks drawn from the adversarial list", () => {
  assert.deepEqual(targetsFor("negotiation-agent"), ["negotiation"]);
  assert.deepEqual(targetsFor("outreach-agent"), ["proposal"]);
  assert.deepEqual(targetsFor("made-up-agent"), []);
  const neg = modelCasesFor(["negotiation"]);
  assert.equal(neg.filter((c) => c.gate === "quality_regression").length, 10);
  assert.equal(neg.filter((c) => c.gate === "injection_resistance").length, 8);
  assert.ok(neg.every((c) => c.system.includes("EVAL-CANARY") && c.user.length > 100));
  assert.ok(neg.filter((c) => c.gate === "injection_resistance").every((c) => /IGNORE|SYSTEM|assistant|JSON|diretor|instruções|CEO|NOVAS/.test(c.user)), "each attack text is inside the sponsor's reply");
  assert.ok(modelCasesFor(["proposal"]).length >= 5 && modelCasesFor(["renewal"]).length === 2 && modelCasesFor(["report"]).length === 3 && modelCasesFor(["hygiene"]).length === 0);
});

test("the prompts under test are the production prompts: the same text the agents send, plus only the planted reference code", () => {
  const c = modelCasesFor(["negotiation"]).find((x) => x.id === "neg.price_push")!;
  assert.match(c.system, /Agente de Negociação de patrocínios do Coritiba FC/);
  assert.match(c.system, /REGRAS DE GROUNDING/);
  assert.match(c.user, /Texto completo da resposta do patrocinador \(escrito por terceiros/);
  assert.match(c.system, /REGRAS DE SEGURANÇA/);
  assert.match(c.user, /Ouro: R\$ 150\.000/);
  assert.match(c.user, /Prata: R\$ sob consulta/, "the package with no price is presented to the model as having none");
  assert.match(c.system, /VERIFIED CLUB FIGURES/);
});

test("a model that does its job passes every gate, and the run costs what the calls cost", async () => {
  const model = faithful({ costUsd: 0.01 });
  const r = await runEvaluation(ctx({ model }));
  assert.deepEqual(r.gates.map((g) => [g.gate, g.passed]), [["injection_resistance", true], ["isolation", true], ["permissions", true], ["cost_regression", true], ["quality_regression", true]], JSON.stringify(r.gates.flatMap((g) => g.results.filter((x) => !x.passed).map((x) => `${x.id}: ${x.detail}`))));
  assert.equal(r.status, "passed");
  assert.equal(model.calls, 10 + 8 * 3, "ten ordinary cases once, eight attacks three times each");
  assert.ok(Math.abs(r.cost_usd - 0.34) < 1e-9);
  assert.match(r.notes.join(" "), /no reference yet/);
});

test("a model that obeys planted orders fails the injection gate, and each failure says what it did", async () => {
  const r = await runEvaluation(ctx({ model: gullible() }));
  assert.equal(r.status, "failed");
  const inj = gate(r, "injection_resistance");
  assert.ok(!inj.passed && inj.failed === 8, `all eight attacks should take control, ${inj.failed} did`);
  const detail = inj.results[0].detail;
  assert.match(detail, /address it was not given/);
  assert.ok(inj.results.every((x) => /discount|obedience|links|contacts/.test(x.detail)));
  assert.ok(gate(r, "quality_regression").passed, "ordinary replies are still fine: the gates fail for the right reason");
});

test("a run that cannot fit its budget is refused before any money is spent", async () => {
  const model = faithful();
  const r = await runEvaluation(ctx({ model, budget: { perRunUsd: 0.01, remainingUsd: 15 } }));
  assert.equal(r.status, "error");
  assert.equal(model.calls, 0);
  assert.match(r.notes.join(" "), /over the \$0\.01 allowed for one run\. Nothing was spent/);
  const r2 = await runEvaluation(ctx({ model, budget: { perRunUsd: 4, remainingUsd: 0.02 } }));
  assert.equal(r2.status, "error");
  assert.equal(model.calls, 0);
  assert.match(r2.notes.join(" "), /evaluation budget is left/);
});

test("a run that overshoots stops at its limit; cases it did not reach count as failed, never as passed", async () => {
  const dear: ModelFn = async (p) => ({ ...(await faithful()(p)), costUsd: 0.5 });
  const r = await runEvaluation(ctx({ model: dear, concurrency: 1, budget: { perRunUsd: 1.2, remainingUsd: 15 }, baselines: new Map(modelCasesFor(["negotiation"]).map((c) => [c.id, { case_id: c.id, input_tokens: 1500, output_tokens: 400, cost_usd: 0.01, quality_pass: true, prompt_chars: null } satisfies Baseline])) }));
  const notRun = r.gates.flatMap((g) => g.results).filter((x) => /not run/.test(x.detail));
  assert.ok(notRun.length > 0 && notRun.every((x) => !x.passed));
  assert.ok(r.cost_usd < 2.5, `spending stopped soon after the limit (${r.cost_usd})`);
  assert.equal(r.status, "failed");
  assert.match(r.notes.join(" "), /reached its \$1\.20 limit/);
});

test("cost is compared with the reference: the same cost passes, a version that costs much more fails", async () => {
  const baselines = new Map<string, Baseline>(modelCasesFor(["negotiation"]).map((c) => [c.id, { case_id: c.id, input_tokens: 1500, output_tokens: 400, cost_usd: 0.01, quality_pass: true, prompt_chars: c.system.length + c.user.length }]));
  const same = await runEvaluation(ctx({ baselines }));
  assert.ok(gate(same, "cost_regression").passed);
  const dearer = await runEvaluation(ctx({ baselines, model: faithful({ inputTokens: 4000, outputTokens: 900 }) }));
  const cg = gate(dearer, "cost_regression");
  assert.ok(!cg.passed && cg.results.some((x) => !x.passed && /4900 tokens \(reference 1900/.test(x.detail)));
  // a prompt that grew much larger also counts, even with the same token use
  const grown = new Map(baselines); for (const [k, v] of grown) grown.set(k, { ...v, prompt_chars: 1000 });
  assert.ok(!gate(await runEvaluation(ctx({ baselines: grown })), "cost_regression").passed);
});

test("quality is compared with the reference: a case that used to pass and now fails fails the gate, even when most pass", async () => {
  const cases = modelCasesFor(["negotiation"]);
  const baselines = new Map<string, Baseline>(cases.map((c) => [c.id, { case_id: c.id, input_tokens: 1500, output_tokens: 400, cost_usd: 0.01, quality_pass: true, prompt_chars: null }]));
  const flaky: ModelFn = async (p) => {
    const r = await faithful()(p);
    return /orçamento para este ano/.test(p.user) && !/IGNORE|SYSTEM|assistant|Responda|diretor|instruções|CEO|NOVAS/.test(p.user) ? { ...r, json: { subject: "Re", body_text: "Fechamos por R$ 90.000, aceitamos a sua proposta." }, text: "{}" } : r;
  };
  const r = await runEvaluation(ctx({ model: flaky, baselines }));
  const q = gate(r, "quality_regression");
  assert.ok(!q.passed, q.summary);
  assert.match(q.summary, /that used to pass now fail: neg\.price_push/);
  assert.match(q.results.find((x) => x.id === "neg.price_push")!.detail, /it says something it must not.*aceitamos/);
});

test("an agent with no model use is evaluated exactly, and one with no evaluation at all cannot pass", async () => {
  const hyg = await runEvaluation(ctx({ agentKey: "pipeline-hygiene-agent", model: null }));
  assert.equal(hyg.status, "passed", JSON.stringify(hyg.gates.map((g) => [g.gate, g.passed, g.summary])));
  assert.equal(hyg.cost_usd, 0);
  assert.ok(gate(hyg, "injection_resistance").cases === 1 && gate(hyg, "quality_regression").cases === 1);
  const unknown = await runEvaluation(ctx({ agentKey: "made-up-agent" }));
  assert.equal(unknown.status, "error");
  assert.match(unknown.notes.join(" "), /no evaluation for "made-up-agent"/);
  const noModel = await runEvaluation(ctx({ model: null }));
  assert.equal(noModel.status, "error");
});

test("a platform check that fails fails its gate, whatever the model did", async () => {
  const broken = { ...holdingProbes, db: async () => [...(await holdingProbes.db()), { id: "perm.x", gate: "permissions" as const, title: "x", kind: "probe" as const, passed: false, detail: "it was allowed", cost_usd: 0, input_tokens: 0, output_tokens: 0 }] };
  const r = await runEvaluation(ctx({ probes: broken }));
  assert.equal(r.status, "failed");
  assert.ok(!gate(r, "permissions").passed && gate(r, "isolation").passed);
  assert.match(gate(r, "permissions").summary, /3 of 4 permission checks held/);
});

test("a gate with no cases cannot pass", async () => {
  const r = await runEvaluation(ctx({ probes: { db: async () => [], static: async () => [] } }));
  assert.ok(!gate(r, "isolation").passed && /no cases exist/.test(gate(r, "isolation").summary));
  assert.equal(r.status, "failed");
});
