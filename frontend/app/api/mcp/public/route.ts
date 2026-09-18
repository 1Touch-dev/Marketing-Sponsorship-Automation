/**
 * POST /api/mcp/public
 * The public read-only MCP server's HTTP endpoint (Streamable HTTP
 * transport, stateless mode — a fresh server+transport per request, no
 * in-memory session state to manage across requests). See
 * lib/mcp/public-server.ts for scope/auth reasoning.
 *
 * Auth: `Authorization: Bearer <MCP_PUBLIC_API_KEY>`. Not exempted via a
 * Supabase session — this route does its own auth (same class as
 * /api/internal/* and /api/documenso/webhook), checked in middleware.ts's
 * PUBLIC_PREFIXES so the session-auth layer doesn't shadow it.
 */
import { serverEnv } from "@/lib/env";
import { CORITIBA_TENANT_ID } from "@/lib/tenants/types";
import { createPublicMcpServer } from "@/lib/mcp/public-server";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";

export const runtime = "nodejs";
export const maxDuration = 30;

function checkAuth(req: Request): Response | null {
  const env = serverEnv();
  if (!env.MCP_PUBLIC_API_KEY) {
    return Response.json(
      { error: "Public MCP server not configured — MCP_PUBLIC_API_KEY is not set." },
      { status: 503 },
    );
  }
  const auth = req.headers.get("authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (token !== env.MCP_PUBLIC_API_KEY) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  return null;
}

export async function POST(req: Request) {
  const authError = checkAuth(req);
  if (authError) return authError;

  // Stateless: today's real tenant is the only one this key is scoped to
  // (see lib/mcp/public-server.ts) — real per-partner tenant scoping is
  // future work, not silently assumed.
  const server = createPublicMcpServer(CORITIBA_TENANT_ID);
  const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
  await server.connect(transport);
  const res = await transport.handleRequest(req);
  return res;
}

export async function GET(req: Request) {
  const authError = checkAuth(req);
  if (authError) return authError;
  return Response.json({ error: "This server runs in stateless mode — GET/SSE streaming isn't supported, use POST." }, { status: 405 });
}
