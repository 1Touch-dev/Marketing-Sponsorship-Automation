import Anthropic from "@anthropic-ai/sdk";
import { serverEnv } from "@/lib/env";
import { extractJson } from "@/lib/bedrock/client";
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
const DIRECT_MODEL_ID = "claude-sonnet-4-6";

let cachedClient: Anthropic | null = null;

function client(): Anthropic {
  if (cachedClient) return cachedClient;
  const env = serverEnv();
  if (!env.ANTHROPIC_API_KEY) {
    throw new Error("ANTHROPIC_API_KEY is not configured — cannot use the direct Anthropic fallback");
  }
  cachedClient = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
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
    max_tokens: opts.maxTokens ?? 2048,
    temperature: opts.temperature ?? 0.4,
    system: opts.system,
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
    usage: { input_tokens: res.usage.input_tokens, output_tokens: res.usage.output_tokens },
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
  const res = await client().messages.create({
    model: DIRECT_MODEL_ID,
    max_tokens: opts.maxTokens ?? 4096,
    temperature: opts.temperature ?? 0.3,
    system: opts.system,
    messages: toAnthropicMessages(opts.messages),
    tools: toAnthropicTools(opts.tools),
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
    usage: { inputTokens: res.usage.input_tokens, outputTokens: res.usage.output_tokens },
  };
}
