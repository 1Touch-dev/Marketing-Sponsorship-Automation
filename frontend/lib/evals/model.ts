import { invokeClaude } from "../bedrock/client";
import { bedrockCallCostUsd } from "../monitoring/spend-guard";
import type { ModelFn } from "./types";

/**
 * The real model, called the way the agents call it, so a run measures the real thing. Every call goes through the same
 * path as production (lib/bedrock/client.ts), which means each one is counted in the spend ledger, is held to the daily
 * cap and the call-rate limit, and appears as a model call in Langfuse when that is on.
 */
export const liveModel: ModelFn = async (p) => {
  const r = await invokeClaude<unknown>({
    system: p.system, messages: [{ role: "user", content: p.user }], json: true, maxTokens: p.maxTokens, temperature: p.temperature,
    entityType: "evaluation", entityId: null,
  });
  const u = r.usage ?? {};
  const costUsd = bedrockCallCostUsd(u.input_tokens ?? 0, u.output_tokens ?? 0, u.cache_read_input_tokens ?? 0, u.cache_creation_input_tokens ?? 0);
  return { text: r.text, json: r.json, inputTokens: u.input_tokens ?? 0, outputTokens: u.output_tokens ?? 0, costUsd };
};
