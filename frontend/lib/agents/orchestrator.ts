/**
 * Agent Orchestrator — ConverseCommand loop with SSE emission.
 *
 * Claude decides which tools to call and in what order.
 * Each tool call is executed, results fed back, loop continues until end_turn.
 * In "supervised" mode: pauses after email draft for user approval.
 */

import { converseWithTools, type ConverseMessage } from "@/lib/bedrock/client";
import { supabaseAdmin } from "@/lib/supabase/server";
import { AGENT_TOOLS, TOOL_LABELS, TOOL_DONE_LABELS } from "@/lib/agents/tool-definitions";
import {
  toolEnrichContacts,
  toolScrapeIntelligence,
  toolGetOrCreateProposal,
  toolGenerateOutreachEmail,
  toolSendEmail,
} from "@/lib/agents/tools";
import type { AgentMode, AgentResult, AgentStep, SSEEvent } from "@/lib/agents/types";
import { logger } from "@/lib/monitoring/logger";

export type SSEEmitter = (event: SSEEvent) => void;

const SYSTEM_PROMPT = `You are the Coritiba FC Sponsorship Outreach Agent. Your job is to run a complete personalised sponsorship outreach workflow for a potential sponsor company.

Execute steps in this order using the available tools:
1. enrich_contacts — find decision makers at the company via Hunter.io
2. scrape_company_intelligence — scrape LinkedIn, social signals, and active ad campaigns
3. get_or_create_proposal — find an approved proposal or auto-approve a draft
4. generate_outreach_email — create a personalised PT-BR email for the top decision maker
5. send_email — only call this in auto mode; skip in supervised mode

Rules:
- Always call all 4 initial tools even if one fails — partial data is fine
- If enrich_contacts finds no contacts, use "contato@{domain}" as recipient
- If get_or_create_proposal returns found=false, STOP and do not call generate_outreach_email or send_email
- In supervised mode, NEVER call send_email — it will be called after user approval
- Incorporate scrape data (industry, campaigns, social score) into email context when calling generate_outreach_email
- After all steps complete, provide a concise English summary of what was accomplished (1-2 sentences)`;

export type OrchestratorInput = {
  run_id: string;
  company_id: string;
  company_name: string;
  domain: string;
  mode: AgentMode;
  created_by: string | null;
};

export async function runAgentOrchestrator(
  input: OrchestratorInput,
  emit: SSEEmitter
): Promise<AgentResult> {
  const sb = supabaseAdmin();
  const startTime = Date.now();
  let stepCounter = 0;
  let totalInputTokens = 0;
  let totalOutputTokens = 0;
  const steps: AgentStep[] = [];

  const persistSteps = async (extraStatus?: { status?: string; result?: AgentResult; error?: string }) => {
    try {
      await sb.from("agent_runs" as "companies").update({
        steps,
        updated_at: new Date().toISOString(),
        ...(extraStatus ?? {}),
      } as unknown as Record<string, unknown>).eq("id", input.run_id);
    } catch { /* fire-and-forget */ }
  };

  const messages: ConverseMessage[] = [
    {
      role: "user",
      content: [
        {
          text: `Run full outreach for company:\n- company_id: ${input.company_id}\n- company_name: ${input.company_name}\n- domain: ${input.domain}\n- mode: ${input.mode}\n\nStart with enrich_contacts, then proceed through all steps.`,
        },
      ],
    },
  ];

  let agentResult: AgentResult = {};
  let iterationCount = 0;
  const MAX_ITERATIONS = 12;

  while (iterationCount < MAX_ITERATIONS) {
    iterationCount++;

    let converseResult;
    try {
      converseResult = await converseWithTools({
        system: SYSTEM_PROMPT,
        messages,
        tools: AGENT_TOOLS,
        maxTokens: 4096,
        temperature: 0.3,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      emit({ type: "error", message: `LLM call failed: ${msg}`, run_id: input.run_id });
      await persistSteps({ status: "failed", error: msg });
      throw err;
    }

    if (converseResult.usage) {
      totalInputTokens += converseResult.usage.inputTokens;
      totalOutputTokens += converseResult.usage.outputTokens;
    }

    messages.push(converseResult.message);

    if (converseResult.stopReason === "end_turn" || converseResult.toolCalls.length === 0) {
      agentResult.total_tokens = totalInputTokens + totalOutputTokens;
      agentResult.steps_completed = steps.filter((s) => s.status === "done").length;
      agentResult.completed_at = new Date().toISOString();

      const summary =
        converseResult.text?.trim() ||
        `Completed ${agentResult.steps_completed} steps in ${((Date.now() - startTime) / 1000).toFixed(1)}s.`;

      emit({ type: "done", run_id: input.run_id, summary, result: agentResult });
      await persistSteps({ status: "completed", result: agentResult });
      return agentResult;
    }

    const toolResults: ConverseMessage["content"] = [];

    for (const toolCall of converseResult.toolCalls) {
      stepCounter++;
      const stepStarted = new Date().toISOString();

      emit({
        type: "step",
        step: stepCounter,
        tool: toolCall.name,
        status: "running",
        label: TOOL_LABELS[toolCall.name] ?? `Calling ${toolCall.name}…`,
      });

      let toolResult;
      const toolInput = toolCall.input;

      try {
        switch (toolCall.name) {
          case "enrich_contacts":
            toolResult = await toolEnrichContacts(toolInput as { company_id: string; domain: string });
            if (toolResult.data.top_contact) {
              const tc = toolResult.data.top_contact as Record<string, unknown>;
              agentResult.contacts_found = toolResult.data.contacts_found as number;
              agentResult.decision_makers = toolResult.data.decision_makers as number;
            }
            break;

          case "scrape_company_intelligence":
            toolResult = await toolScrapeIntelligence(toolInput as { company_id: string; company_name: string; domain: string });
            agentResult.social_score = toolResult.data.social_score as number;
            break;

          case "get_or_create_proposal":
            toolResult = await toolGetOrCreateProposal(toolInput as { company_id: string });
            if (toolResult.data.proposal_id) {
              agentResult.proposal_id = toolResult.data.proposal_id as string;
              agentResult.proposal_title = toolResult.data.proposal_title as string;
            }
            break;

          case "generate_outreach_email":
            toolResult = await toolGenerateOutreachEmail(toolInput as {
              proposal_id: string;
              recipient_email: string;
              recipient_name?: string;
            });
            if (toolResult.success && toolResult.data.email_id) {
              agentResult.email_id = toolResult.data.email_id as string;
              agentResult.email_subject = toolResult.data.subject as string;
              agentResult.email_preview = toolResult.data.preview as string;
              agentResult.recipient = toolResult.data.recipient as string;
              agentResult.recipient_name = (toolResult.data.recipient_name as string) ?? undefined;
            }
            break;

          case "send_email":
            if (input.mode === "supervised") {
              toolResult = {
                success: false,
                data: { skipped: true },
                summary: "Skipped: supervised mode — waiting for user approval",
              };
            } else {
              toolResult = await toolSendEmail(toolInput as { email_id: string });
              if (toolResult.data.pipedrive_activity_id) {
                agentResult.pipedrive_activity_id = toolResult.data.pipedrive_activity_id as number;
              }
            }
            break;

          default:
            toolResult = { success: false, data: {}, summary: `Unknown tool: ${toolCall.name}` };
        }
      } catch (err) {
        toolResult = {
          success: false,
          data: {},
          summary: `Tool threw: ${err instanceof Error ? err.message : String(err)}`,
        };
      }

      const stepStatus = toolResult.success ? "done" : (toolResult.data.skipped ? "skipped" : "error");
      const doneLabel = TOOL_DONE_LABELS[toolCall.name]?.(toolResult.data) ?? toolResult.summary;

      const step: AgentStep = {
        step: stepCounter,
        tool: toolCall.name,
        status: stepStatus as AgentStep["status"],
        label: doneLabel,
        result: toolResult.data,
        started_at: stepStarted,
        finished_at: new Date().toISOString(),
      };
      steps.push(step);
      await persistSteps();

      emit({
        type: "step",
        step: stepCounter,
        tool: toolCall.name,
        status: stepStatus as "done" | "error" | "skipped",
        label: doneLabel,
        result: toolResult.data,
      });

      // Supervised mode pause after email is drafted
      if (
        toolCall.name === "generate_outreach_email" &&
        input.mode === "supervised" &&
        toolResult.success &&
        agentResult.email_id
      ) {
        await persistSteps({
          status: "paused_for_approval",
          result: agentResult,
        });

        emit({
          type: "paused",
          reason: "email_review",
          email_id: agentResult.email_id,
          email_subject: agentResult.email_subject ?? "",
          email_preview: agentResult.email_preview ?? "",
          recipient: agentResult.recipient ?? "",
          recipient_name: agentResult.recipient_name ?? "",
        });

        // Return early — approval route will handle send_email
        return agentResult;
      }

      toolResults.push({
        toolResult: {
          toolUseId: toolCall.toolUseId,
          content: [{ json: toolResult.data }],
          status: toolResult.success ? "success" : "error",
        },
      });

      logger.info("Agent tool executed", {
        tool: toolCall.name,
        success: toolResult.success,
        run_id: input.run_id,
        summary: toolResult.summary,
      });
    }

    messages.push({ role: "user", content: toolResults });
  }

  // Hit max iterations
  const timeoutMsg = "Agent reached max iterations — check run status for partial results";
  emit({ type: "error", message: timeoutMsg, run_id: input.run_id });
  await persistSteps({ status: "failed", error: timeoutMsg });
  return agentResult;
}
