import {
  BedrockRuntimeClient,
  InvokeModelCommand,
  ConverseCommand,
} from "@aws-sdk/client-bedrock-runtime";
import { serverEnv } from "@/lib/env";

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

export async function invokeClaude<T = unknown>(
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

  return {
    text,
    json: parsed,
    usage: raw?.usage ?? null,
    raw,
  };
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

/**
 * Claude Converse API — supports multi-turn tool use (agentic loops).
 * Uses ConverseCommand which natively handles tool_use / tool_result turns.
 */
export async function converseWithTools(opts: {
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
