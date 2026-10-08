import { Annotation, END, START, StateGraph, interrupt } from "@langchain/langgraph";
import type { AgentMode, AgentResult, AgentStep, SSEEvent } from "../types";
import { SupabaseCheckpointSaver } from "./postgres-saver";

type Sb = any;

/**
 * The Outreach Agent as a LangGraph graph.
 *
 *   enrich → scrape → proposal ─┬─ (a person approves the proposal: the run waits, possibly for days) ─┐
 *                               └─ (pre-approved campaign: straight on) ────────────────────────────────┤
 *            ┌──────────────────────────────────────────────────────────────────────────────────────────┘
 *            approve_proposal → draft_email → plan_send → (a person approves the send plan: the run waits) → end
 *
 * Every step is saved in our database, so a process that dies resumes from its last finished step. The graph never
 * sends: "plan_send" only makes the plan a person approves, and the send itself runs through the action broker when
 * they approve it, with their standing and the plan's identity rechecked just before. A checkpoint does not make an
 * external effect safe to repeat; the broker does.
 *
 * Steps that create a record (the proposal, the email draft) first look for the one an interrupted earlier attempt
 * already made, so a resume does not create a second.
 */

export interface ToolOutcome { success: boolean; data: Record<string, unknown>; summary: string }

export interface OutreachDeps {
  sb: Sb;
  tools: {
    enrich(i: { company_id: string; domain: string }): Promise<ToolOutcome>;
    scrape(i: { company_id: string; company_name: string; domain: string }): Promise<ToolOutcome>;
    proposal(i: { company_id: string }): Promise<ToolOutcome>;
    email(i: { proposal_id: string; recipient_email: string; recipient_name?: string }): Promise<ToolOutcome>;
  };
  plan(i: { tenantId: string; emailId: string; onBehalfOf: string | null; runId: string }): Promise<
    | { ok: true; legacy: true; actionId: null; state: null }
    | { ok: true; legacy?: false; actionId: string; state: string }
    | { ok: false; error: string; actionId?: string }
  >;
  audit(e: { agentVersion: number | null; runId: string; tenantId: string; companyId: string; createdBy: string | null; tool: string; step: number; status: string; mode: string; summary: string }): Promise<void>;
  notifyProposal(i: { proposalId: string; title: string }): void;
  onBehalfOf(createdBy: string | null): Promise<string | null>;
  labels: { running: Record<string, string>; done: Record<string, (r: Record<string, unknown>) => string> };
  emit: (e: SSEEvent) => void;
  now?: () => string;
}

const concat = <T>(a: T[], b: T[]) => a.concat(b);

export const OutreachState = Annotation.Root({
  runId: Annotation<string>(),
  tenantId: Annotation<string>(),
  companyId: Annotation<string>(),
  companyName: Annotation<string>(),
  domain: Annotation<string>(),
  mode: Annotation<AgentMode>(),
  createdBy: Annotation<string | null>(),
  autoApprove: Annotation<boolean>(),
  agentVersion: Annotation<number | null>(),
  steps: Annotation<AgentStep[]>({ reducer: concat, default: () => [] }),
  result: Annotation<AgentResult>({ reducer: (a, b) => ({ ...a, ...b }), default: () => ({}) }),
  decision: Annotation<{ approved?: boolean; outcome?: string } | null>({ reducer: (_a, b) => b, default: () => null }),
  failure: Annotation<string | null>({ reducer: (_a, b) => b, default: () => null }),
  // set only by the node that ends the run on a refusal, so the thread registry can tell it from a clean ending
  refused: Annotation<boolean>({ reducer: (_a, b) => b, default: () => false }),
});
type S = typeof OutreachState.State;

export const OUTREACH_GRAPH = "outreach-agent";

const runTable = "agent_runs" as const;

export function buildOutreachGraph(deps: OutreachDeps, checkpointer: SupabaseCheckpointSaver | unknown) {
  const { sb, emit } = deps;
  const now = deps.now ?? (() => new Date().toISOString());

  const persist = async (s: S, patch: Record<string, unknown>) => {
    await sb.from(runTable).update({ updated_at: now(), ...patch }).eq("id", s.runId);
  };

  /** Runs one tool as a visible step: announced, recorded on the run and in the audit log, then reported. */
  async function step(s: S, tool: string, exec: () => Promise<ToolOutcome>, after?: (tr: ToolOutcome) => Partial<AgentResult>): Promise<{ steps: AgentStep[]; result: Partial<AgentResult>; tr: ToolOutcome }> {
    const n = s.steps.length + 1;
    const startedAt = now();
    emit({ type: "step", step: n, tool, status: "running", label: deps.labels.running[tool] ?? `Calling ${tool}…` });
    let tr: ToolOutcome;
    try { tr = await exec(); } catch (err) { tr = { success: false, data: {}, summary: `Tool threw: ${err instanceof Error ? err.message : String(err)}` }; }
    const status: AgentStep["status"] = tr.success ? "done" : tr.data.skipped ? "skipped" : "error";
    const label = deps.labels.done[tool]?.(tr.data) ?? tr.summary;
    const entry: AgentStep = { step: n, tool, status, label, result: tr.data, started_at: startedAt, finished_at: now() };
    const result = after?.(tr) ?? {};
    await persist(s, { steps: [...s.steps, entry], result: { ...s.result, ...result } });
    await deps.audit({ agentVersion: s.agentVersion, runId: s.runId, tenantId: s.tenantId, companyId: s.companyId, createdBy: s.createdBy, tool, step: n, status, mode: s.mode, summary: tr.summary?.slice(0, 300) ?? "" });
    emit({ type: "step", step: n, tool, status: status as "done" | "error" | "skipped", label, result: tr.data });
    return { steps: [entry], result, tr };
  }

  /** The record an interrupted earlier attempt of this run already made, if any. */
  const savedResult = async (s: S): Promise<AgentResult> => {
    const { data } = await sb.from(runTable).select("result").eq("id", s.runId).maybeSingle();
    return ((data as { result?: AgentResult } | null)?.result ?? {}) as AgentResult;
  };

  const graph = new StateGraph(OutreachState)
    .addNode("enrich", async (s: S) => {
      const out = await step(s, "enrich_contacts", () => deps.tools.enrich({ company_id: s.companyId, domain: s.domain }), (tr) => {
        const top = tr.data.top_contact as Record<string, unknown> | undefined;
        return {
          domain: s.domain,
          ...(top ? { contacts_found: tr.data.contacts_found as number, decision_makers: tr.data.decision_makers as number, recipient_email: top.email as string, recipient_name: (top.name as string) ?? undefined } : {}),
        };
      });
      return { steps: out.steps, result: out.result };
    })
    .addNode("scrape", async (s: S) => {
      const out = await step(s, "scrape_company_intelligence", () => deps.tools.scrape({ company_id: s.companyId, company_name: s.companyName, domain: s.domain }), (tr) => ({ social_score: tr.data.social_score as number }));
      return { steps: out.steps, result: out.result };
    })
    .addNode("proposal", async (s: S) => {
      const saved = await savedResult(s);
      if (saved.proposal_id) return { result: saved }; // an earlier, interrupted attempt already made it
      const out = await step(s, "generate_personalized_proposal", () => deps.tools.proposal({ company_id: s.companyId }), (tr) => (tr.data.proposal_id ? {
        proposal_id: tr.data.proposal_id as string, proposal_title: tr.data.proposal_title as string,
        proposal_executive_summary: tr.data.executive_summary as string, proposal_status: tr.data.status as string,
      } : {}));
      return { steps: out.steps, result: out.result, failure: out.result.proposal_id ? null : `Proposal not prepared: ${out.tr.summary}` };
    })
    // The run now waits for a person. Announcing is separate from waiting, because a step that asks a question runs
    // again from its top when answered: it must have nothing in it that should happen only once.
    .addNode("announce_proposal", async (s: S) => {
      await persist(s, { status: "paused_for_proposal_approval", result: s.result });
      emit({ type: "paused", reason: "proposal_review", proposal_id: s.result.proposal_id!, proposal_title: s.result.proposal_title ?? "Proposal", proposal_executive_summary: s.result.proposal_executive_summary ?? "" });
      deps.notifyProposal({ proposalId: s.result.proposal_id!, title: s.result.proposal_title ?? "Proposal" });
      return {};
    })
    .addNode("await_proposal_approval", async (s: S) => {
      const answer = interrupt({ reason: "proposal_review", proposal_id: s.result.proposal_id, run_id: s.runId }) as { approved?: boolean } | boolean;
      return { decision: typeof answer === "object" && answer !== null ? answer : { approved: answer !== false } };
    })
    .addNode("approve_proposal", async (s: S) => {
      await sb.from("proposals").update({ status: "approved", approved_at: now() }).eq("id", s.result.proposal_id!).eq("tenant_id", s.tenantId);
      await persist(s, { status: "resuming" });
      return {};
    })
    .addNode("draft_email", async (s: S) => {
      const saved = await savedResult(s);
      if (saved.email_id) return { result: saved };
      const recipient = s.result.recipient_email ?? `contato@${s.result.domain ?? s.domain ?? "empresa.com.br"}`;
      const out = await step(s, "generate_outreach_email", () => deps.tools.email({ proposal_id: s.result.proposal_id!, recipient_email: recipient, recipient_name: s.result.recipient_name }), (tr) => (tr.success && tr.data.email_id ? {
        email_id: tr.data.email_id as string, email_subject: tr.data.subject as string, email_preview: tr.data.preview as string,
        recipient: tr.data.recipient as string, recipient_name: (tr.data.recipient_name as string) ?? undefined,
      } : {}));
      return { steps: out.steps, result: out.result, failure: out.result.email_id ? null : out.tr.summary };
    })
    .addNode("plan_send", async (s: S) => {
      // The plan is what the approver reads: what will happen, to whom, at what cost, and what stops it.
      const planned = await deps.plan({ tenantId: s.tenantId, emailId: s.result.email_id!, onBehalfOf: await deps.onBehalfOf(s.createdBy), runId: s.runId });
      if (!planned.ok) return { failure: planned.error };
      return planned.legacy ? {} : { result: { action_id: planned.actionId, action_state: planned.state } };
    })
    .addNode("announce_email", async (s: S) => {
      await persist(s, { status: "paused_for_approval", result: s.result });
      emit({
        type: "paused", reason: "email_review", email_id: s.result.email_id!, email_subject: s.result.email_subject ?? "", email_preview: s.result.email_preview ?? "",
        recipient: s.result.recipient ?? "", recipient_name: s.result.recipient_name ?? "", action_id: s.result.action_id ?? null,
      });
      return {};
    })
    .addNode("await_send_approval", async (s: S) => {
      const answer = interrupt({ reason: "email_review", email_id: s.result.email_id, action_id: s.result.action_id ?? null, run_id: s.runId }) as { outcome?: string } | undefined;
      return { decision: { outcome: answer?.outcome ?? "sent" } };
    })
    .addNode("end_sent", async (s: S) => ({ result: { completed_at: s.result.completed_at ?? now() } }))
    .addNode("end_no_proposal", async (s: S) => {
      const result: AgentResult = { ...s.result, steps_completed: s.steps.filter((x) => x.status === "done").length, completed_at: now() };
      await persist(s, { status: "completed", result });
      emit({ type: "done", run_id: s.runId, summary: `${s.failure ?? "No proposal was prepared."} Nothing was drafted or sent.`, result });
      return { result };
    })
    .addNode("end_not_approved", async (s: S) => {
      await persist(s, { status: "cancelled", result: s.result });
      emit({ type: "done", run_id: s.runId, summary: "The proposal was not approved, so the run stopped. Nothing was sent.", result: s.result });
      return {};
    })
    .addNode("end_failed", async (s: S) => {
      const message = s.failure ?? "The run failed.";
      await persist(s, { status: "failed", error: message, result: s.result });
      emit({ type: "error", message, run_id: s.runId });
      return { refused: true };
    })
    .addEdge(START, "enrich")
    .addEdge("enrich", "scrape")
    .addEdge("scrape", "proposal")
    .addConditionalEdges("proposal", (s: S) => (!s.result.proposal_id ? "end_no_proposal" : s.autoApprove ? "approve_proposal" : "announce_proposal"), ["end_no_proposal", "approve_proposal", "announce_proposal"])
    .addEdge("announce_proposal", "await_proposal_approval")
    .addConditionalEdges("await_proposal_approval", (s: S) => (s.decision?.approved === false ? "end_not_approved" : "approve_proposal"), ["end_not_approved", "approve_proposal"])
    .addEdge("approve_proposal", "draft_email")
    .addConditionalEdges("draft_email", (s: S) => (s.failure ? "end_failed" : "plan_send"), ["end_failed", "plan_send"])
    .addConditionalEdges("plan_send", (s: S) => (s.failure ? "end_failed" : "announce_email"), ["end_failed", "announce_email"])
    .addEdge("announce_email", "await_send_approval")
    .addEdge("await_send_approval", "end_sent")
    .addEdge("end_sent", END)
    .addEdge("end_no_proposal", END)
    .addEdge("end_not_approved", END)
    .addEdge("end_failed", END);

  return graph.compile({ checkpointer: checkpointer as never });
}
