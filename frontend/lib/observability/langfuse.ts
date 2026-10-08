import { AsyncLocalStorage } from "async_hooks";
import { Langfuse } from "langfuse";
import { logger } from "@/lib/monitoring/logger";
import { forTrace } from "./redact";

/**
 * Langfuse: what the agents and AI calls did, step by step, so quality can be looked at against real cases instead of
 * guessed at (task 31). Everything here is optional and safe:
 *   - with no LANGFUSE_PUBLIC_KEY / LANGFUSE_SECRET_KEY it does nothing at all, and nothing calls out;
 *   - it never throws and never waits on the network, so a Langfuse outage cannot slow or break an agent;
 *   - nothing is sent before it passes through redact.ts (personal data fingerprinted, text cut; see LANGFUSE_CAPTURE).
 *
 * A TRACE is one agent run (its id is the run's thread id), with a SPAN for each graph step, a GENERATION for each model
 * call (tokens, cost, latency), an EVENT for each time it waited for a person, and SCORES: what a person decided about its
 * work (approved, rejected, edited) and how it did on an evaluation gate.
 */

/** The part of the Langfuse SDK used here; tests supply a fake with the same shape. */
export interface LangfuseLike {
  trace(body: Record<string, unknown>): TraceLike;
  score(body: Record<string, unknown>): unknown;
  flushAsync(): Promise<unknown>;
}
export interface TraceLike {
  span(body: Record<string, unknown>): unknown;
  generation(body: Record<string, unknown>): unknown;
  event(body: Record<string, unknown>): unknown;
  update(body: Record<string, unknown>): unknown;
}

let cached: LangfuseLike | null | undefined;
let warned = false;

export function setLangfuseForTests(client: LangfuseLike | null | undefined): void { cached = client; }

function client(): LangfuseLike | null {
  if (cached !== undefined) return cached;
  // Read directly: this must work, and say "off", even where the rest of the server's configuration is not loaded.
  const LANGFUSE_PUBLIC_KEY = process.env.LANGFUSE_PUBLIC_KEY?.trim();
  const LANGFUSE_SECRET_KEY = process.env.LANGFUSE_SECRET_KEY?.trim();
  const LANGFUSE_BASE_URL = process.env.LANGFUSE_BASE_URL?.trim() || undefined;
  if (!LANGFUSE_PUBLIC_KEY || !LANGFUSE_SECRET_KEY) {
    if (!warned) { warned = true; logger.warn("LANGFUSE keys not configured: tracing is off", {}); }
    cached = null;
    return null;
  }
  try {
    cached = new Langfuse({ publicKey: LANGFUSE_PUBLIC_KEY, secretKey: LANGFUSE_SECRET_KEY, baseUrl: LANGFUSE_BASE_URL }) as unknown as LangfuseLike;
  } catch (err) {
    logger.warn("Langfuse could not start: tracing is off", { error: String(err) });
    cached = null;
  }
  return cached;
}

export const tracingEnabled = (): boolean => client() !== null;

/** Runs a call to Langfuse so that nothing it does can reach the caller. */
function safely<T>(what: string, fn: () => T): T | undefined {
  try { return fn(); } catch (err) { logger.warn(`Langfuse ${what} failed`, { error: String(err) }); return undefined; }
}

export interface RunTrace {
  readonly id: string;
  readonly enabled: boolean;
  span(name: string, body?: { input?: unknown; output?: unknown; metadata?: Record<string, unknown>; level?: "DEFAULT" | "WARNING" | "ERROR" }): void;
  event(name: string, body?: { input?: unknown; metadata?: Record<string, unknown> }): void;
  generation(body: GenerationBody): void;
  end(body: { output?: unknown; status: string; metadata?: Record<string, unknown> }): void;
}

export interface GenerationBody {
  name: string; model: string; input: unknown; output: string;
  usage?: { promptTokens?: number; completionTokens?: number } | null;
  costUsd?: number | null; latencyMs?: number | null; metadata?: Record<string, unknown>;
}

const NOOP_TRACE: RunTrace = { id: "", enabled: false, span() {}, event() {}, generation() {}, end() {} };

const als = new AsyncLocalStorage<RunTrace>();
/** The run the current code is part of, if one was started above it. */
export const currentTrace = (): RunTrace | undefined => als.getStore();
/** Runs `fn` as part of `trace`, so model calls made inside it are attached to the run without being passed anything. */
export function withTrace<T>(trace: RunTrace, fn: () => T): T { return als.run(trace, fn); }

const usageOf = (u: GenerationBody["usage"]) => u ? { promptTokens: u.promptTokens, completionTokens: u.completionTokens, totalTokens: u.promptTokens !== undefined && u.completionTokens !== undefined ? u.promptTokens + u.completionTokens : undefined } : undefined;

/**
 * Starts the trace for one agent run. `id` should be stable for the run (the thread id), so a run that is carried on after a
 * crash continues the same trace. Returns a do-nothing trace when tracing is off.
 */
export function startRunTrace(i: { id: string; name: string; tenantId: string; metadata?: Record<string, unknown>; input?: unknown }): RunTrace {
  const lf = client();
  if (!lf) return NOOP_TRACE;
  const t = safely("trace", () => lf.trace({ id: i.id, name: i.name, sessionId: i.tenantId, metadata: { tenant: i.tenantId, ...(i.metadata ?? {}) }, input: forTrace(i.input) }));
  if (!t) return NOOP_TRACE;
  const trace: RunTrace = {
    id: i.id, enabled: true,
    span: (name, b = {}) => { safely("span", () => t.span({ name, input: forTrace(b.input), output: forTrace(b.output), metadata: b.metadata, level: b.level })); },
    event: (name, b = {}) => { safely("event", () => t.event({ name, input: forTrace(b.input), metadata: b.metadata })); },
    generation: (g) => { safely("generation", () => t.generation({ name: g.name, model: g.model, input: forTrace(g.input), output: forTrace(g.output), usage: usageOf(g.usage), metadata: { ...(g.metadata ?? {}), cost_usd: g.costUsd ?? undefined, latency_ms: g.latencyMs ?? undefined } })); },
    end: (b) => { safely("end", () => t.update({ output: forTrace(b.output), metadata: { status: b.status, ...(b.metadata ?? {}) } })); },
  };
  return trace;
}

/** A score on a run: what a person decided, or how it did on a gate. `value` is 0 to 1 unless stated. */
export function scoreRun(traceId: string, name: string, value: number, comment?: string): void {
  const lf = client();
  if (!lf || !traceId) return;
  safely("score", () => lf.score({ traceId, name, value, comment: comment ? String(forTrace(comment)).slice(0, 500) : undefined }));
}

/**
 * Logs one model call. Attached to the current run's trace when there is one; on its own otherwise. Kept with its original
 * signature so every existing call site is unchanged.
 */
export function traceGeneration(args: {
  name: string; model: string; input: unknown; output: string;
  usage?: { promptTokens?: number; completionTokens?: number } | null; metadata?: Record<string, unknown>;
}): void {
  const lf = client();
  if (!lf) return;
  const run = currentTrace();
  if (run?.enabled) { run.generation(args); return; }
  safely("generation", () => lf.trace({ name: args.name }).generation({ name: args.name, model: args.model, input: forTrace(args.input), output: forTrace(args.output), usage: usageOf(args.usage), metadata: args.metadata }));
}

/** Force-flush queued events now rather than on the SDK's timer: on shutdown, and in tests. */
export async function flushLangfuse(): Promise<void> {
  const lf = client();
  if (!lf) return;
  try { await lf.flushAsync(); } catch (err) { logger.warn("Langfuse flush failed", { error: String(err) }); }
}
