/**
 * POST /api/agents/outreach/[runId]/approve
 * Called when user clicks "Approve & Send" in supervised mode.
 * Finds the pending email on this run and sends it via Pipedrive.
 */

import { NextResponse } from "next/server";
import { supabaseAdmin, supabaseServer } from "@/lib/supabase/server";
import { toolSendEmail } from "@/lib/agents/tools";

export const runtime = "nodejs";
export const maxDuration = 30;

export async function POST(
  _req: Request,
  ctx: { params: { runId: string } }
) {
  const { data: { user } } = await supabaseServer().auth.getUser().catch(() => ({ data: { user: null } }));
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const sb = supabaseAdmin();

  // Fetch the run
  const { data: run } = await sb
    .from("agent_runs" as "companies")
    .select("*")
    .eq("id", ctx.params.runId)
    .maybeSingle() as unknown as { data: Record<string, unknown> | null };

  if (!run) return NextResponse.json({ error: "Run not found" }, { status: 404 });

  if (run.status !== "paused_for_approval") {
    return NextResponse.json({
      error: `Run is not awaiting approval (current status: ${run.status})`,
    }, { status: 409 });
  }

  const result = (run.result as Record<string, unknown>) ?? {};
  const emailId = result.email_id as string | undefined;

  if (!emailId) {
    return NextResponse.json({ error: "No email found on this run to approve" }, { status: 400 });
  }

  // Send the email
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
