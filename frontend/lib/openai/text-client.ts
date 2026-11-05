import type {
  ClaudeResult,
  ConverseMessage,
  ConverseResult,
  ConverseTool,
  InvokeClaudeOptions,
  ToolDefinition,
} from "@/lib/bedrock/client";
import { extractJson } from "@/lib/bedrock/client";
import { clampMaxTokens } from "@/lib/ai/cost-controls";

/**
 * OpenAI — the last backup for every text call that normally goes to Claude.
 *
 * lib/bedrock/client.ts tries Bedrock, then the direct Anthropic API, then this. It speaks the same two shapes
 * (a plain message call and the tool-use "Converse" loop), so no caller changes. Plain fetch, no SDK, so a
 * deploy needs no `npm install`. Image generation has its own code (lib/media/openai-*) and is not touched.
 *
 * Settings (all optional except the key): OPENAI_API_KEY, OPENAI_TEXT_MODEL (default below), OPENAI_BASE_URL,
 * OPENAI_TOOL_MODEL (default below), OPENAI_TOOL_REASONING_EFFORT (default "none", which the tool model needs).
 */
export const DEFAULT_OPENAI_TEXT_MODEL = "gpt-6.1-sol";
/**
 * Tool-use turns need a model that can call functions on the Chat Completions endpoint. Found in a live test
 * (5 Nov 2026): gpt-6.1-sol and gpt-6-astra refuse function tools there (they only accept them on /v1/responses),
 * while gpt-6.1-terra, gpt-6-luna and gpt-5.5 accept them. Terra is the default for tool turns.
 */
export const DEFAULT_OPENAI_TOOL_MODEL = "gpt-6.1-terra";

export const openaiTextModel = () => process.env.OPENAI_TEXT_MODEL?.trim() || DEFAULT_OPENAI_TEXT_MODEL;
export const openaiToolModel = () => process.env.OPENAI_TOOL_MODEL?.trim() || DEFAULT_OPENAI_TOOL_MODEL;
export const isOpenAITextConfigured = () => !!process.env.OPENAI_API_KEY?.trim();
const baseUrl = () => (process.env.OPENAI_BASE_URL?.trim() || "https://api.openai.com/v1").replace(/\/+$/, "");

export class OpenAIHttpError extends Error {
  constructor(public readonly status: number, public readonly body: string) {
    super(`OpenAI ${status}: ${body}`);
    this.name = "OpenAIHttpError";
  }
}

/** Never let a key fragment from an error body reach logs or the ledger. */
const scrub = (s: string) => s.replace(/sk-[A-Za-z0-9_-]{6,}/g, "sk-***").slice(0, 400);

// ── Wire types (only what we use) ────────────────────────────────────────────
type OAIToolCall = { id: string; type: "function"; function: { name: string; arguments: string } };
export type OAIMessage =
  | { role: "system" | "user"; content: string }
  | { role: "assistant"; content: string | null; tool_calls?: OAIToolCall[] }
  | { role: "tool"; tool_call_id: string; content: string };
type OAIResponse = {
  choices?: Array<{ message?: { content?: string | null; tool_calls?: OAIToolCall[] }; finish_reason?: string }>;
  usage?: { prompt_tokens?: number; completion_tokens?: number; prompt_tokens_details?: { cached_tokens?: number } };
};

// ── Translation: Converse shapes -> OpenAI chat ──────────────────────────────
export function toOpenAIMessages(system: string | undefined, messages: ConverseMessage[]): OAIMessage[] {
  const out: OAIMessage[] = [];
  if (system) out.push({ role: "system", content: system });

  for (const m of messages) {
    if (m.role === "assistant") {
      const text = m.content.flatMap((b) => ("text" in b && b.text ? [b.text] : [])).join("\n");
      const toolCalls: OAIToolCall[] = m.content.flatMap((b) =>
        "toolUse" in b && b.toolUse
          ? [{ id: b.toolUse.toolUseId, type: "function" as const, function: { name: b.toolUse.name, arguments: JSON.stringify(b.toolUse.input ?? {}) } }]
          : [],
      );
      out.push({ role: "assistant", content: text || null, ...(toolCalls.length ? { tool_calls: toolCalls } : {}) });
      continue;
    }
    // A user turn may carry tool results (answers to the assistant's calls) and/or text.
    // OpenAI wants each result as its own "tool" message directly after the assistant's calls.
    for (const b of m.content) {
      if ("toolResult" in b && b.toolResult) {
        const body = b.toolResult.content.map((c) => c.text ?? JSON.stringify(c.json ?? "")).join("\n");
        out.push({ role: "tool", tool_call_id: b.toolResult.toolUseId, content: b.toolResult.status === "error" ? `[error] ${body}` : body });
      }
    }
    const text = m.content.flatMap((b) => ("text" in b && b.text ? [b.text] : [])).join("\n");
    if (text) out.push({ role: "user", content: text });
  }
  return out;
}

export function toOpenAITools(tools: ToolDefinition[]) {
  return tools.map((t) => ({
    type: "function" as const,
    function: { name: t.toolSpec.name, description: t.toolSpec.description, parameters: t.toolSpec.inputSchema.json },
  }));
}

function parseArgs(raw: string | undefined): Record<string, unknown> {
  if (!raw) return {};
  try {
    const v = JSON.parse(raw);
    return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

function usageOf(res: OAIResponse) {
  const prompt = res.usage?.prompt_tokens ?? 0;
  const cached = Math.min(res.usage?.prompt_tokens_details?.cached_tokens ?? 0, prompt);
  return { input: prompt - cached, output: res.usage?.completion_tokens ?? 0, cached };
}

// ── HTTP ─────────────────────────────────────────────────────────────────────
type Fetch = typeof fetch;

async function post(body: Record<string, unknown>, doFetch: Fetch): Promise<OAIResponse> {
  const key = process.env.OPENAI_API_KEY?.trim();
  if (!key) throw new Error("OPENAI_API_KEY is not configured — cannot use the OpenAI backup");
  const res = await doFetch(`${baseUrl()}/chat/completions`, {
    method: "POST",
    headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(120_000),
  });
  const text = await res.text();
  if (!res.ok) throw new OpenAIHttpError(res.status, scrub(text));
  return JSON.parse(text) as OAIResponse;
}

/** Settings a model may refuse; each is dropped (once) and the call retried, so a model change never breaks the backup. */
const DROPPABLE = ["temperature", "reasoning_effort"] as const;

/** One call. Retries once on a busy/transient error, and once per setting the model rejects (temperature, reasoning_effort). */
export async function chatCompletion(body: Record<string, unknown>, doFetch: Fetch = fetch, retryDelayMs = 1500): Promise<OAIResponse> {
  let payload = body;
  let retriedTransient = false;
  for (;;) {
    try {
      return await post(payload, doFetch);
    } catch (err) {
      const status = err instanceof OpenAIHttpError ? err.status : 0;
      if (status === 400) {
        const rejected = DROPPABLE.find((k) => k in payload && (err as OpenAIHttpError).body.includes(k));
        if (rejected) {
          const { [rejected]: _dropped, ...rest } = payload;
          void _dropped;
          payload = rest;
          continue;
        }
      }
      if (!retriedTransient && (status === 429 || status >= 500)) {
        retriedTransient = true;
        await new Promise((r) => setTimeout(r, retryDelayMs));
        continue;
      }
      throw err;
    }
  }
}

// ── Entry points (same shapes as the Anthropic client) ───────────────────────
export async function invokeOpenAIText<T = unknown>(opts: InvokeClaudeOptions, doFetch: Fetch = fetch): Promise<ClaudeResult<T>> {
  const res = await chatCompletion(
    {
      model: openaiTextModel(),
      max_completion_tokens: clampMaxTokens(opts.maxTokens, 2048),
      temperature: opts.temperature ?? 0.4,
      messages: toOpenAIMessages(opts.system, opts.messages.map((m) => ({ role: m.role, content: [{ text: m.content }] }))),
    },
    doFetch,
  );
  const text = res.choices?.[0]?.message?.content ?? "";
  const u = usageOf(res);
  return {
    text,
    json: opts.json ? (extractJson(text) as T | null) : null,
    usage: { input_tokens: u.input, output_tokens: u.output, cache_read_input_tokens: u.cached, cache_creation_input_tokens: 0 },
    raw: res,
  };
}

export async function converseWithToolsOpenAI(
  opts: { system: string; messages: ConverseMessage[]; tools: ToolDefinition[]; maxTokens?: number; temperature?: number },
  doFetch: Fetch = fetch,
): Promise<ConverseResult> {
  const res = await chatCompletion(
    {
      model: openaiToolModel(),
      max_completion_tokens: clampMaxTokens(opts.maxTokens, 4096),
      temperature: opts.temperature ?? 0.3,
      messages: toOpenAIMessages(opts.system, opts.messages),
      // The tool model refuses function tools while it is "thinking" on this endpoint, so tool turns run without it.
      ...(opts.tools.length
        ? { tools: toOpenAITools(opts.tools), tool_choice: "auto", reasoning_effort: process.env.OPENAI_TOOL_REASONING_EFFORT?.trim() || "none" }
        : {}),
    },
    doFetch,
  );
  const choice = res.choices?.[0];
  const text = choice?.message?.content ?? "";
  const toolCalls: ConverseTool[] = [];
  const content: ConverseMessage["content"] = [];
  if (text) content.push({ text });
  for (const tc of choice?.message?.tool_calls ?? []) {
    const input = parseArgs(tc.function?.arguments);
    toolCalls.push({ name: tc.function.name, input, toolUseId: tc.id });
    content.push({ toolUse: { toolUseId: tc.id, name: tc.function.name, input } });
  }
  const u = usageOf(res);
  return {
    stopReason: toolCalls.length > 0 ? "tool_use" : choice?.finish_reason === "length" ? "max_tokens" : "end_turn",
    message: { role: "assistant", content },
    toolCalls,
    text,
    usage: { inputTokens: u.input, outputTokens: u.output, cacheReadTokens: u.cached, cacheWriteTokens: 0 },
  };
}
