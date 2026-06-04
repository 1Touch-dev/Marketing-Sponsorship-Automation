/**
 * Generate a company-specific sponsorship proposal (used by Outreach Agent).
 * Uses enrichment + intelligence already stored on the company record.
 */

import { supabaseAdmin } from "@/lib/supabase/server";
import { invokeClaude } from "@/lib/bedrock/client";
import { proposalPrompt, PROMPT_VERSION } from "@/lib/bedrock/prompts";
import { proposalContentSchema, validateAiOutput, type ProposalContentAI } from "@/lib/ai/schemas";
import { serverEnv } from "@/lib/env";
import { recordAudit } from "@/lib/audit/log";
import { enqueueCrmSync } from "@/lib/pipedrive/sync";
import { logger } from "@/lib/monitoring/logger";
import type { ProposalContent } from "@/types/database";

export type GeneratedProposal = {
  proposal_id: string;
  campaign_id: string;
  title: string;
  executive_summary: string;
  status: "under_review";
};

function buildIntelligenceContext(intel: Record<string, unknown>): string {
  const parts: string[] = [];
  const enrichment = intel.enrichment as Record<string, unknown> | undefined;

  if (intel.coritiba_fit_rationale) {
    parts.push(`Coritiba fit: ${String(intel.coritiba_fit_rationale).slice(0, 500)}`);
  }
  if (intel.marketing_goals) {
    const goals = intel.marketing_goals;
    parts.push(`Marketing goals: ${Array.isArray(goals) ? goals.join("; ") : String(goals)}`);
  }
  if (intel.competitors && Array.isArray(intel.competitors)) {
    parts.push(`Competitors: ${(intel.competitors as unknown[]).slice(0, 5).map((c) => (typeof c === "string" ? c : (c as { name?: string }).name)).filter(Boolean).join(", ")}`);
  }

  const apollo = enrichment?.apollo as Record<string, unknown> | undefined;
  const apolloOrg = apollo?.organization as Record<string, unknown> | undefined;
  if (apolloOrg) {
    if (apolloOrg.industry) parts.push(`Industry (Apollo): ${apolloOrg.industry}`);
    if (apolloOrg.estimated_num_employees) parts.push(`Employees: ${apolloOrg.estimated_num_employees}`);
    if (apolloOrg.marketing_team_size) parts.push(`Marketing team size: ${apolloOrg.marketing_team_size}`);
    if (apolloOrg.annual_revenue_printed) parts.push(`Revenue: ${apolloOrg.annual_revenue_printed}`);
  }

  const social = enrichment?.social as Record<string, unknown> | undefined;
  const ads = social?.ads as Record<string, unknown> | undefined;
  if (ads?.estimated_ad_spend_signal) {
    parts.push(`Ad spend signal: ${ads.estimated_ad_spend_signal}`);
  }
  if (ads?.active_campaigns && Array.isArray(ads.active_campaigns)) {
    parts.push(`Active campaigns: ${(ads.active_campaigns as string[]).slice(0, 4).join(", ")}`);
  }

  const linkedin = social?.linkedin as Record<string, unknown> | undefined;
  if (linkedin?.description) {
    parts.push(`LinkedIn: ${String(linkedin.description).slice(0, 300)}`);
  }

  const hunter = enrichment?.hunter as Record<string, unknown> | undefined;
  const dms = (hunter?.decision_makers as Array<Record<string, unknown>>) ?? [];
  if (dms.length > 0) {
    parts.push(
      `Key contacts: ${dms.slice(0, 3).map((c) => `${c.full_name ?? c.email} (${c.position ?? "n/a"})`).join("; ")}`
    );
  }

  const serp = intel.serp_intelligence as Record<string, unknown> | undefined;
  if (serp?.market_context) {
    parts.push(`Market context: ${String(serp.market_context).slice(0, 400)}`);
  }

  return parts.length
    ? `\n\nCOMPANY INTELLIGENCE (personalise every section for this sponsor):\n${parts.join("\n")}`
    : "";
}

/**
 * Creates a fresh AI proposal tailored to one company. Saved as under_review for human approval.
 */
export async function generatePersonalizedProposalForCompany(
  companyId: string
): Promise<GeneratedProposal> {
  const sb = supabaseAdmin();
  const env = serverEnv();

  const { data: company, error: coErr } = await sb
    .from("companies")
    .select("id, company_name, industry, website, country, notes, full_intelligence")
    .eq("id", companyId)
    .single();

  if (coErr || !company) {
    throw new Error("Company not found");
  }

  const intel = (company.full_intelligence as Record<string, unknown>) ?? {};
  const intelBlock = buildIntelligenceContext(intel);

  // Campaign for this company (reuse active or create)
  let campaignId: string | null = null;
  const { data: existingCampaign } = await sb
    .from("campaigns")
    .select("id, title, summary")
    .eq("company_id", companyId)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (existingCampaign) {
    campaignId = existingCampaign.id;
  } else {
    const { data: newCampaign, error: campErr } = await sb
      .from("campaigns")
      .insert({
        title: `${company.company_name} × Coritiba FC — Sponsorship`,
        summary: `Agent-generated outreach campaign for ${company.company_name}`,
        company_id: companyId,
        status: "draft",
        strategy: "awareness",
      } as never)
      .select("id, title, summary")
      .single();
    if (campErr || !newCampaign) throw new Error(campErr?.message ?? "Failed to create campaign");
    campaignId = newCampaign.id;
  }

  const campaignTitle = existingCampaign?.title ?? `${company.company_name} × Coritiba FC — Sponsorship`;
  const campaignSummary = existingCampaign?.summary ?? `Partnership outreach for ${company.company_name}`;

  const { system, user } = proposalPrompt({
    company: {
      company_name: company.company_name,
      industry: company.industry,
      website: company.website,
      country: company.country ?? "BR",
      notes: company.notes,
    },
    campaign: {
      title: campaignTitle,
      summary: campaignSummary,
    },
  });

  const enhancedUser =
    user +
    intelBlock +
    "\n\nIMPORTANT: This proposal must be uniquely written for this sponsor only — reference their industry, market, and intelligence above. Do not use generic boilerplate.";

  logger.info("Agent generating personalized proposal", { company: company.company_name });

  let proposalContent: ProposalContentAI | null = null;
  let lastError = "";

  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const claude = await invokeClaude<unknown>({
        system,
        messages: [{ role: "user", content: enhancedUser }],
        json: true,
        maxTokens: 3500,
        temperature: 0.55,
      });
      const vr = validateAiOutput(proposalContentSchema, claude.json, {
        workflow_name: "agent.generate_proposal",
        entity_id: companyId,
      });
      if (vr.ok && vr.data) {
        proposalContent = vr.data;
        break;
      }
      lastError = vr.error ?? "Validation failed";
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
    }
  }

  if (!proposalContent) {
    throw new Error(`Proposal generation failed: ${lastError}`);
  }

  const contentMd = [
    `# ${proposalContent.title}`,
    "",
    "## Executive Summary",
    proposalContent.executive_summary,
    "",
    "## Campaign Rationale",
    proposalContent.campaign_rationale,
  ].join("\n");

  const { data: proposal, error: insErr } = await sb
    .from("proposals")
    .insert({
      company_id: companyId,
      campaign_id: campaignId,
      title: proposalContent.title,
      content: proposalContent as unknown as ProposalContent,
      content_md: contentMd,
      status: "under_review",
      generated_by: "bedrock-claude-agent",
      model_id: env.BEDROCK_MODEL_ID,
      prompt_version: PROMPT_VERSION,
    })
    .select("id, title, status, content")
    .single();

  if (insErr || !proposal) {
    throw new Error(insErr?.message ?? "Failed to save proposal");
  }

  await sb.from("proposal_versions").insert({
    proposal_id: proposal.id,
    version: 1,
    content: proposalContent as unknown as ProposalContent,
    content_md: contentMd,
  });

  await recordAudit({
    action: "proposal.agent_generated",
    entity_type: "proposal",
    entity_id: proposal.id,
    metadata: { company_id: companyId, campaign_id: campaignId, agent: true },
  });

  void enqueueCrmSync({
    entity_type: "proposal",
    entity_id: proposal.id,
    operation: "create",
  }).catch(err => console.error("[CRM] agent proposal sync failed", err));

  const content = proposal.content as Record<string, string> | null;

  return {
    proposal_id: proposal.id,
    campaign_id: campaignId!,
    title: proposal.title,
    executive_summary: content?.executive_summary ?? proposalContent.executive_summary,
    status: "under_review",
  };
}
