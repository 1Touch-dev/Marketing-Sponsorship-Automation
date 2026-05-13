import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { proposalGenerateSchema } from "@/lib/validators";
import { invokeClaude } from "@/lib/bedrock/client";
import { proposalPrompt, PROMPT_VERSION } from "@/lib/bedrock/prompts";
import { recordAudit } from "@/lib/audit/log";
import { serverEnv } from "@/lib/env";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";
import { startWorkflow, completeWorkflow, failWorkflow, retryWorkflow } from "@/lib/workflow-events";
import {
  proposalContentSchema,
  validateAiOutput,
  type ProposalContentAI,
} from "@/lib/ai/schemas";
import type { ProposalContent } from "@/types/database";
import { guardColumns } from "@/lib/db/column-guard";

export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_RETRIES = 2;

function renderMarkdown(content: ProposalContent): string {
  const lines: string[] = [];
  if (content.title) lines.push(`# ${content.title}`, "");
  if (content.executive_summary) lines.push("## Executive summary", content.executive_summary, "");
  if (content.campaign_rationale) lines.push("## Campaign rationale", content.campaign_rationale, "");
  if (content.sponsorship_value) lines.push("## Sponsorship value", content.sponsorship_value, "");
  if (content.activation_plan) lines.push("## Activation plan", content.activation_plan, "");
  if (content.deliverables?.length) {
    lines.push("## Deliverables", ...content.deliverables.map((d) => `- ${d}`), "");
  }
  if (content.investment_note) lines.push("## Investment", content.investment_note, "");
  if (content.cta) lines.push("## Call to action", content.cta, "");
  return lines.join("\n");
}

export async function POST(req: Request) {
  const env = serverEnv();
  const ip = getClientIp(req);
  const rl = checkRateLimit(`proposal-generate:${ip}`, { max: 10, windowMs: 60_000 });
  if (!rl.ok) return NextResponse.json({ error: rl.message }, { status: 429 });

  const body = await req.json().catch(() => ({}));
  const parsed = proposalGenerateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload", issues: parsed.error.issues }, { status: 400 });
  }

  const sb = supabaseAdmin();
  const { data: campaign, error: campErr } = await sb
    .from("campaigns")
    .select("id, title, summary, activation, cta, company_id, companies(id, company_name, industry, website, country, notes)")
    .eq("id", parsed.data.campaign_id)
    .single();
  if (campErr || !campaign) {
    return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
  }

  const company = (campaign as unknown as { companies: ProposalContent | null }).companies;
  if (!company) return NextResponse.json({ error: "Campaign has no company" }, { status: 500 });

  const eventId = await startWorkflow({
    workflow_name: "proposal.generate",
    entity_type: "campaign",
    entity_id: campaign.id,
    metadata: { campaign_id: campaign.id },
  });

  const { system, user } = proposalPrompt({
    company: company as unknown as Parameters<typeof proposalPrompt>[0]["company"],
    campaign: {
      title: campaign.title,
      summary: (campaign as unknown as { summary: string | null }).summary,
      activation: (campaign as unknown as { activation: string | null }).activation,
      cta: (campaign as unknown as { cta: string | null }).cta,
    },
  });

  let validated: ProposalContentAI | null = null;
  let lastError = "";
  let attempt = 0;

  while (attempt < MAX_RETRIES) {
    attempt++;
    try {
      const claude = await invokeClaude<unknown>({
        system,
        messages: [{ role: "user", content: user }],
        json: true,
        maxTokens: 2500,
        temperature: 0.5,
      });

      const vr = validateAiOutput(proposalContentSchema, claude.json, {
        workflow: "proposal.generate",
        entity_type: "campaign",
        entity_id: campaign.id,
      });

      if (vr.ok && vr.data) {
        validated = vr.data;
        break;
      }
      lastError = vr.error ?? "Validation failed";
      if (attempt < MAX_RETRIES && eventId) await retryWorkflow(eventId, attempt + 1, { last_error: lastError });
    } catch (err) {
      lastError = err instanceof Error ? err.message : "Bedrock invocation failed";
      if (attempt < MAX_RETRIES && eventId) await retryWorkflow(eventId, attempt + 1, { last_error: lastError });
    }
  }

  if (!validated) {
    if (eventId) await failWorkflow(eventId, lastError);
    await recordAudit({
      entity_type: "proposal",
      action: "proposal.generate_failed",
      metadata: { campaign_id: campaign.id, error: lastError },
    });
    return NextResponse.json(
      { error: `AI generation failed after ${attempt} attempt(s): ${lastError}` },
      { status: 502 },
    );
  }

  const title = validated.title || `Proposal — ${campaign.title}`;
  const content = validated as unknown as ProposalContent;
  const contentMd = renderMarkdown(content);

  const companyId = (campaign as unknown as { company_id: string }).company_id;
  const { data: proposal, error: insertErr } = await sb
    .from("proposals")
    .insert(
      guardColumns("proposals", {
        company_id: companyId,
        campaign_id: campaign.id,
        title,
        content,
        content_md: contentMd,
        status: "draft",
        version: 1,
        generated_by: "bedrock-claude",
        model_id: env.BEDROCK_MODEL_ID,
        prompt_version: PROMPT_VERSION,
      }),
    )
    .select("*")
    .single();

  if (insertErr || !proposal) {
    if (eventId) await failWorkflow(eventId, insertErr?.message ?? "Insert failed");
    return NextResponse.json({ error: insertErr?.message ?? "Failed to insert proposal" }, { status: 500 });
  }

  await sb.from("proposal_versions").insert({
    proposal_id: proposal.id,
    version: 1,
    content,
    content_md: contentMd,
    edit_reason: "Initial AI generation",
  });

  await sb.from("campaigns").update({ status: "selected" }).eq("id", campaign.id);

  if (eventId) await completeWorkflow(eventId, { proposal_id: proposal.id });
  await recordAudit({
    entity_type: "proposal",
    entity_id: proposal.id,
    action: "proposal.generated",
    metadata: { campaign_id: campaign.id, company_id: companyId, attempts: attempt },
  });

  return NextResponse.json({ data: proposal, attempts: attempt });
}
