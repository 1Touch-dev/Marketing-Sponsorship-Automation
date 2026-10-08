/**
 * Runs the evaluation gates for one agent from the command line:
 *
 *   npm run eval:local -- negotiation-agent            real model, real prompts
 *   npm run eval:local -- reporting-agent --no-model   only what needs no model
 *
 * The model cases go to the real model (Anthropic, through the same client the agents use, so they are counted in the
 * spend ledger and held to the daily cap). The permission and isolation probes run the SAME SQL as the platform's
 * migrations in a throwaway local Postgres, so this can be run before a migration is applied in production, and in CI.
 * A running total of what local runs have cost is kept in .eval-spend.json (not committed) and a run that would take the
 * total past EVAL_LOCAL_TOTAL_USD (default 15) is refused before any money is spent.
 */
import fs from "node:fs";
import path from "node:path";
import { freshDb } from "../tests/db/harness";
import { pgClient } from "../tests/helpers/pg-from";
import { runEvaluation } from "../lib/evals/runner";
import { liveModel } from "../lib/evals/model";
import { evalBudget } from "../lib/evals/store";
import { promptVersionFor } from "../lib/evals/targets";

const MIGRATIONS = ["0069_identity_tombstones_idempotency.sql", "0070_agent_governance.sql", "0071_tombstones_full_undo.sql", "0072_langgraph_runtime.sql"];
const LEDGER = path.resolve(__dirname, "../.eval-spend.json");

async function main() {
  const agent = process.argv[2];
  if (!agent || agent.startsWith("--")) { console.error("usage: npm run eval:local -- <agent-key> [--no-model]"); process.exit(2); }
  const useModel = !process.argv.includes("--no-model");
  const total = Number(process.env.EVAL_LOCAL_TOTAL_USD) > 0 ? Number(process.env.EVAL_LOCAL_TOTAL_USD) : 15;
  const spent: number = fs.existsSync(LEDGER) ? JSON.parse(fs.readFileSync(LEDGER, "utf8")).spentUsd ?? 0 : 0;

  const db = await freshDb(MIGRATIONS);
  const sb = pgClient(db);
  const v = (await db.query("SELECT v.id, v.version, v.max_cost_usd FROM public.agent_versions v JOIN public.agent_definitions d ON d.id = v.definition_id WHERE d.key = $1 AND d.tenant_id = '00000000-0000-0000-0000-000000000001' ORDER BY v.version DESC LIMIT 1", [agent])).rows[0] as { id: string; version: number; max_cost_usd: string } | undefined;
  const version = { id: v?.id ?? "local", version: v?.version ?? 1, max_cost_usd: Number(v?.max_cost_usd ?? 0.5), model: null };

  const report = await runEvaluation({
    sb, agentKey: agent, version, promptVersion: promptVersionFor(agent), model: useModel ? liveModel : null, baselines: new Map(),
    budget: { perRunUsd: evalBudget().perRunUsd, remainingUsd: total - spent },
  });
  fs.writeFileSync(LEDGER, JSON.stringify({ spentUsd: Number((spent + report.cost_usd).toFixed(4)), updated: new Date().toISOString() }, null, 2));

  console.log(`\n${agent}  prompts ${report.prompt_version}  ->  ${report.status.toUpperCase()}   this run $${report.cost_usd.toFixed(4)}   local total $${(spent + report.cost_usd).toFixed(4)} of $${total}`);
  for (const g of report.gates) {
    console.log(`  ${g.passed ? "PASS" : "FAIL"}  ${g.gate.padEnd(22)} ${g.summary}`);
    for (const r of g.results.filter((x) => !x.passed)) console.log(`        x ${r.id}: ${r.detail}${r.excerpt ? `\n            reply: ${r.excerpt.slice(0, 240)}` : ""}`);
  }
  for (const n of report.notes) console.log(`  note: ${n}`);
  const out = process.env.EVAL_REPORT_OUT;
  if (out) fs.writeFileSync(out, JSON.stringify(report, null, 2));
  process.exit(report.status === "passed" ? 0 : 1);
}
main().catch((e) => { console.error(e); process.exit(2); });
