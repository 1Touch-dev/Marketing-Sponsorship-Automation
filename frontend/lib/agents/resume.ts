/**
 * Resume agent run after proposal approval — draft email and pause for send approval.
 */

import { supabaseAdmin } from "@/lib/supabase/server";
import { toolGenerateOutreachEmail } from "@/lib/agents/tools";
import type { AgentResult, AgentStep, SSEEvent } from "@/lib/agents/types";
import { logger } from "@/lib/monitoring/logger";

export type ResumeAfterProposalResult = {
  success: boolean;
  agentResult: AgentResult;
  steps: AgentStep[];
  error?: string;
};

export async function resumeAgentAfterProposalApproval(
  runId: string,
  emit?: (event: SSEEvent) => void
): Promise<ResumeAfterProposalResult> {
  const sb = supabaseAdmin();

  const { data: run } = await sb
    .from("agent_runs" as "companies")
    .select("*")
    .eq("id", runId)
    .maybeSingle() as unknown as { data: Record<string, unknown> | null };

  if (!run) {
    return { success: false, agentResult: {}, steps: [], error: "Run not found" };
  }

  if (run.status !== "paused_for_proposal_approval") {
    return {
      success: false,
      agentResult: (run.result as AgentResult) ?? {},
      steps: (run.steps as AgentStep[]) ?? [],
      error: `Run is not awaiting proposal approval (status: ${run.status})`,
    };
  }

  const result = (run.result as AgentResult) ?? {};
  const steps = [...((run.steps as AgentStep[]) ?? [])];
  const proposalId = result.proposal_id;

  if (!proposalId) {
    return { success: false, agentResult: result, steps, error: "No proposal on this run" };
  }

  // Approve proposal
  await sb.from("proposals").update({ status: "approved", approved_at: new Date().toISOString() }).eq("id", proposalId);

  const recipientEmail =
    result.recipient_email ??
    extractFromSteps(steps, "enrich_contacts", "top_contact")?.email ??
    `contato@${result.domain ?? "empresa.com.br"}`;

  const recipientName =
    result.recipient_name ??
    (extractFromSteps(steps, "enrich_contacts", "top_contact")?.name as string | undefined);

  emit?.({
    type: "step",
    step: steps.length + 1,
    tool: "generate_outreach_email",
    status: "running",
    label: "Drafting personalised email (Bedrock)…",
  });

  const emailResult = await toolGenerateOutreachEmail({
    proposal_id: proposalId,
    recipient_email: recipientEmail as string,
    recipient_name: recipientName,
  });

  const emailStep: AgentStep = {
    step: steps.length + 1,
    tool: "generate_outreach_email",
    status: emailResult.success ? "done" : "error",
    label: emailResult.summary,
    result: emailResult.data,
    started_at: new Date().toISOString(),
    finished_at: new Date().toISOString(),
  };
  steps.push(emailStep);

  emit?.({
    type: "step",
    step: emailStep.step,
    tool: "generate_outreach_email",
    status: emailStep.status as "done" | "error",
    label: emailResult.summary,
    result: emailResult.data,
  });

  if (!emailResult.success || !emailResult.data.email_id) {
    await sb
      .from("agent_runs" as "companies")
      .update({
        status: "failed",
        error: emailResult.summary,
        steps,
        updated_at: new Date().toISOString(),
      } as unknown as Record<string, unknown>)
      .eq("id", runId);

    return { success: false, agentResult: result, steps, error: emailResult.summary };
  }

  const updatedResult: AgentResult = {
    ...result,
    email_id: emailResult.data.email_id as string,
    email_subject: emailResult.data.subject as string,
    email_preview: emailResult.data.preview as string,
    recipient: emailResult.data.recipient as string,
    recipient_name: (emailResult.data.recipient_name as string) ?? undefined,
  };

  await sb
    .from("agent_runs" as "companies")
    .update({
      status: "paused_for_approval",
      result: updatedResult,
      steps,
      updated_at: new Date().toISOString(),
    } as unknown as Record<string, unknown>)
    .eq("id", runId);

  emit?.({
    type: "paused",
    reason: "email_review",
    email_id: updatedResult.email_id!,
    email_subject: updatedResult.email_subject ?? "",
    email_preview: updatedResult.email_preview ?? "",
    recipient: updatedResult.recipient ?? "",
    recipient_name: updatedResult.recipient_name ?? "",
  });

  logger.info("Agent resumed after proposal approval — email draft ready", { runId, proposalId });

  return { success: true, agentResult: updatedResult, steps };
}

function extractFromSteps(
  steps: AgentStep[],
  tool: string,
  key: string
): Record<string, unknown> | null {
  const step = steps.find((s) => s.tool === tool && s.status === "done");
  const top = step?.result?.[key];
  return top && typeof top === "object" ? (top as Record<string, unknown>) : null;
}
