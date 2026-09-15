import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/auth/server-permission";
import { withHunterMcpClient, listHunterMcpTools } from "@/lib/mcp/hunter-client";
import { logger } from "@/lib/monitoring/logger";

/**
 * Phase 11 MCP integration — Hunter's official remote MCP server (see
 * lib/mcp/hunter-client.ts). 102 tools discovered live 2026-09-15, a huge
 * surface beyond lib/intelligence/hunter.ts's 4 hand-rolled REST functions
 * (sequence management, lead/company lists, saved searches, tags,
 * webhooks). Additive, not a replacement — the working REST path stays.
 *
 * GET  -> list available tools (free, no credits)
 * POST -> run a named tool with arguments (may consume Hunter credits
 *         depending on the tool — check each tool's own description)
 */
export async function GET() {
  const auth = await requirePermission("run_intelligence");
  if ("error" in auth) return auth.error;

  try {
    const tools = await listHunterMcpTools();
    return NextResponse.json({ tools });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error("[hunter-mcp] list tools failed", { error: message });
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
    const result = await withHunterMcpClient((client) =>
      client.callTool({ name: body.tool_name!, arguments: body.arguments ?? {} }),
    );
    return NextResponse.json({ result });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error("[hunter-mcp] tool call failed", { error: message, tool: body.tool_name });
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
