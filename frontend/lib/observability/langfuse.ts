import { Langfuse } from "langfuse";
import { serverEnv } from "@/lib/env";
import { logger } from "@/lib/monitoring/logger";

/**
 * Langfuse — LLM observability (still-open roadmap item: "AI-agent
 * cost-monitoring tooling — evaluate existing LLM-ops platforms (Helicone,
 * LangSmith) rather than building in-house"). Langfuse's core is MIT
 * licensed (open-core, only the /ee enterprise features are proprietary) —
 * no AGPL/legal-review concern the way Twenty CRM or Pretix had.
 *
 * This gives the platform something spend_ledger alone doesn't: a full
 * prompt/response audit trail per AI call (proposal generation,
 * opportunity-gap, NIL terms, barter terms, reply classification, the
 * outreach agent's tool loop), not just a daily cost total.
 *
 * Deliberately using the legacy `langfuse` v3 SDK (still actively
 * published) rather than the newer `@langfuse/tracing` + `@langfuse/otel`
 * OpenTelemetry stack — that stack is designed for continuously-running
 * OTel-instrumented processes, and correctly bootstrapping/flushing OTel
 * spans in a Next.js app is meaningfully harder to get right than this
 * SDK's simple queued-and-flushed `generation()` call, which is the better
 * technical fit for logging completions from an already-custom Bedrock
 * wrapper (not an OTel-instrumented provider SDK).
 *
 * Silently no-ops until both LANGFUSE_PUBLIC_KEY and LANGFUSE_SECRET_KEY
 * are configured — same pattern as lib/slack/notify.ts. Never throws, never
 * blocks the calling AI request.
 */

let cachedClient: Langfuse | null | undefined;
let warnedMissingKeys = false;

function client(): Langfuse | null {
  if (cachedClient !== undefined) return cachedClient;

  const { LANGFUSE_PUBLIC_KEY, LANGFUSE_SECRET_KEY, LANGFUSE_BASE_URL } = serverEnv();
  if (!LANGFUSE_PUBLIC_KEY || !LANGFUSE_SECRET_KEY) {
    if (!warnedMissingKeys) {
      warnedMissingKeys = true;
      logger.warn("LANGFUSE_PUBLIC_KEY/LANGFUSE_SECRET_KEY not configured — LLM tracing is disabled", {});
    }
    cachedClient = null;
    return null;
  }

  cachedClient = new Langfuse({
    publicKey: LANGFUSE_PUBLIC_KEY,
    secretKey: LANGFUSE_SECRET_KEY,
    baseUrl: LANGFUSE_BASE_URL,
  });
  return cachedClient;
}

export function traceGeneration(args: {
  name: string;
  model: string;
  input: unknown;
  output: string;
  usage?: { promptTokens?: number; completionTokens?: number } | null;
  metadata?: Record<string, unknown>;
}): void {
  const lf = client();
  if (!lf) return;

  try {
    lf.generation({
      name: args.name,
      model: args.model,
      input: args.input,
      output: args.output,
      usage: args.usage
        ? {
            promptTokens: args.usage.promptTokens,
            completionTokens: args.usage.completionTokens,
            totalTokens:
              args.usage.promptTokens !== undefined && args.usage.completionTokens !== undefined
                ? args.usage.promptTokens + args.usage.completionTokens
                : undefined,
          }
        : undefined,
      metadata: args.metadata,
    });
  } catch (err) {
    logger.warn("Langfuse generation logging failed", { error: String(err) });
  }
}

/** Force-flush queued events immediately rather than waiting for the SDK's
 * background interval — useful on process shutdown, and for tests. No-op
 * when tracing isn't configured. */
export async function flushLangfuse(): Promise<void> {
  const lf = client();
  if (!lf) return;
  try {
    await lf.flushAsync();
  } catch (err) {
    logger.warn("Langfuse flush failed", { error: String(err) });
  }
}
