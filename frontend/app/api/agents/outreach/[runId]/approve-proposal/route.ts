/**
 * POST /api/agents/outreach/[runId]/approve-proposal
 * Approves the generated proposal, drafts email, pauses for email approval.
 */

import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { resumeAgentAfterProposalApproval } from "@/lib/agents/resume";
import { requirePermission } from "@/lib/auth/server-permission";
import { idempotent } from "@/lib/idempotency";
import { hasOpenBlock } from "@/lib/approvals/recovery";

export const runtime = "nodejs";
export const maxDuration = 90;

async function postHandler(
  _req: Request,
  ctx: { params: { runId: string } }
) {
  const auth = await requirePermission("approve_proposal");
  if ("error" in auth) return auth.error;

  const sb = supabaseAdmin();
  const blocked = await hasOpenBlock(sb, "agent_run", ctx.params.runId);
  if (blocked) return NextResponse.json({ error: `This run's approval is blocked: ${blocked.reason} An administrator has to reassign or cancel it first.`, block_id: blocked.id }, { status: 409 });
  const { data: run } = await sb
    .from("agent_runs" as "companies")
    .select("*")
    .eq("id", ctx.params.runId)
    .eq("tenant_id", auth.user.tenant_id)
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
    // being second to answer, or answering the wrong question, is a conflict with the run's state, not a server fault
    const conflict = resume.refused === true || /already carrying|already finished|already in progress|not waiting for|cancelled|ended on a refusal/i.test(resume.error ?? "");
    return NextResponse.json({ error: resume.error ?? "Failed to resume agent" }, { status: conflict ? 409 : 500 });
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

export const POST = idempotent("agents.outreach.approve-proposal", postHandler);
