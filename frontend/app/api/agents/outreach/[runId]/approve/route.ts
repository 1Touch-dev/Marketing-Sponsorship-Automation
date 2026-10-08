/**
 * POST /api/agents/outreach/[runId]/approve
 * Called when user clicks "Approve & Send" in supervised mode.
 * Finds the pending email on this run and sends it via Pipedrive.
 */

import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { toolSendEmail } from "@/lib/agents/tools";
import { requirePermission } from "@/lib/auth/server-permission";
import { idempotent } from "@/lib/idempotency";
import { approveAndSend, planEmailSend } from "@/lib/actions/broker";
import { emailForAuthUser } from "@/lib/identity/lookup";
import type { ToolResult } from "@/lib/agents/tools";
import { hasOpenBlock } from "@/lib/approvals/recovery";

export const runtime = "nodejs";
export const maxDuration = 30;

async function postHandler(
  _req: Request,
  ctx: { params: { runId: string } }
) {
  const auth = await requirePermission("send_proposal");
  if ("error" in auth) return auth.error;

  const sb = supabaseAdmin();

  const blocked = await hasOpenBlock(sb, "agent_run", ctx.params.runId);
  if (blocked) return NextResponse.json({ error: `This run's approval is blocked: ${blocked.reason} An administrator has to reassign or cancel it first.`, block_id: blocked.id }, { status: 409 });

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
    .eq("tenant_id", auth.user.tenant_id)
    .eq("status", "paused_for_approval")
    .select("*")
    .maybeSingle() as unknown as { data: Record<string, unknown> | null };

  if (!claimedRun) {
    const { data: run } = await sb
      .from("agent_runs" as "companies")
      .select("status")
      .eq("id", ctx.params.runId)
      .eq("tenant_id", auth.user.tenant_id)
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
    await sb.from("agent_runs" as "companies").update({ status: "paused_for_approval" } as unknown as Record<string, unknown>).eq("id", ctx.params.runId).eq("tenant_id", auth.user.tenant_id);
    return NextResponse.json({ error: "No email found on this run to approve" }, { status: 400 });
  }

  // Send the email — toolSendEmail has its own independent atomic claim on
  // the emails table, so this is safe even if something else (e.g. the
  // manual /api/emails/[id]/send route) targets the same email concurrently.
  // With governance in place the send is the plan a person is approving: their standing, the plan's identity and the
  // agent's authority are rechecked by the database just before it runs, and an unknown outcome is never repeated.
  const sendResult = await sendThroughBroker(sb, {
    tenantId: auth.user.tenant_id, emailId, approver: auth.user, runId: ctx.params.runId, createdBy: (run.created_by as string | null) ?? null,
  });

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
    .eq("id", ctx.params.runId)
    .eq("tenant_id", auth.user.tenant_id);

  return NextResponse.json({
    success: sendResult.success,
    summary: sendResult.summary,
    pipedrive_activity_id: sendResult.data.pipedrive_activity_id ?? null,
    email_id: emailId,
  });
}

export const POST = idempotent("agents.outreach.approve", postHandler);

/** Plans the send if it is not planned yet, has the approver approve it, and runs it; the old direct send before migration 0070. */
async function sendThroughBroker(sb: ReturnType<typeof supabaseAdmin>, i: { tenantId: string; emailId: string; approver: Parameters<typeof approveAndSend>[1]["approver"]; runId: string; createdBy: string | null }): Promise<ToolResult> {
  const planned = await planEmailSend(sb, { tenantId: i.tenantId, emailId: i.emailId, onBehalfOf: await emailForAuthUser(sb, i.createdBy), runId: i.runId });
  if (planned.ok && planned.legacy) return toolSendEmail({ email_id: i.emailId });
  if (!planned.ok) return { success: false, data: { sent: false, action_id: planned.actionId ?? null, state: planned.state ?? null }, summary: planned.error };
  const out = await approveAndSend(sb, { tenantId: i.tenantId, actionId: planned.actionId, approver: i.approver, send: () => toolSendEmail({ email_id: i.emailId }) });
  if (out.ok) return { success: true, data: { ...out.data, action_id: planned.actionId, state: out.state }, summary: out.summary };
  return { success: false, data: { sent: false, action_id: planned.actionId, state: out.state ?? null }, summary: out.error };
}
