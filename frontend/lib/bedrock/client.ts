import {
  BedrockRuntimeClient,
  InvokeModelCommand,
  ConverseCommand,
} from "@aws-sdk/client-bedrock-runtime";
import { serverEnv } from "@/lib/env";
import { checkDailySpendCap, recordSpend, bedrockCallCostUsd } from "@/lib/monitoring/spend-guard";
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
async function assertUnderSpendCap(): Promise<void> {
  const capCheck = await checkDailySpendCap();
  if (!capCheck.ok) {
    void notifySpendCapHit(capCheck.todaySpendUsd, capCheck.capUsd);
    throw new Error(
      `Daily AI spend cap reached ($${capCheck.todaySpendUsd.toFixed(2)} / $${capCheck.capUsd.toFixed(2)}) — Bedrock calls are paused until tomorrow (UTC) or the cap is raised.`
    );
  }
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
}

export interface ClaudeResult<T = string> {
  text: string;
  json: T | null;
  usage: { input_tokens?: number; output_tokens?: number } | null;
  raw: unknown;
}

let cachedClient: BedrockRuntimeClient | null = null;

function client() {
  if (cachedClient) return cachedClient;
  const env = serverEnv();
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
 * Hardening (Phase 2 continuity): Bedrock credentials can fail for reasons
 * unrelated to our own code (rotated/deactivated AWS key, region outage).
 * When ANTHROPIC_API_KEY is configured, a failed Bedrock call falls back to
 * the direct Anthropic API instead of taking down every AI feature at once —
 * same provider-abstraction principle already applied to enrichment vendors
 * (Pattern 2). Spend cap is still enforced once up front either way.
 */
export async function invokeClaude<T = unknown>(
  opts: InvokeClaudeOptions,
): Promise<ClaudeResult<T>> {
  await assertUnderSpendCap();

  let result: ClaudeResult<T>;
  let provider: "aws_bedrock" | "anthropic_direct";
  try {
    result = await invokeClaudeViaBedrock<T>(opts);
    provider = "aws_bedrock";
  } catch (bedrockErr) {
    if (!serverEnv().ANTHROPIC_API_KEY) throw bedrockErr;
    logger.warn("[bedrock] invokeClaude failed, falling back to direct Anthropic API", {
      error: bedrockErr instanceof Error ? bedrockErr.message : String(bedrockErr),
    });
    const { invokeClaudeDirect } = await import("@/lib/anthropic/client");
    result = await invokeClaudeDirect<T>(opts);
    provider = "anthropic_direct";
  }

  if (result.usage) {
    await recordSpend({
      category: "bedrock_text",
      provider,
      amountUsd: bedrockCallCostUsd(result.usage.input_tokens ?? 0, result.usage.output_tokens ?? 0),
      metadata: {
        input_tokens: result.usage.input_tokens,
        output_tokens: result.usage.output_tokens,
        api: provider === "aws_bedrock" ? "invoke_model" : "anthropic_direct_fallback",
      },
    });
  }

  traceGeneration({
    name: "invokeClaude",
    model: serverEnv().BEDROCK_MODEL_ID,
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
  usage: { inputTokens: number; outputTokens: number } | null;
};

async function converseWithToolsViaBedrock(opts: {
  system: string;
  messages: ConverseMessage[];
  tools: ToolDefinition[];
  maxTokens?: number;
  temperature?: number;
}): Promise<ConverseResult> {
  const env = serverEnv();

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
 * Falls back to the direct Anthropic API (translating the Converse tool
 * shapes) when Bedrock itself fails and ANTHROPIC_API_KEY is configured —
 * same reasoning as invokeClaude() above.
 */
export async function converseWithTools(opts: {
  system: string;
  messages: ConverseMessage[];
  tools: ToolDefinition[];
  maxTokens?: number;
  temperature?: number;
}): Promise<ConverseResult> {
  await assertUnderSpendCap();

  let result: ConverseResult;
  let provider: "aws_bedrock" | "anthropic_direct";
  try {
    result = await converseWithToolsViaBedrock(opts);
    provider = "aws_bedrock";
  } catch (bedrockErr) {
    if (!serverEnv().ANTHROPIC_API_KEY) throw bedrockErr;
    logger.warn("[bedrock] converseWithTools failed, falling back to direct Anthropic API", {
      error: bedrockErr instanceof Error ? bedrockErr.message : String(bedrockErr),
    });
    const { converseWithToolsDirect } = await import("@/lib/anthropic/client");
    result = await converseWithToolsDirect(opts);
    provider = "anthropic_direct";
  }

  if (result.usage) {
    await recordSpend({
      category: "bedrock_text",
      provider,
      amountUsd: bedrockCallCostUsd(result.usage.inputTokens ?? 0, result.usage.outputTokens ?? 0),
      metadata: {
        input_tokens: result.usage.inputTokens,
        output_tokens: result.usage.outputTokens,
        api: provider === "aws_bedrock" ? "converse" : "anthropic_direct_fallback",
      },
    });
  }

  traceGeneration({
    name: "converseWithTools",
    model: serverEnv().BEDROCK_MODEL_ID,
    input: { system: opts.system, messages: opts.messages, tools: opts.tools.map((t) => t.toolSpec.name) },
    output: result.text || JSON.stringify(result.toolCalls),
    usage: result.usage
      ? { promptTokens: result.usage.inputTokens, completionTokens: result.usage.outputTokens }
      : null,
    metadata: { provider, stopReason: result.stopReason, toolCalls: result.toolCalls.map((t) => t.name) },
  });

  return result;
}
