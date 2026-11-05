/**
 * Tries AI providers in order until one answers (pure logic, no I/O).
 *
 * Used by the two Claude entry points in lib/bedrock/client.ts. A provider that just failed is skipped for a
 * cool-down (its breaker), so a dead one costs one slow call, not one in front of every request. The LAST
 * provider in the list is always tried, so a real error still reaches the caller instead of being skipped.
 */
import { ProviderBreaker } from "./cost-controls";

export type Attempt<P extends string, R> = {
  provider: P;
  run: () => Promise<R>;
  breaker?: ProviderBreaker;
};

export class AllProvidersFailedError extends Error {
  constructor(public readonly failures: Array<{ provider: string; message: string }>) {
    super(`All AI providers failed — ${failures.map((f) => `${f.provider}: ${f.message}`).join(" | ")}`);
    this.name = "AllProvidersFailedError";
  }
}

export async function runProviderChain<P extends string, R>(
  attempts: Array<Attempt<P, R>>,
  onFallback?: (failed: P, error: unknown) => void,
): Promise<{ provider: P; result: R }> {
  if (attempts.length === 0) throw new Error("No AI provider is configured.");
  const failures: Array<{ provider: string; message: string }> = [];
  let lastError: unknown;

  for (let i = 0; i < attempts.length; i++) {
    const a = attempts[i];
    const isLast = i === attempts.length - 1;
    if (!isLast && a.breaker?.isOpen()) continue;
    try {
      const result = await a.run();
      a.breaker?.reset();
      return { provider: a.provider, result };
    } catch (err) {
      lastError = err;
      failures.push({ provider: a.provider, message: err instanceof Error ? err.message : String(err) });
      a.breaker?.trip();
      if (!isLast) onFallback?.(a.provider, err);
    }
  }

  // A single provider that fails keeps its own error (same as before fallbacks existed).
  if (failures.length === 1 && lastError instanceof Error) throw lastError;
  throw new AllProvidersFailedError(failures);
}
