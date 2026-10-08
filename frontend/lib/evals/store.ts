import type { WriteResult } from "../accounts/store";
import { isMissingMigration } from "../proposals/revision-store";
import type { Baseline } from "./runner";
import type { EvalReport } from "./types";

type Sb = any;
const notSetUp = "Evaluation gates are not set up yet (migration 0072).";
const fail = (e: { message: string }): { ok: false; status: number; error: string } =>
  isMissingMigration(e) ? { ok: false, status: 503, error: notSetUp } : { ok: false, status: 500, error: e.message };

/** Spending limits for evaluations: per run, and in total over a rolling window. */
export const evalBudget = () => ({
  perRunUsd: Number(process.env.EVAL_RUN_BUDGET_USD) > 0 ? Number(process.env.EVAL_RUN_BUDGET_USD) : 4,
  totalUsd: Number(process.env.EVAL_TOTAL_BUDGET_USD) > 0 ? Number(process.env.EVAL_TOTAL_BUDGET_USD) : 15,
  windowDays: Number(process.env.EVAL_BUDGET_WINDOW_DAYS) > 0 ? Number(process.env.EVAL_BUDGET_WINDOW_DAYS) : 30,
});

export async function evalSpend(sb: Sb, tenantId: string, now = Date.now()): Promise<WriteResult<{ spentUsd: number; remainingUsd: number; totalUsd: number; windowDays: number; runs: number }>> {
  const b = evalBudget();
  const since = new Date(now - b.windowDays * 86_400_000).toISOString();
  const { data, error } = await sb.from("agent_eval_runs").select("cost_usd").eq("tenant_id", tenantId).gte("started_at", since);
  if (error) return fail(error);
  const spent = ((data ?? []) as Array<{ cost_usd: number | string }>).reduce((n, r) => n + Number(r.cost_usd), 0);
  return { ok: true, value: { spentUsd: spent, remainingUsd: Math.max(0, b.totalUsd - spent), totalUsd: b.totalUsd, windowDays: b.windowDays, runs: data?.length ?? 0 } };
}

export async function loadBaselines(sb: Sb, tenantId: string, agentKey: string): Promise<WriteResult<Map<string, Baseline>>> {
  const { data, error } = await sb.from("agent_eval_baselines").select("case_id, input_tokens, output_tokens, cost_usd, quality_pass, prompt_chars, recorded_at").eq("tenant_id", tenantId).eq("agent_key", agentKey).order("recorded_at", { ascending: false });
  if (error) return isMissingMigration(error) ? { ok: true, value: new Map() } : fail(error);
  const m = new Map<string, Baseline>();
  for (const r of (data ?? []) as Array<Baseline & { cost_usd: number | string }>) if (!m.has(r.case_id)) m.set(r.case_id, { ...r, cost_usd: Number(r.cost_usd) });
  return { ok: true, value: m };
}

export interface RunRow {
  id: string; version_id: string; agent_key: string; status: string; model: string | null; prompt_version: string | null; case_count: number; cost_usd: number;
  started_by: string; started_at: string; finished_at: string; notes: string | null; gates: Array<Record<string, any>>;
}
const RUN_COLS = "id, version_id, agent_key, status, model, prompt_version, case_count, cost_usd, started_by, started_at, finished_at, notes, gates";

export async function recordRun(sb: Sb, i: { tenantId: string; definitionId: string; versionId: string; report: EvalReport; startedBy: string; startedAt: string; config: Record<string, unknown> }): Promise<WriteResult<{ id: string }>> {
  const r = i.report;
  const { data, error } = await sb.from("agent_eval_runs").insert({
    tenant_id: i.tenantId, definition_id: i.definitionId, version_id: i.versionId, agent_key: r.agent_key, status: r.status,
    gates: r.gates.map((g) => ({ gate: g.gate, passed: g.passed, cases: g.cases, failed: g.failed, summary: g.summary, results: g.results })),
    model: r.model, prompt_version: r.prompt_version, config_snapshot: i.config, case_count: r.case_count, cost_usd: Number(r.cost_usd.toFixed(4)),
    input_tokens: r.input_tokens, output_tokens: r.output_tokens, started_by: i.startedBy, started_at: i.startedAt, notes: r.notes.join(" ") || null,
  }).select("id").single();
  return error ? fail(error) : { ok: true, value: { id: data.id } };
}

export async function listRuns(sb: Sb, tenantId: string, versionId: string, limit = 20): Promise<WriteResult<RunRow[]>> {
  const { data, error } = await sb.from("agent_eval_runs").select(RUN_COLS).eq("tenant_id", tenantId).eq("version_id", versionId).order("finished_at", { ascending: false }).limit(limit);
  return error ? fail(error) : { ok: true, value: (data ?? []) as RunRow[] };
}

export async function getRun(sb: Sb, tenantId: string, runId: string): Promise<WriteResult<RunRow & { definition_id: string }>> {
  const { data, error } = await sb.from("agent_eval_runs").select(`${RUN_COLS}, definition_id`).eq("tenant_id", tenantId).eq("id", runId).maybeSingle();
  if (error) return fail(error);
  return data ? { ok: true, value: data as RunRow & { definition_id: string } } : { ok: false, status: 404, error: "Evaluation run not found" };
}

/** A person accepts a passing run as the reference that later versions' cost and quality are compared with. */
export async function acceptBaseline(sb: Sb, tenantId: string, runId: string, by: string): Promise<WriteResult<{ cases: number }>> {
  if (!by) return { ok: false, status: 403, error: "A signed-in person is required." };
  const run = await getRun(sb, tenantId, runId);
  if (!run.ok) return run;
  if (run.value.status !== "passed") return { ok: false, status: 409, error: "Only a run that passed can become the reference." };
  const rows = run.value.gates.flatMap((g) => (g.results ?? []) as Array<Record<string, any>>).filter((r) => r.kind === "model").map((r) => ({
    tenant_id: tenantId, agent_key: run.value.agent_key, case_id: r.id, input_tokens: r.input_tokens, output_tokens: r.output_tokens, cost_usd: r.cost_usd,
    quality_pass: !!r.passed, prompt_chars: r.prompt_chars ?? null, prompt_version: run.value.prompt_version, eval_run_id: runId, recorded_by: by,
  }));
  // one row per case: a case shared by two gates is recorded once
  const unique = [...new Map(rows.map((r) => [r.case_id, r])).values()];
  if (unique.length === 0) return { ok: false, status: 409, error: "This run had no model cases, so there is no cost or quality to record." };
  const { error } = await sb.from("agent_eval_baselines").insert(unique);
  return error ? fail(error) : { ok: true, value: { cases: unique.length } };
}
