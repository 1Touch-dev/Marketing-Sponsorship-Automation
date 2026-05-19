/**
 * Apify Client Wrapper
 * Typed, retrying, backoff-enabled client for the Apify platform.
 * Actors used:
 *   - thescrappa/google-search-scraper  → Google SERP
 *   - apify/website-content-crawler     → Deep JS-rendered scraping
 */

import { ApifyClient } from "apify-client";
import { logger } from "@/lib/monitoring/logger";

// ── Singleton client ──────────────────────────────────────────────────────────
let _client: ApifyClient | null = null;

export function getApifyClient(): ApifyClient {
  const token = process.env.APIFY_API_TOKEN ?? "";
  if (!token) throw new ApifyConfigError("APIFY_API_TOKEN is not configured");
  if (!_client) {
    _client = new ApifyClient({ token });
  }
  return _client;
}

// ── Actor IDs ──────────────────────────────────────────────────────────────────
export const ACTORS = {
  GOOGLE_SEARCH: "thescrappa/google-search-scraper",   // $0.20/1000 results
  WEBSITE_CRAWLER: "apify/website-content-crawler",    // deep JS crawling
} as const;

// ── Core run wrapper ──────────────────────────────────────────────────────────
export type ApifyRunOptions = {
  /** Max time to wait for actor completion (ms). Default: 60000 */
  timeoutMs?: number;
  /** Max items to return from dataset */
  maxItems?: number;
  /** Number of retry attempts on transient failure */
  retries?: number;
};

export type ApifyRunResult<T> = {
  items: T[];
  actorRunId: string;
  datasetId: string;
  durationMs: number;
  itemCount: number;
};

/**
 * Run an Apify actor and wait for results with retries + exponential backoff.
 */
export async function runActor<T = Record<string, unknown>>(
  actorId: string,
  input: Record<string, unknown>,
  opts: ApifyRunOptions = {}
): Promise<ApifyRunResult<T>> {
  const {
    timeoutMs = 60_000,
    maxItems = 100,
    retries = 3,
  } = opts;

  const startTime = Date.now();
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const client = getApifyClient();

      logger.info("Apify actor starting", {
        actor: actorId,
        attempt,
        timeout_ms: timeoutMs,
      });

      const waitSecs = Math.floor(timeoutMs / 1000);
      const run = await client.actor(actorId).call(input, { waitSecs });

      if (!run?.defaultDatasetId) {
        throw new ApifyRunError(`Actor ${actorId} completed but returned no dataset`);
      }

      const { items } = await client.dataset(run.defaultDatasetId).listItems({
        limit: maxItems,
      });

      const durationMs = Date.now() - startTime;

      logger.info("Apify actor completed", {
        actor: actorId,
        items: items.length,
        duration_ms: durationMs,
        run_id: run.id,
      });

      return {
        items: items as T[],
        actorRunId: run.id,
        datasetId: run.defaultDatasetId,
        durationMs,
        itemCount: items.length,
      };
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));

      if (err instanceof ApifyConfigError) throw err; // don't retry config errors

      const isLast = attempt === retries;
      if (!isLast) {
        const backoffMs = Math.min(1000 * 2 ** (attempt - 1), 8000);
        logger.warn("Apify actor attempt failed, retrying", {
          actor: actorId,
          attempt,
          retries,
          error: lastError.message,
          backoff_ms: backoffMs,
        });
        await sleep(backoffMs);
      }
    }
  }

  logger.apiError(`apify/${actorId}`, lastError);
  throw new ApifyRunError(
    `Actor ${actorId} failed after ${retries} attempts: ${lastError?.message ?? "unknown"}`
  );
}

// ── Health check ──────────────────────────────────────────────────────────────
export type ApifyHealthStatus = {
  configured: boolean;
  healthy: boolean;
  username?: string;
  plan?: string;
  error?: string;
};

export async function checkApifyHealth(): Promise<ApifyHealthStatus> {
  const token = process.env.APIFY_API_TOKEN ?? "";
  if (!token || token.length < 10) {
    return { configured: false, healthy: false, error: "APIFY_API_TOKEN not set" };
  }
  try {
    const client = getApifyClient();
    const user = await client.user("me").get();
    return {
      configured: true,
      healthy: true,
      username: user?.username ?? "unknown",
      plan: (user as unknown as Record<string, Record<string,string>> | undefined)?.plan?.id ?? "unknown",
    };
  } catch (err) {
    return {
      configured: true,
      healthy: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

// ── Errors ────────────────────────────────────────────────────────────────────
export class ApifyConfigError extends Error {
  constructor(msg: string) { super(msg); this.name = "ApifyConfigError"; }
}
export class ApifyRunError extends Error {
  constructor(msg: string) { super(msg); this.name = "ApifyRunError"; }
}

// ── Utilities ─────────────────────────────────────────────────────────────────
function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
