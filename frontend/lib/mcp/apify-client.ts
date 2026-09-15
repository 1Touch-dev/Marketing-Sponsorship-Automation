import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { logger } from "@/lib/monitoring/logger";

/**
 * Phase 11 MCP integration (master_report.md Section 5) — Apify called out
 * as "highest-value wire — exposes 7,000+ Actors dynamically, letting
 * agents add new data sources without new integration code." Our hand-rolled
 * lib/intelligence/apify.ts only wraps 2 pre-selected actors
 * (google-search-scraper, website-content-crawler); this exposes the
 * broader Apify Store dynamically via the official @apify/actors-mcp-server,
 * run locally over stdio with a plain API token (no OAuth — the hosted
 * remote endpoint requires OAuth, so this uses the local stdio mode
 * instead, same reasoning documented in the framework-decision memory for
 * Phase 8: prefer the auth model that actually works headless).
 *
 * A new connection is opened per call rather than pooled — this runs
 * rarely enough (operator/agent-triggered discovery, not a hot path) that
 * connection-pooling complexity isn't worth it yet.
 */
let cachedActors: string[] | null = null;

function actorsToExpose(): string[] {
  if (cachedActors) return cachedActors;
  cachedActors = ["apify/google-search-scraper", "apify/website-content-crawler"];
  return cachedActors;
}

export async function withApifyMcpClient<T>(
  fn: (client: Client) => Promise<T>,
): Promise<T> {
  const token = process.env.APIFY_API_TOKEN ?? "";
  if (!token) {
    throw new Error("APIFY_API_TOKEN not configured — Apify MCP client cannot connect");
  }

  const transport = new StdioClientTransport({
    command: "npx",
    args: ["-y", "@apify/actors-mcp-server", "--actors", actorsToExpose().join(",")],
    env: { ...process.env, APIFY_TOKEN: token } as Record<string, string>,
  });

  const client = new Client({ name: "msa-platform", version: "1.0.0" }, { capabilities: {} });

  try {
    await client.connect(transport);
    return await fn(client);
  } finally {
    try {
      await client.close();
    } catch (err) {
      logger.warn("[apify-mcp] client close failed", { error: err instanceof Error ? err.message : String(err) });
    }
  }
}

export async function listApifyMcpTools(): Promise<Array<{ name: string; description?: string }>> {
  return withApifyMcpClient(async (client) => {
    const result = await client.listTools();
    return result.tools.map((t) => ({ name: t.name, description: t.description }));
  });
}
