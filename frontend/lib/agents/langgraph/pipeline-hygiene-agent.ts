/**
 * Pipeline Hygiene Agent — Phase 8, Team 2's first agent ("CRM Outreach:
 * Pipeline Hygiene / Multi-Channel Sequencer / Renewal / Reporting",
 * `master_report.md` Section 7.2). Team 2 didn't exist at all before this;
 * the other three roles (Sequencer, Renewal, Reporting) are still open —
 * see PLATFORM_ROADMAP.md.
 *
 * Scans companies.pipeline_stage (the real pipeline model used on
 * /pipeline) for deals that have gone quiet — no update in N days while
 * still in a non-terminal stage — and buckets them by severity. Built as
 * a LangGraph.js StateGraph for the same reason as the Negotiation Agent:
 * composability with future Team 2 agents, per the Phase 8 framework
 * decision.
 *
 * Found live-testing 2026-09-17: the first version of this selected a
 * "companies.estimated_value" column that doesn't exist anywhere in the
 * schema (copied from the same mistake already present in
 * app/pipeline/page.tsx, fixed alongside this). Supabase's error was
 * silently swallowed by `data ?? []`, so the agent always reported a
 * suspiciously clean "0 stale deals" against a real 540-company dataset.
 * Fixed two ways: dropped estimated_value (no equivalent field exists
 * anywhere upstream of a signed contract), and scanPipeline now throws on
 * a real query error instead of defaulting to an empty result.
 */
import { StateGraph, Annotation, START, END } from "@langchain/langgraph";
import { supabaseAdmin } from "@/lib/supabase/server";

const TERMINAL_STAGES = new Set(["closed_won", "closed_lost"]);
const WARNING_DAYS = 14;
const CRITICAL_DAYS = 30;

export interface StaleCompany {
  id: string;
  companyName: string;
  pipelineStage: string;
  daysStale: number;
  severity: "warning" | "critical";
}

const HygieneState = Annotation.Root({
  tenantId: Annotation<string>,
  rawCompanies: Annotation<Array<{ id: string; company_name: string; pipeline_stage: string | null; updated_at: string | null }>>,
  staleCompanies: Annotation<StaleCompany[]>,
});

async function scanPipeline(state: typeof HygieneState.State): Promise<Partial<typeof HygieneState.State>> {
  const sb = supabaseAdmin();
  const { data, error } = await sb
    .from("companies")
    .select("id, company_name, pipeline_stage, updated_at")
    .eq("tenant_id", state.tenantId)
    .not("pipeline_stage", "is", null);

  if (error) throw new Error(`Pipeline scan query failed: ${error.message}`);
  return { rawCompanies: data ?? [] };
}

function classifyIssues(state: typeof HygieneState.State): Partial<typeof HygieneState.State> {
  const now = Date.now();
  const stale: StaleCompany[] = [];

  for (const c of state.rawCompanies) {
    if (!c.pipeline_stage || TERMINAL_STAGES.has(c.pipeline_stage)) continue;
    if (!c.updated_at) continue;

    const daysStale = Math.floor((now - new Date(c.updated_at).getTime()) / 86_400_000);
    if (daysStale < WARNING_DAYS) continue;

    stale.push({
      id: c.id,
      companyName: c.company_name,
      pipelineStage: c.pipeline_stage,
      daysStale,
      severity: daysStale >= CRITICAL_DAYS ? "critical" : "warning",
    });
  }

  stale.sort((a, b) => b.daysStale - a.daysStale);
  return { staleCompanies: stale };
}

const graph = new StateGraph(HygieneState)
  .addNode("scan_pipeline", scanPipeline)
  .addNode("classify_issues", classifyIssues)
  .addEdge(START, "scan_pipeline")
  .addEdge("scan_pipeline", "classify_issues")
  .addEdge("classify_issues", END)
  .compile();

export interface PipelineHygieneReport {
  staleCompanies: StaleCompany[];
  generatedAt: string;
}

export async function runPipelineHygieneAgent(tenantId: string): Promise<PipelineHygieneReport> {
  const finalState = await graph.invoke({ tenantId } as typeof HygieneState.State);
  return {
    staleCompanies: finalState.staleCompanies,
    generatedAt: new Date().toISOString(),
  };
}
