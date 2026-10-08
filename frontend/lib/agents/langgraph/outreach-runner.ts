import { supabaseAdmin } from "@/lib/supabase/server";
import { TOOL_LABELS, TOOL_DONE_LABELS } from "@/lib/agents/tool-definitions";
import { toolEnrichContacts, toolScrapeIntelligence, toolGeneratePersonalizedProposal, toolGenerateOutreachEmail } from "@/lib/agents/tools";
import { planEmailSend } from "@/lib/actions/broker";
import { recordAudit } from "@/lib/audit/log";
import { agentActor } from "@/lib/identity/actor";
import { emailForAuthUser } from "@/lib/identity/lookup";
import { notifyApprovalNeeded } from "@/lib/slack/notify";
import { serverEnv } from "@/lib/env";
import type { AgentMode, AgentResult, AgentStep, SSEEvent } from "@/lib/agents/types";
import { buildOutreachGraph, OUTREACH_GRAPH, type OutreachDeps } from "./outreach-graph";
import { SupabaseCheckpointSaver } from "./postgres-saver";
import { scoreRun } from "../../observability/langfuse";
import { getThread, notSetUp, resumeRun, startRun, type DriveResult, type RunnableGraph } from "./runtime";

type Sb = any;

export interface OutreachRunInput {
  run_id: string; company_id: string; company_name: string; domain: string; mode: AgentMode; created_by: string | null;
  auto_approve?: boolean; batch_id?: string | null; agent_version?: number | null;
}

/** The real tools, audit log, Slack and broker behind the graph. */
export function liveDeps(sb: Sb, emit: (e: SSEEvent) => void): OutreachDeps {
  return {
    sb, emit,
    tools: {
      enrich: toolEnrichContacts,
      scrape: toolScrapeIntelligence,
      proposal: toolGeneratePersonalizedProposal,
      email: toolGenerateOutreachEmail,
    },
    plan: (i) => planEmailSend(sb, { tenantId: i.tenantId, emailId: i.emailId, onBehalfOf: i.onBehalfOf, runId: i.runId }),
    audit: async (e) => {
      await recordAudit({
        actor: agentActor("outreach-agent", { onBehalfOf: e.createdBy, runId: e.runId, version: e.agentVersion }),
        tenant_id: e.tenantId, request_id: e.runId, entity_type: "company", entity_id: e.companyId, action: `agent.tool.${e.tool}`,
        metadata: { run_id: e.runId, step: e.step, status: e.status, mode: e.mode, summary: e.summary || null },
      });
    },
    notifyProposal: ({ proposalId, title }) => { void notifyApprovalNeeded({ proposalId, proposalTitle: title, appUrl: serverEnv().APP_URL }); },
    onBehalfOf: (createdBy) => emailForAuthUser(sb, createdBy),
    labels: { running: TOOL_LABELS, done: TOOL_DONE_LABELS },
  };
}

const graphFor = (deps: OutreachDeps, tenantId: string) => buildOutreachGraph(deps, new SupabaseCheckpointSaver(deps.sb, tenantId)) as unknown as RunnableGraph;

const tenantOfRun = async (sb: Sb, runId: string): Promise<string | null> => {
  const { data } = await sb.from("agent_runs").select("tenant_id").eq("id", runId).maybeSingle();
  return (data as { tenant_id?: string } | null)?.tenant_id ?? null;
};

const stepsOf = (r: DriveResult): AgentStep[] => (("values" in r && r.values?.steps) as AgentStep[] | undefined) ?? [];
const resultOf = (r: DriveResult): AgentResult => (("values" in r && r.values?.result) as AgentResult | undefined) ?? {};

/** Marks the run row failed when the graph stopped on an error, since the graph could not say so itself. */
async function failRun(sb: Sb, runId: string, message: string): Promise<void> {
  await sb.from("agent_runs").update({ status: "failed", error: message, updated_at: new Date().toISOString() }).eq("id", runId).neq("status", "completed");
}

export type GraphStart = { used: false; reason: string } | { used: true; result: AgentResult; waiting: boolean };

/**
 * Starts the Outreach Agent graph for a run. Says `used: false` when the run-state tables are not set up yet, so the
 * caller can fall back to the earlier loop. A failed step is reported and the run is marked failed, but its progress is
 * kept: it can be carried on from the last saved step.
 */
export interface RunnerOptions { sb?: Sb; deps?: (emit: (e: SSEEvent) => void) => OutreachDeps }

export async function startOutreachGraph(input: OutreachRunInput, emit: (e: SSEEvent) => void, opts: RunnerOptions = {}): Promise<GraphStart> {
  const sb = opts.sb ?? supabaseAdmin();
  const depsFor = opts.deps ?? ((e) => liveDeps(sb, e));
  const tenantId = (await tenantOfRun(sb, input.run_id)) ?? (await sb.from("companies").select("tenant_id").eq("id", input.company_id).maybeSingle()).data?.tenant_id;
  if (!tenantId) return { used: false, reason: "no tenant" };
  const out = await startRun(sb, graphFor(depsFor(emit), tenantId), {
    tenantId, graph: OUTREACH_GRAPH, subjectType: "agent_run", subjectId: input.run_id, startedBy: input.created_by,
    initial: {
      runId: input.run_id, tenantId, companyId: input.company_id, companyName: input.company_name, domain: input.domain, mode: input.mode,
      createdBy: input.created_by, autoApprove: !!input.auto_approve, agentVersion: input.agent_version ?? null,
    },
  });
  if (!out.ok) {
    if (out.status === 503 || out.error === notSetUp) return { used: false, reason: notSetUp };
    throw new Error(out.error);
  }
  if (out.result.status === "failed") {
    emit({ type: "error", message: out.result.error, run_id: input.run_id });
    await failRun(sb, input.run_id, out.result.error);
    throw new Error(out.result.error);
  }
  return { used: true, result: resultOf(out.result), waiting: out.result.status === "interrupted" };
}

/** `refused` is set when the run ended on a rule ("not drafting a pitch: nobody qualified this account"), not on a fault. */
export type GraphResume = { used: false } | { used: true; success: boolean; agentResult: AgentResult; steps: AgentStep[]; error?: string; refused?: boolean };

/** A person approved the proposal: carries the run on to the drafted email and the send plan, where it waits again. */
export async function resumeOutreachGraph(runId: string, emit?: (e: SSEEvent) => void, opts: RunnerOptions = {}): Promise<GraphResume> {
  const sb = opts.sb ?? supabaseAdmin();
  const depsFor = opts.deps ?? ((e) => liveDeps(sb, e));
  const tenantId = await tenantOfRun(sb, runId);
  if (!tenantId) return { used: false };
  const threadId = SupabaseCheckpointSaver.threadId(tenantId, OUTREACH_GRAPH, runId);
  const thread = await getThread(sb, tenantId, threadId);
  if (!thread.ok) return { used: false }; // paused before the graph existed, or the tables are not there: the earlier path handles it
  // an answer belongs to the question that is open: approving a proposal must never answer the send plan's question
  const waitingOn = (thread.value.waiting_for as { reason?: string } | null)?.reason;
  if (thread.value.status === "interrupted" && waitingOn !== "proposal_review") return { used: true, success: false, agentResult: {}, steps: [], error: `This run is not waiting for a proposal approval (it is waiting for: ${waitingOn ?? "nothing"}).` };
  const noop = () => undefined;
  const out = await resumeRun(sb, graphFor(depsFor(emit ?? noop), tenantId), { tenantId, threadId, answer: { approved: true } });
  if (!out.ok) return { used: true, success: false, agentResult: {}, steps: [], error: out.error };
  const r = out.result;
  if (r.status === "failed") {
    await failRun(sb, runId, r.error);
    return { used: true, success: false, agentResult: resultOf(r), steps: stepsOf(r), error: r.error, refused: r.values?.refused === true };
  }
  const failure = (("values" in r && r.values?.failure) as string | null | undefined) ?? null;
  // a person approved the proposal: the first thing that tells us whether the agent's proposals are any good
  scoreRun(threadId, "proposal_approved", 1);
  return { used: true, success: !failure, agentResult: resultOf(r), steps: stepsOf(r), error: failure ?? undefined };
}

/** The send plan was decided: lets the graph finish. Does nothing for a run that never had a graph. */
export async function finishOutreachGraph(runId: string, outcome: "sent" | "failed", opts: RunnerOptions = {}): Promise<void> {
  const sb = opts.sb ?? supabaseAdmin();
  const depsFor = opts.deps ?? ((e) => liveDeps(sb, e));
  const tenantId = await tenantOfRun(sb, runId);
  if (!tenantId) return;
  const threadId = SupabaseCheckpointSaver.threadId(tenantId, OUTREACH_GRAPH, runId);
  const thread = await getThread(sb, tenantId, threadId);
  if (!thread.ok || thread.value.status !== "interrupted" || (thread.value.waiting_for as { reason?: string } | null)?.reason !== "email_review") return;
  await resumeRun(sb, graphFor(depsFor(() => undefined), tenantId), { tenantId, threadId, answer: { outcome } });
  scoreRun(threadId, "send_outcome", outcome === "sent" ? 1 : 0, outcome);
}

/**
 * A send plan can be approved from the action itself, not only from the run's own button. Either way the run that made
 * the plan is finished and its graph is let go.
 */
export async function settleRunForAction(sb: Sb, tenantId: string, actionId: string, outcome: "sent" | "failed", opts: Omit<RunnerOptions, "sb"> = {}): Promise<void> {
  const { data } = await sb.from("agent_runs").select("id, status").eq("tenant_id", tenantId).eq("result->>action_id", actionId).limit(1).maybeSingle();
  const run = data as { id: string; status: string } | null;
  if (!run) return;
  if (run.status === "paused_for_approval") {
    await sb.from("agent_runs").update({ status: outcome === "sent" ? "completed" : "failed", updated_at: new Date().toISOString() }).eq("id", run.id).eq("status", "paused_for_approval");
  }
  await finishOutreachGraph(run.id, outcome, { sb, deps: opts.deps });
}
