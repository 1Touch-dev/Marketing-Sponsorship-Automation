import { NextResponse } from "next/server";
import { z } from "zod";
import { supabaseAdmin } from "@/lib/supabase/server";
import { requirePermission } from "@/lib/auth/server-permission";
import { recordAudit } from "@/lib/audit/log";
import { userActor } from "@/lib/identity/actor";
import { runEvaluation } from "@/lib/evals/runner";
import { liveModel } from "@/lib/evals/model";
import { evalBudget, evalSpend, loadBaselines, recordRun } from "@/lib/evals/store";
import { promptVersionFor, targetsFor } from "@/lib/evals/targets";
import { startRunTrace, scoreRun } from "@/lib/observability/langfuse";
import { idempotent } from "@/lib/idempotency";

export const runtime = "nodejs";
export const maxDuration = 300;

const schema = z.object({ live: z.boolean().optional() });

/**
 * POST /api/agent-registry/<key>/versions/<n>/evaluate
 * Runs the five gates for this version: injection resistance, isolation, permissions, cost and quality. The model cases use
 * the real model and cost real money (counted against the evaluation budget and the daily AI cap); the permission and
 * isolation checks run against the live rules inside a block that is always rolled back. The result is recorded and cannot
 * be edited. A version can go live on a passing run (.../promote).
 */
async function postHandler(req: Request, ctx: { params: { key: string; version: string } }) {
  const auth = await requirePermission("manage_agents");
  if ("error" in auth) return auth.error;
  const parsed = schema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  const sb = supabaseAdmin();
  const tenantId = auth.user.tenant_id;

  const { data: def } = await sb.from("agent_definitions").select("id, key, retired_at").eq("tenant_id", tenantId).eq("key", ctx.params.key).maybeSingle();
  if (!def) return NextResponse.json({ error: "Agent not found" }, { status: 404 });
  if (def.retired_at) return NextResponse.json({ error: "A retired agent is not evaluated." }, { status: 409 });
  const { data: ver } = await sb.from("agent_versions").select("id, version, model, prompt_ref, effects, tools, max_cost_usd").eq("definition_id", def.id).eq("version", Number(ctx.params.version)).maybeSingle();
  if (!ver) return NextResponse.json({ error: "Version not found" }, { status: 404 });

  const spend = await evalSpend(sb, tenantId);
  if (!spend.ok) return NextResponse.json({ error: spend.error }, { status: spend.status });
  const baselines = await loadBaselines(sb, tenantId, ctx.params.key);
  if (!baselines.ok) return NextResponse.json({ error: baselines.error }, { status: baselines.status });
  const b = evalBudget();

  const startedAt = new Date().toISOString();
  const trace = startRunTrace({ id: `eval:${def.id}:${ver.id}:${startedAt}`, name: `evaluation:${ctx.params.key}`, tenantId, metadata: { version: ver.version, prompt_version: promptVersionFor(ctx.params.key) } });
  const report = await runEvaluation({
    sb, agentKey: ctx.params.key, version: { id: ver.id, version: ver.version, max_cost_usd: Number(ver.max_cost_usd), model: ver.model },
    promptVersion: promptVersionFor(ctx.params.key), model: parsed.data.live === false ? null : liveModel, baselines: baselines.value,
    budget: { perRunUsd: b.perRunUsd, remainingUsd: spend.value.remainingUsd },
  });
  for (const g of report.gates) { trace.span(g.gate, { output: { passed: g.passed, summary: g.summary } }); scoreRun(trace.id, `gate:${g.gate}`, g.passed ? 1 : 0, g.summary); }
  trace.end({ status: report.status, output: { cost_usd: report.cost_usd } });

  // a run that could not start (no evaluation exists, over budget, no model) is reported, not recorded as a result
  if (report.status === "error") return NextResponse.json({ status: "error", notes: report.notes, budget: { ...spend.value, perRunUsd: b.perRunUsd } }, { status: 409 });

  const saved = await recordRun(sb, { tenantId, definitionId: def.id, versionId: ver.id, report, startedBy: auth.user.email, startedAt, config: { effects: ver.effects, tools: ver.tools, max_cost_usd: ver.max_cost_usd, prompt_ref: ver.prompt_ref, targets: targetsFor(ctx.params.key) } });
  if (!saved.ok) return NextResponse.json({ error: saved.error }, { status: saved.status });
  await recordAudit({ actor: userActor(auth.user), entity_type: "agent", entity_id: ver.id, action: "agent.version_evaluated", metadata: { key: ctx.params.key, version: ver.version, run_id: saved.value.id, status: report.status, cost_usd: report.cost_usd, cases: report.case_count } });

  return NextResponse.json({
    run_id: saved.value.id, status: report.status, cost_usd: report.cost_usd, cases: report.case_count, notes: report.notes,
    gates: report.gates.map((g) => ({ gate: g.gate, passed: g.passed, cases: g.cases, failed: g.failed, summary: g.summary, failures: g.results.filter((r) => !r.passed).map((r) => ({ id: r.id, title: r.title, detail: r.detail, excerpt: r.excerpt ?? null })) })),
    can_promote: report.status === "passed",
  }, { status: 201 });
}

export const POST = idempotent("agent-registry.evaluate", postHandler);
