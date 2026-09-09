/**
 * POST /api/agents/outreach
 * Starts a new agent run for a company. Streams progress as SSE.
 *
 * Body: { company_id: string }
 * Always runs in supervised mode (proposal + email require human approval).
 * Returns: text/event-stream of SSEEvent JSON lines
 */

import { supabaseAdmin, supabaseServer } from "@/lib/supabase/server";
import { runAgentOrchestrator } from "@/lib/agents/orchestrator";
import type { AgentMode, SSEEvent } from "@/lib/agents/types";
import { logger } from "@/lib/monitoring/logger";
import { requirePermission } from "@/lib/auth/server-permission";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(req: Request) {
  const auth = await requirePermission("create_proposal");
  if ("error" in auth) return auth.error;
  // agent_runs.created_by references auth.users(id), not platform_users.id
  // (requirePermission()'s identity) — fetch it separately for that column.
  const { data: { user } } = await supabaseServer().auth.getUser();
  if (!user) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });

  const body = await req.json().catch(() => ({})) as { company_id?: string };
  const { company_id } = body;

  if (!company_id) {
    return new Response(JSON.stringify({ error: "company_id is required" }), { status: 400 });
  }

  const agentMode: AgentMode = "supervised";
  const sb = supabaseAdmin();

  // Load company details
  const { data: company } = await sb
    .from("companies")
    .select("id, company_name, website")
    .eq("id", company_id)
    .maybeSingle();

  if (!company) {
    return new Response(JSON.stringify({ error: "Company not found" }), { status: 404 });
  }

  const domain = extractDomain(company.website ?? "");
  if (!domain) {
    return new Response(JSON.stringify({ error: "Company has no website/domain configured" }), { status: 400 });
  }

  // Rate limit: 1 active run per company at a time
  const { data: activeRun } = await sb
    .from("agent_runs" as "companies")
    .select("id, status")
    .eq("company_id", company_id)
    .in("status", ["running", "paused_for_approval", "paused_for_proposal_approval"])
    .limit(1)
    .maybeSingle() as unknown as { data: { id: string; status: string } | null };

  if (activeRun) {
    return new Response(
      JSON.stringify({ error: "An agent run is already in progress for this company", run_id: activeRun.id }),
      { status: 409 }
    );
  }

  // Create agent run record
  const { data: run } = await sb
    .from("agent_runs" as "companies")
    .insert({
      company_id,
      created_by: user.id,
      status: "running",
      mode: agentMode,
      steps: [],
    } as unknown as Record<string, unknown>)
    .select("id")
    .single() as unknown as { data: { id: string } | null };

  if (!run) {
    return new Response(JSON.stringify({ error: "Failed to create agent run" }), { status: 500 });
  }

  const encoder = new TextEncoder();
  const runId = run.id;

  const stream = new ReadableStream({
    async start(controller) {
      const emit = (event: SSEEvent) => {
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
        } catch { /* client disconnected */ }
      };

      emit({
        type: "started",
        run_id: runId,
        company_name: company.company_name,
        mode: agentMode,
      });

      try {
        await runAgentOrchestrator(
          {
            run_id: runId,
            company_id,
            company_name: company.company_name,
            domain,
            mode: agentMode,
            created_by: user.id,
          },
          emit
        );
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        logger.apiError("/api/agents/outreach", err instanceof Error ? err : new Error(msg));
        emit({ type: "error", message: msg, run_id: runId });

        try {
          await sb.from("agent_runs" as "companies")
            .update({ status: "failed", error: msg, updated_at: new Date().toISOString() } as unknown as Record<string, unknown>)
            .eq("id", runId);
        } catch { /* ignore */ }
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive",
      "X-Agent-Run-Id": runId,
    },
  });
}

function extractDomain(website: string): string {
  if (!website) return "";
  try {
    const url = website.startsWith("http") ? website : `https://${website}`;
    return new URL(url).hostname.replace("www.", "");
  } catch {
    return website.replace(/^https?:\/\/(www\.)?/, "").split("/")[0];
  }
}
