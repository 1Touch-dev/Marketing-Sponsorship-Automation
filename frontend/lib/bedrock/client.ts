import {
  BedrockRuntimeClient,
  InvokeModelCommand,
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

  // 3. Find the largest {...} block in the text
  const objMatches = [...text.matchAll(/\{[\s\S]*?\}/g)];
  // Pick the longest match (most likely to be the full object)
  const objMatch = objMatches.sort((a, b) => b[0].length - a[0].length)[0]?.[0];
  if (objMatch) {
    try { return JSON.parse(objMatch); } catch { /* keep trying */ }
  }

  // 4. Find [...] array block
  const arrMatches = [...text.matchAll(/\[[\s\S]*?\]/g)];
  const arrMatch = arrMatches.sort((a, b) => b[0].length - a[0].length)[0]?.[0];
  if (arrMatch) {
    try { return JSON.parse(arrMatch); } catch { /* keep trying */ }
  }

  // 5. Greedy fallback: take everything from first { or [ to end
  const firstBrace = text.indexOf("{");
  const firstBracket = text.indexOf("[");
  const start = firstBrace === -1 ? firstBracket : firstBracket === -1 ? firstBrace : Math.min(firstBrace, firstBracket);
  if (start !== -1) {
    try { return JSON.parse(text.slice(start)); } catch { /* give up */ }
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
