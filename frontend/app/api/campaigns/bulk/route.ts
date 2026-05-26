import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { invokeClaude } from "@/lib/bedrock/client";
import { PROMPT_VERSION } from "@/lib/bedrock/prompts";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";
import {
  strategyVariantsResponseSchema,
  pricingTiersResponseSchema,
  normalizeStrategyVariants,
  normalizePricingTiers,
  type StrategyVariant,
  type PricingTier,
} from "@/lib/ai/schemas";
import { proposalContentSchema } from "@/lib/ai/schemas";
import type { ProposalContent } from "@/types/database";
import { z } from "zod";

export const runtime = "nodejs";
export const maxDuration = 300;

const bulkSchema = z.object({
  industry: z.string().min(1, "Industry is required"),
  objective: z.string().optional().default("brand awareness"),
  company_ids: z.array(z.string().uuid()).optional(), // if omitted, all companies in industry
  max_companies: z.number().int().min(1).max(20).optional().default(10),
  campaign_title_prefix: z.string().optional(),
});

async function generateForCompany(
  company: { id: string; company_name: string; industry: string | null; website: string | null; country: string | null; notes: string | null },
  objective: string
): Promise<{
  campaign: { title: string; summary: string; activation: string | null };
  proposal: ProposalContent;
  strategy_variants: StrategyVariant[];
  pricing_tiers: PricingTier[];
  error?: string;
}> {
  const context = `Company: ${company.company_name}
Industry: ${company.industry ?? "general"}
Country: ${company.country ?? "BR"}
Website: ${company.website ?? "—"}
Objective: ${objective}`;

  try {
    // Campaign
    const campaignRes = await invokeClaude<{ title?: string; summary?: string; activation?: string }>({
      system: "You are a sports sponsorship strategist for Coritiba FC (Brazilian football club). Respond in JSON.",
      messages: [{ role: "user", content: `Generate a sponsorship campaign strategy for Coritiba FC × ${company.company_name}.
${context}

Return JSON with keys: title (string), summary (2-3 sentence strategy overview), activation (phased activation at Couto Pereira stadium, 2-3 sentences)` }],
      json: true,
      maxTokens: 800,
      temperature: 0.7,
    });
    const camp = (campaignRes.json ?? {}) as { title?: string; summary?: string; activation?: string };

    // Proposal content
    const proposalRes = await invokeClaude<unknown>({
      system: "You are a sponsorship proposal writer for Coritiba FC. Respond in JSON.",
      messages: [{ role: "user", content: `Write a concise sponsorship proposal for Coritiba FC × ${company.company_name}.
${context}
Campaign: ${camp.title ?? "Partnership Proposal"}

Return JSON: { executive_summary, campaign_rationale, sponsorship_value, activation_plan, deliverables (array of 5 items), investment_note, cta, title }` }],
      json: true,
      maxTokens: 1200,
      temperature: 0.65,
    });
    const rawProposal = proposalRes.json;
    const parsedProposal = proposalContentSchema.safeParse(rawProposal);

    // Variants
    const variantsRes = await invokeClaude<unknown>({
      system: "You are a sponsorship strategy expert for Coritiba FC. Respond in JSON.",
      messages: [{ role: "user", content: `Generate 3 distinct Coritiba FC sponsorship strategy variants for ${company.company_name} (${company.industry ?? "general industry"}).
Return JSON: { strategies: [ { name, tagline, description, key_benefits (array), estimated_reach, best_for } ] }` }],
      json: true,
      maxTokens: 1000,
      temperature: 0.75,
    });
    const parsedVariants = strategyVariantsResponseSchema.safeParse(variantsRes.json);

    // Pricing
    const pricingRes = await invokeClaude<unknown>({
      system: "You are a Coritiba FC sponsorship pricing expert. Respond in JSON.",
      messages: [{ role: "user", content: `Create 3 Coritiba FC sponsorship pricing tiers for ${company.company_name} (${company.industry ?? "general"}, ${company.country ?? "BR"}).
Return JSON: { tiers: [ { name, price_brl, description, includes (array), best_for, roi_estimate } ] }` }],
      json: true,
      maxTokens: 800,
      temperature: 0.6,
    });
    const parsedPricing = pricingTiersResponseSchema.safeParse(pricingRes.json);

    const proposalContent = parsedProposal.success
      ? (parsedProposal.data as unknown as ProposalContent)
      : ({ title: camp.title ?? `Coritiba FC × ${company.company_name}`, executive_summary: camp.summary ?? "" } as ProposalContent);

    return {
      campaign: {
        title: camp.title ?? `Coritiba FC × ${company.company_name}`,
        summary: camp.summary ?? "",
        activation: camp.activation ?? null,
      },
      proposal: proposalContent,
      strategy_variants: parsedVariants.success ? (normalizeStrategyVariants(parsedVariants.data) as { strategies: StrategyVariant[] }).strategies : [],
      pricing_tiers: parsedPricing.success ? (normalizePricingTiers(parsedPricing.data) as { tiers: PricingTier[] }).tiers : [],
    };
  } catch (e) {
    return {
      campaign: { title: `Coritiba FC × ${company.company_name}`, summary: "", activation: null },
      proposal: { title: `Coritiba FC × ${company.company_name}` } as ProposalContent,
      strategy_variants: [],
      pricing_tiers: [],
      error: e instanceof Error ? e.message : "Generation failed",
    };
  }
}

export async function POST(req: Request) {
  const ip = getClientIp(req);
  const rl = checkRateLimit(`bulk-campaigns:${ip}`, { max: 3, windowMs: 300_000 }); // 3 per 5 min
  if (!rl.ok) return NextResponse.json({ error: rl.message }, { status: 429 });

  const body = await req.json().catch(() => ({}));
  const parsed = bulkSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload", issues: parsed.error.issues }, { status: 400 });
  }

  const { industry, objective, company_ids, max_companies } = parsed.data;
  const sb = supabaseAdmin();

  // Fetch target companies
  let query = sb
    .from("companies")
    .select("id, company_name, industry, website, country, notes")
    .neq("status", "closed");

  if (company_ids && company_ids.length > 0) {
    query = query.in("id", company_ids);
  } else {
    query = query.ilike("industry", `%${industry}%`);
  }

  const { data: companies, error: companiesErr } = await query.limit(max_companies);
  if (companiesErr) return NextResponse.json({ error: companiesErr.message }, { status: 500 });
  if (!companies || companies.length === 0) {
    return NextResponse.json({ error: `No active companies found in industry: ${industry}` }, { status: 404 });
  }

  const results: Array<{
    company_id: string;
    company_name: string;
    campaign_id?: string;
    proposal_id?: string;
    status: "success" | "error";
    error?: string;
  }> = [];

  // Process sequentially to avoid overwhelming Bedrock
  for (const company of companies) {
    try {
      const gen = await generateForCompany(company, objective);

      // Insert campaign
      const { data: campaign, error: campErr } = await sb
        .from("campaigns")
        .insert({
          company_id: company.id,
          title: gen.campaign.title,
          summary: gen.campaign.summary,
          activation: gen.campaign.activation,
          description: `Bulk-generated for ${industry} industry`,
          status: "draft",
          prompt_version: PROMPT_VERSION,
        })
        .select("id")
        .single();

      if (campErr || !campaign) {
        results.push({ company_id: company.id, company_name: company.company_name, status: "error", error: campErr?.message ?? "Campaign insert failed" });
        continue;
      }

      // Insert proposal
      const { data: proposal, error: propErr } = await sb
        .from("proposals")
        .insert({
          company_id: company.id,
          campaign_id: campaign.id,
          title: gen.proposal.title ?? gen.campaign.title,
          content: gen.proposal,
          status: "draft",
          version: 1,
          prompt_version: PROMPT_VERSION,
          strategy_variants: gen.strategy_variants.length ? gen.strategy_variants : null,
          pricing_tiers: gen.pricing_tiers.length ? gen.pricing_tiers : null,
        })
        .select("id")
        .single();

      if (propErr || !proposal) {
        results.push({ company_id: company.id, company_name: company.company_name, campaign_id: campaign.id, status: "error", error: propErr?.message ?? "Proposal insert failed" });
        continue;
      }

      results.push({
        company_id: company.id,
        company_name: company.company_name,
        campaign_id: campaign.id,
        proposal_id: proposal.id,
        status: "success",
      });
    } catch (e) {
      results.push({ company_id: company.id, company_name: company.company_name, status: "error", error: e instanceof Error ? e.message : "Unknown error" });
    }
  }

  const successCount = results.filter((r) => r.status === "success").length;
  return NextResponse.json({
    message: `Generated ${successCount}/${companies.length} campaigns for industry: ${industry}`,
    results,
    total_processed: companies.length,
    successful: successCount,
    failed: companies.length - successCount,
  });
}
