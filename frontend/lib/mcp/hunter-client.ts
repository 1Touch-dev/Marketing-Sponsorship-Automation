import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { logger } from "@/lib/monitoring/logger";

/**
 * Phase 11 MCP integration (master_report.md Section 5) — Hunter's official
 * remote MCP server at https://mcp.hunter.io/mcp, authenticated with a plain
 * X-API-Key header (confirmed via Hunter's own docs — no OAuth required,
 * unlike Apollo; see the Apollo MCP finding in project memory for why that
 * one stays on its existing REST integration instead). Additive alongside
 * lib/intelligence/hunter.ts's existing REST calls, not a replacement.
 */
export async function withHunterMcpClient<T>(
  fn: (client: Client) => Promise<T>,
): Promise<T> {
  const apiKey = process.env.HUNTER_API_KEY ?? "";
  if (!apiKey) {
    throw new Error("HUNTER_API_KEY not configured — Hunter MCP client cannot connect");
  }

  const transport = new StreamableHTTPClientTransport(
    new URL("https://mcp.hunter.io/mcp"),
    { requestInit: { headers: { "X-API-Key": apiKey } } },
  );

  const client = new Client({ name: "msa-platform", version: "1.0.0" }, { capabilities: {} });

  try {
    await client.connect(transport);
    return await fn(client);
  } finally {
    try {
      await client.close();
    } catch (err) {
      logger.warn("[hunter-mcp] client close failed", { error: err instanceof Error ? err.message : String(err) });
    }
  }
}

export async function listHunterMcpTools(): Promise<Array<{ name: string; description?: string }>> {
  return withHunterMcpClient(async (client) => {
    const result = await client.listTools();
    return result.tools.map((t) => ({ name: t.name, description: t.description }));
  });
}
