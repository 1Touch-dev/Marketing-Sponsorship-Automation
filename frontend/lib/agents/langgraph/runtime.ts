import { Command } from "@langchain/langgraph";
import type { WriteResult } from "../../accounts/store";
import { isMissingMigration } from "../../proposals/revision-store";
import { SupabaseCheckpointSaver } from "./postgres-saver";
import { startRunTrace, withTrace } from "../../observability/langfuse";

type Sb = any;

export type ThreadStatus = "running" | "interrupted" | "completed" | "failed" | "cancelled";

export interface ThreadRow {
  thread_id: string; tenant_id: string; graph: string; subject_type: string | null; subject_id: string | null; status: ThreadStatus;
  waiting_for: Record<string, unknown> | null; last_error: string | null; attempts: number; started_by: string | null;
  created_at: string; updated_at: string; finished_at: string | null; cancelled_by: string | null; cancel_reason: string | null;
}

const COLS = "thread_id, tenant_id, graph, subject_type, subject_id, status, waiting_for, last_error, attempts, started_by, created_at, updated_at, finished_at, cancelled_by, cancel_reason";
export const notSetUp = "Agent run state is not set up yet (migration 0072).";

/** The part of a compiled LangGraph graph the runtime needs. */
export interface RunnableGraph {
  stream(input: unknown, config: Record<string, unknown>): Promise<AsyncIterable<Record<string, unknown>>>;
  getState(config: Record<string, unknown>): Promise<{ values: Record<string, any>; next: string[]; tasks: Array<{ name: string; interrupts?: Array<{ value: unknown }> }> }>;
}

export type DriveResult =
  | { status: "completed"; values: Record<string, any> }
  | { status: "interrupted"; values: Record<string, any>; waitingFor: Record<string, unknown> }
  | { status: "failed"; error: string; values: Record<string, any> | null };

export const configFor = (tenantId: string, threadId: string): Record<string, unknown> => ({ configurable: { thread_id: threadId, tenant_id: tenantId } });

const fail = (e: { message: string; code?: string }): { ok: false; status: number; error: string } =>
  isMissingMigration(e) ? { ok: false, status: 503, error: notSetUp } : { ok: false, status: 500, error: e.message };

// ── the thread record ───────────────────────────────────────────────────────

/** Registers a run (or finds the one that exists for the same subject: starting twice is the same run). */
export async function openThread(sb: Sb, i: { tenantId: string; graph: string; subjectType?: string | null; subjectId: string; startedBy?: string | null }): Promise<WriteResult<{ thread: ThreadRow; created: boolean }>> {
  const threadId = SupabaseCheckpointSaver.threadId(i.tenantId, i.graph, i.subjectId);
  const existing = await sb.from("langgraph_threads").select(COLS).eq("tenant_id", i.tenantId).eq("thread_id", threadId).maybeSingle();
  if (existing.error) return fail(existing.error);
  if (existing.data) return { ok: true, value: { thread: existing.data as ThreadRow, created: false } };
  const ins = await sb.from("langgraph_threads").insert({ thread_id: threadId, tenant_id: i.tenantId, graph: i.graph, subject_type: i.subjectType ?? null, subject_id: i.subjectId, started_by: i.startedBy ?? null }).select(COLS).single();
  if (ins.error) {
    // two requests opened the same run at once: the second one finds the first
    if (ins.error.code === "23505") {
      const again = await sb.from("langgraph_threads").select(COLS).eq("tenant_id", i.tenantId).eq("thread_id", threadId).maybeSingle();
      if (again.data) return { ok: true, value: { thread: again.data as ThreadRow, created: false } };
    }
    return fail(ins.error);
  }
  return { ok: true, value: { thread: ins.data as ThreadRow, created: true } };
}

export async function getThread(sb: Sb, tenantId: string, threadId: string): Promise<WriteResult<ThreadRow>> {
  const { data, error } = await sb.from("langgraph_threads").select(COLS).eq("tenant_id", tenantId).eq("thread_id", threadId).maybeSingle();
  if (error) return fail(error);
  if (!data) return { ok: false, status: 404, error: "Run not found" };
  return { ok: true, value: data as ThreadRow };
}

export async function listThreads(sb: Sb, tenantId: string, f: { status?: ThreadStatus | null; graph?: string | null; subjectId?: string | null; limit?: number } = {}): Promise<WriteResult<ThreadRow[]>> {
  let q = sb.from("langgraph_threads").select(COLS).eq("tenant_id", tenantId).order("updated_at", { ascending: false }).limit(Math.min(f.limit ?? 50, 200));
  if (f.status) q = q.eq("status", f.status);
  if (f.graph) q = q.eq("graph", f.graph);
  if (f.subjectId) q = q.eq("subject_id", f.subjectId);
  const { data, error } = await q;
  if (error) return fail(error);
  return { ok: true, value: (data ?? []) as ThreadRow[] };
}

/** Moves a run into "running" only if it is in one of the given states: two requests cannot both resume the same run. */
async function claim(sb: Sb, tenantId: string, threadId: string, from: ThreadStatus[]): Promise<ThreadRow | null> {
  const { data, error } = await sb.from("langgraph_threads").update({ status: "running", waiting_for: null }).eq("tenant_id", tenantId).eq("thread_id", threadId).in("status", from).select(COLS);
  if (error) throw new Error(error.message);
  return ((data ?? []) as ThreadRow[])[0] ?? null;
}

async function settle(sb: Sb, tenantId: string, threadId: string, patch: Record<string, unknown>): Promise<void> {
  // a run cancelled while it was working stays cancelled: the database refuses to move it, which is the right answer
  const { error } = await sb.from("langgraph_threads").update(patch).eq("tenant_id", tenantId).eq("thread_id", threadId).eq("status", "running");
  if (error && !/cannot be resumed or changed/.test(error.message)) throw new Error(error.message);
}

/** The reason a graph ended on a refusal, if it did (its end node set `refused` and left a `failure`). */
function refusalOf(values: Record<string, any> | null | undefined): string | null {
  const f = values?.failure;
  return values?.refused === true && typeof f === "string" && f.trim() ? f : null;
}

/** A run that ended on a refusal has no step left to retry: carrying it on would only repeat the refusal. */
async function endedOnRefusal(graph: RunnableGraph, tenantId: string, threadId: string): Promise<string | null> {
  try {
    const state = await graph.getState(configFor(tenantId, threadId));
    return state.next.length === 0 ? refusalOf(state.values) : null;
  } catch { return null; }
}

// ── driving a graph ─────────────────────────────────────────────────────────

/**
 * Runs a graph until it finishes, waits for a person, or fails, recording which in the thread. `input` is the starting
 * state, a Command to answer a question the run asked, or null to carry on from the last saved step.
 */
export async function drive(sb: Sb, graph: RunnableGraph, i: { tenantId: string; threadId: string; input: unknown; onStep?: (chunk: Record<string, unknown>) => void }): Promise<DriveResult> {
  const config = configFor(i.tenantId, i.threadId);
  // The run's trace in Langfuse (a no-op unless it is configured). The thread id is the trace id, so a run that is carried
  // on after a crash continues the same trace, and model calls made inside the graph attach to it by themselves.
  const trace = startRunTrace({ id: i.threadId, name: i.threadId.split(":")[1] ?? "agent-run", tenantId: i.tenantId, metadata: { thread: i.threadId } });
  return withTrace(trace, async () => {
    let interrupt: { value: unknown } | null = null;
    try {
      const stream = await graph.stream(i.input, { ...config, streamMode: "updates" });
      for await (const chunk of stream) {
        const waiting = (chunk as { __interrupt__?: Array<{ value: unknown }> }).__interrupt__;
        if (waiting?.length) interrupt = waiting[0];
        else {
          i.onStep?.(chunk);
          for (const [node, update] of Object.entries(chunk)) trace.span(node, { output: update });
          // a sign of life, so a run whose process died can be told apart from one that is only slow
          await sb.from("langgraph_threads").update({ updated_at: new Date().toISOString() }).eq("tenant_id", i.tenantId).eq("thread_id", i.threadId).eq("status", "running");
        }
      }
      const state = await graph.getState(config);
      const waitingTask = state.tasks.find((t) => (t.interrupts?.length ?? 0) > 0);
      if (interrupt || waitingTask) {
        const value = (interrupt?.value ?? waitingTask?.interrupts?.[0]?.value ?? {}) as Record<string, unknown>;
        await settle(sb, i.tenantId, i.threadId, { status: "interrupted", waiting_for: value });
        trace.event("waiting for a person", { metadata: value });
        trace.end({ status: "waiting" });
        return { status: "interrupted", values: state.values, waitingFor: value } as DriveResult;
      }
      // A graph can end on purpose with a refusal ("not drafting a pitch: nobody qualified this account"). That is not a
      // success, and the thread must not say so: it is recorded as failed, with the reason a person can act on.
      const refusal = refusalOf(state.values);
      if (refusal) {
        await settle(sb, i.tenantId, i.threadId, { status: "failed", last_error: refusal.slice(0, 1000) });
        trace.span("refused", { output: refusal, level: "WARNING" });
        trace.end({ status: "failed", metadata: { error: refusal.slice(0, 300) } });
        return { status: "failed", error: refusal, values: state.values } as DriveResult;
      }
      await settle(sb, i.tenantId, i.threadId, { status: "completed" });
      trace.end({ status: "completed" });
      return { status: "completed", values: state.values } as DriveResult;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await settle(sb, i.tenantId, i.threadId, { status: "failed", last_error: message.slice(0, 1000) });
      trace.span("failed", { output: message, level: "ERROR" });
      trace.end({ status: "failed", metadata: { error: message.slice(0, 300) } });
      let values: Record<string, any> | null = null;
      try { values = (await graph.getState(config)).values; } catch { /* the state may be unreadable too */ }
      return { status: "failed", error: message, values } as DriveResult;
    }
  });
}

export type StartOutcome =
  | { ok: true; result: DriveResult; thread: ThreadRow }
  | { ok: false; status: number; error: string; thread?: ThreadRow };

/**
 * Starts a run for a subject. Starting the same subject again never starts a second run: a finished run answers with
 * its result, a failed one carries on from its last step, one waiting for a person says so, one running says so.
 */
export async function startRun(sb: Sb, graph: RunnableGraph, i: { tenantId: string; graph: string; subjectType?: string; subjectId: string; startedBy?: string | null; initial: unknown; onStep?: (c: Record<string, unknown>) => void }): Promise<StartOutcome> {
  const opened = await openThread(sb, { tenantId: i.tenantId, graph: i.graph, subjectType: i.subjectType, subjectId: i.subjectId, startedBy: i.startedBy });
  if (!opened.ok) return opened;
  const { thread, created } = opened.value;
  const config = configFor(i.tenantId, thread.thread_id);
  if (created) return { ok: true, thread, result: await drive(sb, graph, { tenantId: i.tenantId, threadId: thread.thread_id, input: i.initial, onStep: i.onStep }) };
  switch (thread.status) {
    case "completed": {
      const state = await graph.getState(config);
      return { ok: true, thread, result: { status: "completed", values: state.values } };
    }
    case "failed": {
      const refused = await endedOnRefusal(graph, i.tenantId, thread.thread_id);
      if (refused) return { ok: false, status: 409, error: `This run ended on a refusal, not a crash, so there is nothing to carry on: ${refused} Fix the cause and start a new run.`, thread };
      const claimed = await claim(sb, i.tenantId, thread.thread_id, ["failed"]);
      if (!claimed) return { ok: false, status: 409, error: "Another request is already carrying this run on.", thread };
      return { ok: true, thread: claimed, result: await drive(sb, graph, { tenantId: i.tenantId, threadId: thread.thread_id, input: null, onStep: i.onStep }) };
    }
    case "interrupted":
      return { ok: false, status: 409, error: "This run is waiting for a person. Answer it to carry on.", thread };
    case "running":
      return { ok: false, status: 409, error: "This run is already in progress.", thread };
    case "cancelled":
      return { ok: false, status: 409, error: "This run was cancelled and cannot be started again.", thread };
  }
}

/** Answers the question a waiting run asked (or carries a failed run on from its last step). */
export async function resumeRun(sb: Sb, graph: RunnableGraph, i: { tenantId: string; threadId: string; answer?: unknown; onStep?: (c: Record<string, unknown>) => void }): Promise<StartOutcome> {
  const got = await getThread(sb, i.tenantId, i.threadId);
  if (!got.ok) return got;
  const thread = got.value;
  if (thread.status === "cancelled") return { ok: false, status: 409, error: "This run was cancelled and cannot be resumed.", thread };
  if (thread.status === "completed") return { ok: false, status: 409, error: "This run already finished.", thread };
  if (thread.status === "running") return { ok: false, status: 409, error: "This run is already in progress.", thread };
  const wantsAnswer = thread.status === "interrupted";
  if (thread.status === "failed") {
    const refused = await endedOnRefusal(graph, i.tenantId, i.threadId);
    if (refused) return { ok: false, status: 409, error: `This run ended on a refusal, not a crash, so there is nothing to carry on: ${refused} Fix the cause and start a new run.`, thread };
  }
  const claimed = await claim(sb, i.tenantId, i.threadId, [thread.status]);
  if (!claimed) return { ok: false, status: 409, error: "Another request is already carrying this run on.", thread };
  const input = wantsAnswer ? new Command({ resume: i.answer ?? true }) : null;
  return { ok: true, thread: claimed, result: await drive(sb, graph, { tenantId: i.tenantId, threadId: i.threadId, input, onStep: i.onStep }) };
}

/** Stops a run for good. What it already did stays on record; nothing more is saved or run. */
export async function cancelRun(sb: Sb, i: { tenantId: string; threadId: string; by: string; reason: string }): Promise<WriteResult<ThreadRow>> {
  if (!i.by.trim()) return { ok: false, status: 403, error: "A signed-in person is required." };
  if (i.reason.trim().length < 5) return { ok: false, status: 400, error: "Say why the run is being cancelled (5+ characters)." };
  const got = await getThread(sb, i.tenantId, i.threadId);
  if (!got.ok) return got;
  if (got.value.status === "completed" || got.value.status === "cancelled") return { ok: false, status: 409, error: `This run is already ${got.value.status}.` };
  const { data, error } = await sb.from("langgraph_threads").update({ status: "cancelled", cancelled_by: i.by, cancel_reason: i.reason.trim(), waiting_for: null })
    .eq("tenant_id", i.tenantId).eq("thread_id", i.threadId).in("status", ["running", "interrupted", "failed"]).select(COLS);
  if (error) return fail(error);
  const row = ((data ?? []) as ThreadRow[])[0];
  return row ? { ok: true, value: row } : { ok: false, status: 409, error: "The run changed state; try again." };
}

/**
 * A run whose process died stays "running" with no sign of life. Marks those failed so they can be carried on from the
 * last saved step. Safe to run any time and on a schedule.
 */
export async function sweepStuckRuns(sb: Sb, tenantId: string, minutes = 10): Promise<WriteResult<{ marked_failed: string[] }>> {
  const cutoff = new Date(Date.now() - minutes * 60_000).toISOString();
  const { data, error } = await sb.from("langgraph_threads").update({ status: "failed", last_error: "The process stopped while this run was working. It can be carried on from its last saved step." })
    .eq("tenant_id", tenantId).eq("status", "running").lt("updated_at", cutoff).select("thread_id");
  if (error) return fail(error);
  return { ok: true, value: { marked_failed: ((data ?? []) as Array<{ thread_id: string }>).map((r) => r.thread_id) } };
}

/** What a run has saved so far, for the person looking at it. */
export async function inspectRun(sb: Sb, graph: RunnableGraph, tenantId: string, threadId: string): Promise<WriteResult<{ thread: ThreadRow; next: string[]; values: Record<string, unknown> }>> {
  const got = await getThread(sb, tenantId, threadId);
  if (!got.ok) return got;
  const state = await graph.getState(configFor(tenantId, threadId));
  return { ok: true, value: { thread: got.value, next: state.next, values: state.values } };
}
