import Anthropic from "@anthropic-ai/sdk";
import { serverEnv } from "@/lib/env";
import { extractJson } from "@/lib/bedrock/client";
import { clampMaxTokens, MIN_CACHEABLE_CHARS, prefixChars, systemBlocks, withToolCache } from "@/lib/ai/cost-controls";
import type {
  ClaudeResult,
  ConverseMessage,
  ConverseResult,
  ConverseTool,
  InvokeClaudeOptions,
  ToolDefinition,
} from "@/lib/bedrock/client";

/**
 * Direct Anthropic API — fallback used by lib/bedrock/client.ts when the
 * Bedrock call itself fails (e.g. invalid/rotated AWS credentials, region
 * outage). Same model, same pricing ($3/$15 per M input/output tokens as of
 * 2026-09), same Messages API shape underneath — the only real work here is
 * translating Bedrock's Converse tool-use format to Anthropic's native one
 * for converseWithToolsDirect().
 *
 * Model id note: Bedrock uses "us.anthropic.claude-sonnet-4-6" (inference
 * profile prefix); the direct Anthropic API uses the bare "claude-sonnet-4-6".
 */
const DIRECT_MODEL_ID = process.env.ANTHROPIC_MODEL_ID || "claude-sonnet-4-6";

let cachedClient: Anthropic | null = null;

function client(): Anthropic {
  if (cachedClient) return cachedClient;
  const env = serverEnv();
  if (!env.ANTHROPIC_API_KEY) {
    throw new Error("ANTHROPIC_API_KEY is not configured — cannot use the direct Anthropic fallback");
  }
  // Bounded: a hung request must not pile up behind retries.
  cachedClient = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY, timeout: 120_000, maxRetries: 2 });
  return cachedClient;
}

export function isAnthropicFallbackConfigured(): boolean {
  return !!serverEnv().ANTHROPIC_API_KEY;
}

export async function invokeClaudeDirect<T = unknown>(
  opts: InvokeClaudeOptions,
): Promise<ClaudeResult<T>> {
  const res = await client().messages.create({
    model: DIRECT_MODEL_ID,
    max_tokens: clampMaxTokens(opts.maxTokens, 2048),
    temperature: opts.temperature ?? 0.4,
    // The system prompt is the static part of a call; mark it cacheable when
    // it is large enough to cache, so repeat calls read it at a tenth of the price.
    system: systemBlocks(opts.system),
    messages: opts.messages.map((m) => ({ role: m.role, content: m.content })),
  });

  const text = res.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("\n");

  const parsed = opts.json ? (extractJson(text) as T | null) : null;

  return {
    text,
    json: parsed,
    usage: {
      input_tokens: res.usage.input_tokens,
      output_tokens: res.usage.output_tokens,
      cache_read_input_tokens: res.usage.cache_read_input_tokens ?? 0,
      cache_creation_input_tokens: res.usage.cache_creation_input_tokens ?? 0,
    },
    raw: res,
  };
}

// ── Converse/tool-use translation (Bedrock Converse shape <-> Anthropic Messages shape) ──

function toAnthropicTools(tools: ToolDefinition[]): Anthropic.Tool[] {
  return tools.map((t) => ({
    name: t.toolSpec.name,
    description: t.toolSpec.description,
    input_schema: t.toolSpec.inputSchema.json as Anthropic.Tool["input_schema"],
  }));
}

function toAnthropicMessages(messages: ConverseMessage[]): Anthropic.MessageParam[] {
  return messages.map((m) => ({
    role: m.role,
    content: m.content.map((block): Anthropic.ContentBlockParam => {
      if ("text" in block) {
        return { type: "text", text: block.text };
      }
      if ("toolUse" in block) {
        return {
          type: "tool_use",
          id: block.toolUse.toolUseId,
          name: block.toolUse.name,
          input: block.toolUse.input,
        };
      }
      const tr = block.toolResult;
      return {
        type: "tool_result",
        tool_use_id: tr.toolUseId,
        content: tr.content.map((c) => ({
          type: "text" as const,
          text: c.text ?? JSON.stringify(c.json ?? ""),
        })),
        is_error: tr.status === "error",
      };
    }),
  }));
}

export async function converseWithToolsDirect(opts: {
  system: string;
  messages: ConverseMessage[];
  tools: ToolDefinition[];
  maxTokens?: number;
  temperature?: number;
}): Promise<ConverseResult> {
  const tools = toAnthropicTools(opts.tools);
  const messages = toAnthropicMessages(opts.messages);

  // Agent loops resend tools + system prompt + the whole history every turn.
  // Cache the static prefix (tools and system) with explicit markers, and let
  // automatic caching cover the growing conversation tail. Skipped when the
  // whole request is too small to cache, so small calls never pay the write premium.
  const cacheable = prefixChars(opts.system, tools) + JSON.stringify(messages).length >= MIN_CACHEABLE_CHARS;

  const res = await client().messages.create({
    model: DIRECT_MODEL_ID,
    max_tokens: clampMaxTokens(opts.maxTokens, 4096),
    temperature: opts.temperature ?? 0.3,
    system: cacheable ? systemBlocks(opts.system) : opts.system,
    messages,
    tools: cacheable ? withToolCache(tools) : tools,
    ...(cacheable ? { cache_control: { type: "ephemeral" as const } } : {}),
  });

  const toolCalls: ConverseTool[] = [];
  const contentBlocks: ConverseMessage["content"] = [];
  let text = "";

  for (const block of res.content) {
    if (block.type === "text") {
      text += block.text;
      contentBlocks.push({ text: block.text });
    } else if (block.type === "tool_use") {
      const input = block.input as Record<string, unknown>;
      toolCalls.push({ name: block.name, input, toolUseId: block.id });
      contentBlocks.push({ toolUse: { toolUseId: block.id, name: block.name, input } });
    }
  }

  return {
    stopReason: res.stop_reason ?? "end_turn",
    message: { role: "assistant", content: contentBlocks },
    toolCalls,
    text,
    usage: {
      inputTokens: res.usage.input_tokens,
      outputTokens: res.usage.output_tokens,
      cacheReadTokens: res.usage.cache_read_input_tokens ?? 0,
      cacheWriteTokens: res.usage.cache_creation_input_tokens ?? 0,
    },
  };
}
