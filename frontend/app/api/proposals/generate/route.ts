import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { proposalGenerateSchema } from "@/lib/validators";
import { invokeClaude } from "@/lib/bedrock/client";
import { proposalPrompt } from "@/lib/bedrock/prompts";
import { recordAudit } from "@/lib/audit/log";
import { serverEnv } from "@/lib/env";
import type { ProposalContent } from "@/types/database";

export const runtime = "nodejs";
export const maxDuration = 60;

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
  const body = await req.json().catch(() => ({}));
  const parsed = proposalGenerateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload", issues: parsed.error.issues }, { status: 400 });
  }

  const sb = supabaseAdmin();
  const { data: campaign, error: campErr } = await sb
    .from("campaigns")
    .select("*, companies(*)")
    .eq("id", parsed.data.campaign_id)
    .single();
  if (campErr || !campaign) {
    return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
  }

  const company = (campaign as any).companies;
  if (!company) return NextResponse.json({ error: "Campaign has no company" }, { status: 500 });

  const { system, user } = proposalPrompt({
    company,
    campaign: {
      title: campaign.title,
      summary: campaign.summary,
      activation: campaign.activation,
      cta: campaign.cta,
    },
  });

  let claude;
  try {
    claude = await invokeClaude<ProposalContent>({
      system,
      messages: [{ role: "user", content: user }],
      json: true,
      maxTokens: 2500,
      temperature: 0.5,
    });
  } catch (err) {
    return NextResponse.json(
      { error: `Bedrock error: ${err instanceof Error ? err.message : "unknown"}` },
      { status: 502 },
    );
  }

  const content = claude.json;
  if (!content || typeof content !== "object") {
    return NextResponse.json({ error: "Model did not return JSON", raw_text: claude.text }, { status: 502 });
  }

  const title = content.title || `Proposal — ${campaign.title}`;
  const contentMd = renderMarkdown(content);

  const { data: proposal, error: insertErr } = await sb
    .from("proposals")
    .insert({
      company_id: company.id,
      campaign_id: campaign.id,
      title,
      content,
      content_md: contentMd,
      status: "draft",
      version: 1,
      generated_by: "bedrock-claude",
      model_id: env.BEDROCK_MODEL_ID,
    })
    .select("*")
    .single();
  if (insertErr || !proposal) {
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

  await recordAudit({
    entity_type: "proposal",
    entity_id: proposal.id,
    action: "proposal.generated",
    metadata: { campaign_id: campaign.id, company_id: company.id },
  });

  return NextResponse.json({ data: proposal });
}
