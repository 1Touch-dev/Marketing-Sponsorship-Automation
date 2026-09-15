import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/auth/server-permission";
import { withApifyMcpClient, listApifyMcpTools } from "@/lib/mcp/apify-client";
import { logger } from "@/lib/monitoring/logger";

/**
 * Phase 11 MCP integration — dynamic Apify actor access via the official
 * @apify/actors-mcp-server (see lib/mcp/apify-client.ts for the connection
 * details and why stdio+token instead of the hosted OAuth endpoint).
 * Separate from lib/intelligence/apify.ts's existing 2 hardcoded actors —
 * this is additive, not a replacement; the working REST path stays as-is.
 *
 * GET  -> list available tools/actors (cheap, no cost)
 * POST -> run a named tool with arguments (real Apify compute cost)
 */
export async function GET() {
  const auth = await requirePermission("run_intelligence");
  if ("error" in auth) return auth.error;

  try {
    const tools = await listApifyMcpTools();
    return NextResponse.json({ tools });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error("[apify-mcp] list tools failed", { error: message });
    return NextResponse.json({ error: message }, { status: 502 });
  }
}

export async function POST(req: Request) {
  const auth = await requirePermission("run_intelligence");
  if ("error" in auth) return auth.error;

  const body = (await req.json().catch(() => ({}))) as {
    tool_name?: string;
    arguments?: Record<string, unknown>;
  };
  if (!body.tool_name) {
    return NextResponse.json({ error: "tool_name is required" }, { status: 400 });
  }

  try {
    const result = await withApifyMcpClient((client) =>
      client.callTool({ name: body.tool_name!, arguments: body.arguments ?? {} }),
    );
    return NextResponse.json({ result });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error("[apify-mcp] tool call failed", { error: message, tool: body.tool_name });
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
