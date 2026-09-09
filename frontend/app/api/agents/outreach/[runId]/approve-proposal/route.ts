/**
 * POST /api/agents/outreach/[runId]/approve-proposal
 * Approves the generated proposal, drafts email, pauses for email approval.
 */

import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { resumeAgentAfterProposalApproval } from "@/lib/agents/resume";
import { requirePermission } from "@/lib/auth/server-permission";

export const runtime = "nodejs";
export const maxDuration = 90;

export async function POST(
  _req: Request,
  ctx: { params: { runId: string } }
) {
  const auth = await requirePermission("approve_proposal");
  if ("error" in auth) return auth.error;

  const sb = supabaseAdmin();
  const { data: run } = await sb
    .from("agent_runs" as "companies")
    .select("*")
    .eq("id", ctx.params.runId)
    .maybeSingle() as unknown as { data: Record<string, unknown> | null };

  if (!run) return NextResponse.json({ error: "Run not found" }, { status: 404 });

  if (run.status !== "paused_for_proposal_approval") {
    return NextResponse.json(
      { error: `Run is not awaiting proposal approval (status: ${run.status})` },
      { status: 409 }
    );
  }

  const resume = await resumeAgentAfterProposalApproval(ctx.params.runId);

  if (!resume.success) {
    return NextResponse.json({ error: resume.error ?? "Failed to resume agent" }, { status: 500 });
  }

  return NextResponse.json({
    success: true,
    status: "paused_for_approval",
    proposal_approved: true,
    email: {
      email_id: resume.agentResult.email_id,
      email_subject: resume.agentResult.email_subject,
      email_preview: resume.agentResult.email_preview,
      recipient: resume.agentResult.recipient,
      recipient_name: resume.agentResult.recipient_name,
    },
    steps: resume.steps,
  });
}
