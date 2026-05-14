import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { proposalGenerateSchema } from "@/lib/validators";
import { invokeClaude } from "@/lib/bedrock/client";
import {
  proposalPrompt,
  strategyVariantsPrompt,
  pricingTiersPrompt,
  visualPromptsPrompt,
  companyIntelligencePrompt,
  PROMPT_VERSION,
} from "@/lib/bedrock/prompts";
import { recordAudit } from "@/lib/audit/log";
import { serverEnv } from "@/lib/env";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";
import { startWorkflow, completeWorkflow, failWorkflow, retryWorkflow } from "@/lib/workflow-events";
import {
  proposalContentSchema,
  strategyVariantsResponseSchema,
  pricingTiersResponseSchema,
  visualPromptsResponseSchema,
  companyIntelligenceResponseSchema,
  validateAiOutput,
  type ProposalContentAI,
  type StrategyVariant,
  type PricingTier,
  type VisualPrompt,
  type CompanyIntelligence,
} from "@/lib/ai/schemas";
import type { ProposalContent } from "@/types/database";
import { guardColumns } from "@/lib/db/column-guard";

export const runtime = "nodejs";
export const maxDuration = 120;

const MAX_RETRIES = 2;

function renderMarkdown(content: ProposalContent): string {
  const c = content as unknown as ProposalContentAI;
  return [
    `# ${c.title}`,
    "",
    "## Executive Summary",
    c.executive_summary,
    "",
    "## Campaign Rationale",
    c.campaign_rationale,
    "",
    "## Sponsorship Value",
    c.sponsorship_value,
    "",
    "## Activation Plan",
    c.activation_plan,
    "",
    "## Deliverables",
    (c.deliverables ?? []).map((d: string) => `- ${d}`).join("\n"),
    "",
    "## Investment",
    c.investment_note,
    "",
    "## Next Steps",
    c.cta,
  ].join("\n");
}

/** Run a single Bedrock generation and return parsed JSON or null */
async function runGeneration(system: string, user: string, maxTokens = 2000): Promise<unknown> {
  const result = await invokeClaude<unknown>({
    system,
    messages: [{ role: "user", content: user }],
    json: true,
    maxTokens,
    temperature: 0.6,
  });
  return result.json;
}

/**
 * POST /api/proposals/generate
 *
 * v2: Runs a parallel multi-generation pipeline:
 *   1. Main proposal content (required, with retry)
 *   2. Strategy variants — 3 distinct strategic directions
 *   3. Pricing tiers — Low / Mid / High packages
 *   4. Visual prompts — image-generation prompts for mockups
 *   5. Company intelligence — fit analysis and strategic insights
 *
 * Failures in secondary pipelines are non-fatal — columns become null.
 */
export async function POST(req: Request) {
  const env = serverEnv();
  const ip = getClientIp(req);
  const rl = checkRateLimit(`proposal-gen:${ip}`, { max: 10, windowMs: 60_000 });
  if (!rl.ok) return NextResponse.json({ error: rl.message }, { status: 429 });

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

  type CampaignRow = typeof campaign & {
    companies: {
      id?: string;
      company_name: string;
      industry?: string | null;
      website?: string | null;
      country?: string | null;
      notes?: string | null;
    } | null;
  };
  const typedCampaign = campaign as CampaignRow;
  const company = typedCampaign.companies;
  if (!company) {
    return NextResponse.json({ error: "Company not found for this campaign" }, { status: 400 });
  }

  const companyCtx = {
    company_name: company.company_name,
    industry: company.industry,
    website: company.website,
    country: company.country ?? "BR",
    notes: company.notes,
  };

  const campaignCtx = {
    title: typedCampaign.title,
    summary: (typedCampaign as { summary?: string | null }).summary ?? null,
    activation: (typedCampaign as { activation?: string | null }).activation ?? null,
    cta: (typedCampaign as { cta?: string | null }).cta ?? null,
  };

  const eventId = await startWorkflow({
    workflow_name: "proposal.generate",
    entity_type: "campaign",
    entity_id: campaign.id,
    metadata: { campaign_title: campaignCtx.title, version: "v2" },
  });

  // ── 1. Main proposal content (with retry) ────────────────────────────────
  let proposalContent: ProposalContentAI | null = null;
  let lastError = "";
  let attempt = 0;

  for (attempt = 1; attempt <= MAX_RETRIES + 1; attempt++) {
    if (attempt > 1 && eventId) await retryWorkflow(eventId, attempt);
    try {
      const pt = proposalPrompt({ company: companyCtx, campaign: campaignCtx });
      const raw = await runGeneration(pt.system, pt.user, 3000);
      const vr = validateAiOutput(proposalContentSchema, raw, {
        workflow_name: "proposal.generate",
        entity_id: campaign.id,
      });
      if (vr.ok && vr.data) {
        proposalContent = vr.data;
        break;
      }
      lastError = vr.error ?? "Validation failed";
    } catch (err) {
      lastError = err instanceof Error ? err.message : "unknown";
    }
  }

  if (!proposalContent) {
    if (eventId) await failWorkflow(eventId, `All ${MAX_RETRIES + 1} attempts failed: ${lastError}`);
    return NextResponse.json({ error: "Proposal generation failed", detail: lastError }, { status: 502 });
  }

  // ── 2–5. Parallel secondary generations ──────────────────────────────────
  // Run all 4 enrichment generations in parallel.
  // Each has a 45s individual timeout and fails gracefully (non-fatal).
  const withTimeout = <T>(promise: Promise<T>, ms: number): Promise<T | null> =>
    Promise.race([
      promise.catch(() => null),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), ms)),
    ]);

  const [strategyVariants, pricingTiers, visualPrompts, intelligence] = await Promise.all([
    withTimeout(
      (async (): Promise<StrategyVariant[] | null> => {
        const pt = strategyVariantsPrompt({ company: companyCtx, campaign: campaignCtx });
        const raw = await runGeneration(pt.system, pt.user, 2500);
        const vr = validateAiOutput(strategyVariantsResponseSchema, raw, { workflow_name: "proposal.strategy_variants" });
        return vr.ok && vr.data ? vr.data.variants : null;
      })(),
      45000,
    ),

    withTimeout(
      (async (): Promise<PricingTier[] | null> => {
        const pt = pricingTiersPrompt({ company: companyCtx, campaign: campaignCtx });
        const raw = await runGeneration(pt.system, pt.user, 2000);
        const vr = validateAiOutput(pricingTiersResponseSchema, raw, { workflow_name: "proposal.pricing_tiers" });
        return vr.ok && vr.data ? vr.data.tiers : null;
      })(),
      45000,
    ),

    withTimeout(
      (async (): Promise<VisualPrompt[] | null> => {
        const pt = visualPromptsPrompt({ company: companyCtx, campaign: campaignCtx });
        const raw = await runGeneration(pt.system, pt.user, 2000);
        const vr = validateAiOutput(visualPromptsResponseSchema, raw, { workflow_name: "proposal.visual_prompts" });
        return vr.ok && vr.data ? (vr.data.visuals as unknown as VisualPrompt[]) : null;
      })(),
      45000,
    ),

    withTimeout(
      (async (): Promise<CompanyIntelligence | null> => {
        const pt = companyIntelligencePrompt({ company: companyCtx });
        const raw = await runGeneration(pt.system, pt.user, 1500);
        const vr = validateAiOutput(companyIntelligenceResponseSchema, raw, { workflow_name: "proposal.intelligence" });
        return vr.ok && vr.data ? vr.data.intelligence : null;
      })(),
      45000,
    ),
  ]);

  // ── 3. Persist ─────────────────────────────────────────────────────────────
  const contentMd = renderMarkdown(proposalContent as unknown as ProposalContent);

  const baseRow = {
    company_id: (campaign as { company_id: string }).company_id,
    campaign_id: campaign.id,
    title: proposalContent.title,
    content: proposalContent as unknown as ProposalContent,
    content_md: contentMd,
    status: "draft" as const,
    generated_by: "bedrock-claude",
    model_id: env.BEDROCK_MODEL_ID,
    prompt_version: PROMPT_VERSION,
  };

  // New 0007 columns — persisted if present; guardColumns handles graceful omission
  const intelligenceRow = guardColumns("proposals_intelligence", {
    strategy_variants: strategyVariants ?? null,
    pricing_tiers: pricingTiers ?? null,
    visual_prompts: visualPrompts ?? null,
    intelligence: intelligence ?? null,
  });

  const insertRow = { ...baseRow, ...intelligenceRow };

  const { data: proposal, error: insErr } = await sb
    .from("proposals")
    .insert(insertRow)
    .select("*")
    .single();

  if (insErr || !proposal) {
    if (eventId) await failWorkflow(eventId, insErr?.message ?? "insert failed");
    return NextResponse.json({ error: insErr?.message ?? "insert failed" }, { status: 500 });
  }

  await sb.from("proposal_versions").insert({
    proposal_id: proposal.id,
    version: 1,
    content: proposalContent as unknown as ProposalContent,
    content_md: contentMd,
  });

  if (intelligence && company.id) {
    await sb
      .from("companies")
      .update({ intelligence } as Record<string, unknown>)
      .eq("id", company.id as string);
  }

  if (eventId) {
    await completeWorkflow(eventId, {
      proposal_id: proposal.id,
      has_strategy_variants: !!strategyVariants,
      has_pricing_tiers: !!pricingTiers,
      has_visual_prompts: !!visualPrompts,
      has_intelligence: !!intelligence,
      attempts: attempt,
    });
  }

  await recordAudit({
    entity_type: "proposal",
    entity_id: proposal.id,
    action: "proposal.generated",
    metadata: {
      campaign_id: campaign.id,
      prompt_version: PROMPT_VERSION,
      strategy_variants: strategyVariants?.length ?? 0,
      pricing_tiers: pricingTiers?.length ?? 0,
      visual_prompts: visualPrompts?.length ?? 0,
      has_intelligence: !!intelligence,
    },
  });

  return NextResponse.json({ data: proposal, attempts: attempt });
}
