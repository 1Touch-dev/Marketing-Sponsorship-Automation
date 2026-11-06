import {
  BedrockRuntimeClient,
  InvokeModelCommand,
  ConverseCommand,
} from "@aws-sdk/client-bedrock-runtime";
import { serverEnv } from "@/lib/env";
import { checkDailySpendCap, recordSpend, bedrockCallCostUsd, reserveInFlightCall } from "@/lib/monitoring/spend-guard";
import { CallThrottle, ProviderBreaker, callerLabel, callsPerMinuteLimit, openaiTextCostUsd } from "@/lib/ai/cost-controls";
import { runProviderChain, type Attempt } from "@/lib/ai/provider-chain";
import { isOpenAITextConfigured, openaiTextModel, openaiToolModel } from "@/lib/openai/text-client";
import { logger } from "@/lib/monitoring/logger";
import { notifySpendCapHit } from "@/lib/slack/notify";
import { traceGeneration } from "@/lib/observability/langfuse";

/**
 * Hardening pass (master_report.md Section 8, Pattern 5). Centralized here —
 * both invokeClaude and converseWithTools are the only two entry points for
 * every Bedrock call in the codebase (proposal/email generation, the
 * Outreach Agent's tool loop, pricing tiers, etc.) — instrumenting once here
 * covers all of them, present and future, rather than every call site
 * separately.
 */
const callThrottle = new CallThrottle(callsPerMinuteLimit());
// Bedrock credentials are dead in this deployment; after one failure, go
// straight to the direct Anthropic API for a while instead of paying a failed
// round trip (and the AWS SDK's own retries) in front of every call.
const bedrockBreaker = new ProviderBreaker();
// Same idea one step down: if the Anthropic API itself is refusing us (disabled org, bad key, outage), go
// straight to the OpenAI backup for a while instead of waiting on a failing call first each time.
const anthropicBreaker = new ProviderBreaker();

/** Order tried for every text call: Bedrock, then the direct Anthropic API, then OpenAI. A step is only present when it is configured. */
type TextProvider = "aws_bedrock" | "anthropic_direct" | "openai_text";

/** Bedrock is only attempted when AWS keys + model id are configured. */
export function isBedrockConfigured(): boolean {
  const e = serverEnv();
  return !!(e.AWS_ACCESS_KEY_ID && e.AWS_SECRET_ACCESS_KEY && e.BEDROCK_MODEL_ID);
}

function modelFor(p: TextProvider, withTools = false): string {
  if (p === "openai_text") return withTools ? openaiToolModel() : openaiTextModel();
  if (p === "anthropic_direct") return process.env.ANTHROPIC_MODEL_ID || "claude-sonnet-4-6";
  return serverEnv().BEDROCK_MODEL_ID ?? "bedrock-unconfigured";
}

function apiLabel(p: TextProvider, bedrockApi: string): string {
  return p === "aws_bedrock" ? bedrockApi : p === "anthropic_direct" ? "anthropic_direct_fallback" : "openai_fallback";
}

function costFor(p: TextProvider, model: string, input: number, output: number, cacheRead: number, cacheWrite: number): number {
  return p === "openai_text"
    ? openaiTextCostUsd({ input, output, cacheRead }, model)
    : bedrockCallCostUsd(input, output, cacheRead, cacheWrite);
}

function logFallback(call: string) {
  return (failed: TextProvider, error: unknown) =>
    logger.warn(`[ai] ${call}: ${failed} failed, trying the next provider`, {
      error: error instanceof Error ? error.message : String(error),
    });
}

/**
 * Runs before every Claude call: refuses when the daily cap is reached or the
 * call rate looks like a runaway loop, and reserves an estimated cost so
 * parallel calls count against the cap before they finish. Returns the
 * release function for that reservation.
 */
async function guardCall(): Promise<() => void> {
  if (!callThrottle.tryAcquire()) {
    throw new Error(
      `AI call rate limit reached (${callsPerMinuteLimit()} calls per minute) — paused to stop a runaway loop. Try again in a minute, or raise AI_MAX_CALLS_PER_MIN.`
    );
  }
  const capCheck = await checkDailySpendCap();
  if (!capCheck.ok) {
    void notifySpendCapHit(capCheck.todaySpendUsd, capCheck.capUsd);
    throw new Error(
      `Daily AI spend cap reached ($${capCheck.todaySpendUsd.toFixed(2)} / $${capCheck.capUsd.toFixed(2)}) — Bedrock calls are paused until tomorrow (UTC) or the cap is raised.`
    );
  }
  return reserveInFlightCall();
}

/**
 * Anthropic Claude on Bedrock — Messages API format.
 * Docs: https://docs.aws.amazon.com/bedrock/latest/userguide/model-parameters-anthropic-claude-messages.html
 */
export interface ClaudeMessage {
  role: "user" | "assistant";
  content: string;
}

export interface InvokeClaudeOptions {
  system?: string;
  messages: ClaudeMessage[];
  maxTokens?: number;
  temperature?: number;
  /** When true, the system prompt asks Claude to return strict JSON
   *  and the response is parsed before returning. */
  json?: boolean;
  /** Pattern 11 (cost-to-serve, master_report.md Section 8) — optionally
   *  attribute this call's spend_ledger row to the company/proposal/lead
   *  it was generated for, so real per-lead AI cost is queryable instead
   *  of only ever a company-wide total. Omit for calls not tied to a
   *  single entity (e.g. generic intelligence lookups). */
  entityType?: string;
  entityId?: string | null;
}

export interface ClaudeResult<T = string> {
  text: string;
  json: T | null;
  usage: {
    input_tokens?: number;
    output_tokens?: number;
    cache_read_input_tokens?: number;
    cache_creation_input_tokens?: number;
  } | null;
  raw: unknown;
}

let cachedClient: BedrockRuntimeClient | null = null;

function client() {
  if (cachedClient) return cachedClient;
  const env = serverEnv();
  if (!env.AWS_ACCESS_KEY_ID || !env.AWS_SECRET_ACCESS_KEY) {
    throw new Error("AWS Bedrock credentials are not configured");
  }
  cachedClient = new BedrockRuntimeClient({
    region: env.AWS_REGION,
    credentials: {
      accessKeyId: env.AWS_ACCESS_KEY_ID,
      secretAccessKey: env.AWS_SECRET_ACCESS_KEY,
    },
  });
  return cachedClient;
}

export function extractJson(text: string): unknown | null {
  if (!text || !text.trim()) return null;

  // 1. Try parsing the whole text directly
  try {
    return JSON.parse(text.trim());
  } catch { /* keep trying */ }

  // 2. Strip markdown code fences (```json ... ``` or ``` ... ```)
  const stripped = text
    .replace(/^```(?:json)?\s*/m, "")
    .replace(/\s*```\s*$/m, "")
    .trim();
  try {
    return JSON.parse(stripped);
  } catch { /* keep trying */ }

  // 3. Greedy fallback: take everything from first { or [ to last } or ]
  const firstBrace = stripped.indexOf("{");
  const firstBracket = stripped.indexOf("[");
  if (firstBrace !== -1) {
    const lastBrace = stripped.lastIndexOf("}");
    if (lastBrace > firstBrace) {
      try { return JSON.parse(stripped.slice(firstBrace, lastBrace + 1)); } catch { /* keep trying */ }
    }
  }
  if (firstBracket !== -1) {
    const lastBracket = stripped.lastIndexOf("]");
    if (lastBracket > firstBracket) {
      try { return JSON.parse(stripped.slice(firstBracket, lastBracket + 1)); } catch { /* keep trying */ }
    }
  }

  // 4. Same on original text
  const firstBraceOrig = text.indexOf("{");
  if (firstBraceOrig !== -1) {
    const lastBraceOrig = text.lastIndexOf("}");
    if (lastBraceOrig > firstBraceOrig) {
      try { return JSON.parse(text.slice(firstBraceOrig, lastBraceOrig + 1)); } catch { /* give up */ }
    }
  }

  return null;
}

async function invokeClaudeViaBedrock<T = unknown>(
  opts: InvokeClaudeOptions,
): Promise<ClaudeResult<T>> {
  const env = serverEnv();
  const body = {
    anthropic_version: "bedrock-2023-05-31",
    max_tokens: opts.maxTokens ?? 2048,
    temperature: opts.temperature ?? 0.4,
    system: opts.system,
    messages: opts.messages.map((m) => ({
      role: m.role,
      content: [{ type: "text", text: m.content }],
    })),
  };

  if (!env.BEDROCK_MODEL_ID) throw new Error("BEDROCK_MODEL_ID is not configured");
  const cmd = new InvokeModelCommand({
    modelId: env.BEDROCK_MODEL_ID,
    contentType: "application/json",
    accept: "application/json",
    body: new TextEncoder().encode(JSON.stringify(body)),
  });

  const response = await client().send(cmd);
  const raw = JSON.parse(new TextDecoder().decode(response.body));

  // Claude messages API: { content: [{ type: 'text', text: '...' }, ...], usage: {...} }
  const text =
    Array.isArray(raw?.content)
      ? raw.content
          .filter((c: { type: string }) => c.type === "text")
          .map((c: { text: string }) => c.text)
          .join("\n")
      : "";

  const parsed = opts.json ? (extractJson(text) as T | null) : null;
  const usage = raw?.usage ?? null;

  return { text, json: parsed, usage, raw };
}

/**
 * Hardening (Phase 2 continuity): any one provider can fail for reasons unrelated to our own code (rotated AWS
 * key, region outage, a disabled Anthropic org). Each call tries Bedrock, then the direct Anthropic API
 * (ANTHROPIC_API_KEY), then OpenAI (OPENAI_API_KEY), using whichever are configured, so one failing vendor
 * does not take down every AI feature — same provider-abstraction principle already applied to enrichment
 * vendors (Pattern 2). Spend cap is still enforced once up front either way.
 */
export async function invokeClaude<T = unknown>(
  opts: InvokeClaudeOptions,
): Promise<ClaudeResult<T>> {
  const label = callerLabel(new Error().stack);
  const release = await guardCall();

  let result: ClaudeResult<T>;
  let provider: TextProvider;
  try {
    const attempts: Array<Attempt<TextProvider, ClaudeResult<T>>> = [];
    if (isBedrockConfigured()) {
      attempts.push({
        provider: "aws_bedrock",
        breaker: bedrockBreaker,
        run: () => invokeClaudeViaBedrock<T>(opts),
      });
    }
    if (serverEnv().ANTHROPIC_API_KEY) {
      attempts.push({
        provider: "anthropic_direct",
        breaker: anthropicBreaker,
        run: async () => (await import("@/lib/anthropic/client")).invokeClaudeDirect<T>(opts),
      });
    }
    if (isOpenAITextConfigured()) {
      attempts.push({
        provider: "openai_text",
        run: async () => (await import("@/lib/openai/text-client")).invokeOpenAIText<T>(opts),
      });
    }
    ({ provider, result } = await runProviderChain(attempts, logFallback("invokeClaude")));
  } finally {
    release();
  }

  if (result.usage) {
    await recordSpend({
      category: "bedrock_text",
      provider,
      amountUsd: costFor(
        provider,
        modelFor(provider),
        result.usage.input_tokens ?? 0,
        result.usage.output_tokens ?? 0,
        result.usage.cache_read_input_tokens ?? 0,
        result.usage.cache_creation_input_tokens ?? 0,
      ),
      entityType: opts.entityType,
      entityId: opts.entityId,
      metadata: {
        input_tokens: result.usage.input_tokens,
        output_tokens: result.usage.output_tokens,
        cache_read_input_tokens: result.usage.cache_read_input_tokens ?? 0,
        cache_creation_input_tokens: result.usage.cache_creation_input_tokens ?? 0,
        label,
        api: apiLabel(provider, "invoke_model"),
        model: modelFor(provider),
      },
    });
  }

  traceGeneration({
    name: "invokeClaude",
    model: modelFor(provider),
    input: { system: opts.system, messages: opts.messages },
    output: result.text,
    usage: result.usage
      ? { promptTokens: result.usage.input_tokens, completionTokens: result.usage.output_tokens }
      : null,
    metadata: { provider },
  });

  return result;
}

// ── Converse API (tool use) ────────────────────────────────────────────────────

export type ToolDefinition = {
  toolSpec: {
    name: string;
    description: string;
    inputSchema: { json: Record<string, unknown> };
  };
};

export type ConverseMessage = {
  role: "user" | "assistant";
  content: Array<
    | { text: string }
    | { toolUse: { toolUseId: string; name: string; input: Record<string, unknown> } }
    | { toolResult: { toolUseId: string; content: Array<{ text?: string; json?: unknown }>; status?: "success" | "error" } }
  >;
};

export type ConverseTool = {
  name: string;
  input: Record<string, unknown>;
  toolUseId: string;
};

export type ConverseResult = {
  stopReason: string;
  message: ConverseMessage;
  toolCalls: ConverseTool[];
  text: string;
  usage: { inputTokens: number; outputTokens: number; cacheReadTokens?: number; cacheWriteTokens?: number } | null;
};

async function converseWithToolsViaBedrock(opts: {
  system: string;
  messages: ConverseMessage[];
  tools: ToolDefinition[];
  maxTokens?: number;
  temperature?: number;
}): Promise<ConverseResult> {
  const env = serverEnv();
  if (!env.BEDROCK_MODEL_ID) throw new Error("BEDROCK_MODEL_ID is not configured");

  // ConverseCommand SDK types use nested generics that don't align cleanly with our custom message types.
  // Using 'as any' casts here is safe — the runtime values are correctly shaped for the API.
  const cmd = new ConverseCommand({
    modelId: env.BEDROCK_MODEL_ID,
    system: [{ text: opts.system }],
    messages: opts.messages as any,
    toolConfig: { tools: opts.tools as any },
    inferenceConfig: {
      maxTokens: opts.maxTokens ?? 4096,
      temperature: opts.temperature ?? 0.3,
    },
  } as any);

  const response = await client().send(cmd);
  const msg = (response.output?.message ?? { role: "assistant", content: [] }) as ConverseMessage;

  const toolCalls: ConverseTool[] = [];
  let text = "";

  for (const block of msg.content) {
    if ("text" in block && block.text) {
      text += block.text;
    } else if ("toolUse" in block && block.toolUse) {
      toolCalls.push({
        name: block.toolUse.name,
        input: block.toolUse.input as Record<string, unknown>,
        toolUseId: block.toolUse.toolUseId,
      });
    }
  }

  return {
    stopReason: response.stopReason ?? "end_turn",
    message: msg,
    toolCalls,
    text,
    usage: response.usage
      ? { inputTokens: response.usage.inputTokens ?? 0, outputTokens: response.usage.outputTokens ?? 0 }
      : null,
  };
}

/**
 * Claude Converse API — supports multi-turn tool use (agentic loops).
 * Uses ConverseCommand which natively handles tool_use / tool_result turns.
 * Falls back through the same chain as invokeClaude() (Anthropic, then OpenAI), translating the Converse
 * tool shapes for each.
 */
export async function converseWithTools(opts: {
  system: string;
  messages: ConverseMessage[];
  tools: ToolDefinition[];
  maxTokens?: number;
  temperature?: number;
  /** Pattern 11 (cost-to-serve) — see InvokeClaudeOptions.entityType/entityId. */
  entityType?: string;
  entityId?: string | null;
}): Promise<ConverseResult> {
  const label = callerLabel(new Error().stack);
  const release = await guardCall();

  let result: ConverseResult;
  let provider: TextProvider;
  try {
    const attempts: Array<Attempt<TextProvider, ConverseResult>> = [];
    if (isBedrockConfigured()) {
      attempts.push({
        provider: "aws_bedrock",
        breaker: bedrockBreaker,
        run: () => converseWithToolsViaBedrock(opts),
      });
    }
    if (serverEnv().ANTHROPIC_API_KEY) {
      attempts.push({
        provider: "anthropic_direct",
        breaker: anthropicBreaker,
        run: async () => (await import("@/lib/anthropic/client")).converseWithToolsDirect(opts),
      });
    }
    if (isOpenAITextConfigured()) {
      attempts.push({
        provider: "openai_text",
        run: async () => (await import("@/lib/openai/text-client")).converseWithToolsOpenAI(opts),
      });
    }
    ({ provider, result } = await runProviderChain(attempts, logFallback("converseWithTools")));
  } finally {
    release();
  }

  if (result.usage) {
    await recordSpend({
      category: "bedrock_text",
      provider,
      amountUsd: costFor(
        provider,
        modelFor(provider, true),
        result.usage.inputTokens ?? 0,
        result.usage.outputTokens ?? 0,
        result.usage.cacheReadTokens ?? 0,
        result.usage.cacheWriteTokens ?? 0,
      ),
      entityType: opts.entityType,
      entityId: opts.entityId,
      metadata: {
        input_tokens: result.usage.inputTokens,
        output_tokens: result.usage.outputTokens,
        cache_read_input_tokens: result.usage.cacheReadTokens ?? 0,
        cache_creation_input_tokens: result.usage.cacheWriteTokens ?? 0,
        label,
        api: apiLabel(provider, "converse"),
        model: modelFor(provider, true),
      },
    });
  }

  traceGeneration({
    name: "converseWithTools",
    model: modelFor(provider, true),
    input: { system: opts.system, messages: opts.messages, tools: opts.tools.map((t) => t.toolSpec.name) },
    output: result.text || JSON.stringify(result.toolCalls),
    usage: result.usage
      ? { promptTokens: result.usage.inputTokens, completionTokens: result.usage.outputTokens }
      : null,
    metadata: { provider, stopReason: result.stopReason, toolCalls: result.toolCalls.map((t) => t.name) },
  });

  return result;
}
