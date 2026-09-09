/**
 * POST /api/agents/outreach/[runId]/approve
 * Called when user clicks "Approve & Send" in supervised mode.
 * Finds the pending email on this run and sends it via Pipedrive.
 */

import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { toolSendEmail } from "@/lib/agents/tools";
import { requirePermission } from "@/lib/auth/server-permission";

export const runtime = "nodejs";
export const maxDuration = 30;

export async function POST(
  _req: Request,
  ctx: { params: { runId: string } }
) {
  const auth = await requirePermission("send_proposal");
  if ("error" in auth) return auth.error;

  const sb = supabaseAdmin();

  // Infrastructure-enforced approval gate: atomically claim the run by
  // flipping it out of "paused_for_approval" into a transient "sending"
  // status in one guarded UPDATE. Two concurrent "Approve & Send" clicks
  // (or a client retry) race on this single statement — only one can match
  // the WHERE clause, so at most one ever reaches toolSendEmail below. The
  // prior code read the run, checked its status, and only wrote back after
  // the send completed — a real window where both requests could pass the
  // check and both send.
  const { data: claimedRun } = await sb
    .from("agent_runs" as "companies")
    .update({ status: "sending", updated_at: new Date().toISOString() } as unknown as Record<string, unknown>)
    .eq("id", ctx.params.runId)
    .eq("status", "paused_for_approval")
    .select("*")
    .maybeSingle() as unknown as { data: Record<string, unknown> | null };

  if (!claimedRun) {
    const { data: run } = await sb
      .from("agent_runs" as "companies")
      .select("status")
      .eq("id", ctx.params.runId)
      .maybeSingle() as unknown as { data: Record<string, unknown> | null };
    if (!run) return NextResponse.json({ error: "Run not found" }, { status: 404 });
    return NextResponse.json({
      error: `Run is not awaiting approval (current status: ${run.status})`,
    }, { status: 409 });
  }

  const run = claimedRun;
  const result = (run.result as Record<string, unknown>) ?? {};
  const emailId = result.email_id as string | undefined;

  if (!emailId) {
    // Release the claim — nothing to send, don't leave the run stuck as "sending".
    await sb.from("agent_runs" as "companies").update({ status: "paused_for_approval" } as unknown as Record<string, unknown>).eq("id", ctx.params.runId);
    return NextResponse.json({ error: "No email found on this run to approve" }, { status: 400 });
  }

  // Send the email — toolSendEmail has its own independent atomic claim on
  // the emails table, so this is safe even if something else (e.g. the
  // manual /api/emails/[id]/send route) targets the same email concurrently.
  const sendResult = await toolSendEmail({ email_id: emailId });

  // Update the run with final result
  const updatedResult = {
    ...result,
    pipedrive_activity_id: sendResult.data.pipedrive_activity_id ?? null,
    completed_at: new Date().toISOString(),
  };

  // Append the send step to steps array
  const existingSteps = (run.steps as Array<Record<string, unknown>>) ?? [];
  const sendStep = {
    step: existingSteps.length + 1,
    tool: "send_email",
    status: sendResult.success ? "done" : "error",
    label: sendResult.summary,
    result: sendResult.data,
    started_at: new Date().toISOString(),
    finished_at: new Date().toISOString(),
  };

  await sb
    .from("agent_runs" as "companies")
    .update({
      status: "completed",
      result: updatedResult,
      steps: [...existingSteps, sendStep],
      updated_at: new Date().toISOString(),
    } as unknown as Record<string, unknown>)
    .eq("id", ctx.params.runId);

  return NextResponse.json({
    success: sendResult.success,
    summary: sendResult.summary,
    pipedrive_activity_id: sendResult.data.pipedrive_activity_id ?? null,
    email_id: emailId,
  });
}
