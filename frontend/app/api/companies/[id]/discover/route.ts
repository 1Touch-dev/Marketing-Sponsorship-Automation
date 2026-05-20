import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { invokeClaude, extractJson } from "@/lib/bedrock/client";

export const maxDuration = 90;

/**
 * POST /api/companies/[id]/discover
 * Auto-discover competitors, scrape their profiles, extract differentiators,
 * and persist everything back to the company record.
 */
export async function POST(req: Request, ctx: { params: { id: string } }) {
  const companyId = ctx.params.id;

  try {
    const sb = supabaseAdmin();

    const { data: company } = await sb
      .from("companies")
      .select("*")
      .eq("id", companyId)
      .maybeSingle();

    if (!company) return NextResponse.json({ error: "Company not found" }, { status: 404 });

    const co = company as Record<string, unknown>;

    // ── Step 1: Generate competitor search queries ────────────────────────────
    const queryPrompt = `You are a Brazilian market research analyst.

Company: ${co.company_name}
Industry: ${co.industry ?? "Unknown"}
Business type: ${co.business_type ?? "B2C"}
Size: ${co.company_size ?? "medium"}
Segment: ${co.segment ?? "local"}
Website: ${co.website ?? "unknown"}
Notes: ${co.notes ?? "none"}

Generate a JSON object with:
{
  "competitors": [
    {
      "name": "Competitor Company Name",
      "website": "competitor.com.br",
      "industry": "same industry",
      "reason": "why they are a direct competitor",
      "sponsorship_history": "known sponsorship activity if any",
      "estimated_size": "small|medium|large|enterprise",
      "business_type": "B2C|B2B|B2B2C",
      "segment": "local|state|national|global",
      "marketing_maturity": "low|medium|high",
      "sponsorship_likelihood": 8.5
    }
  ],
  "differentiators": {
    "unique_strengths": ["what makes ${co.company_name} unique vs competitors"],
    "competitor_weaknesses": ["gaps competitors have that Coritiba FC partnership could fill"],
    "proposal_angle": "The key differentiation angle to use when pitching ${co.company_name}",
    "best_strategy": "awareness|engagement|conversion|loyalty|barter|lei_de_incentivo",
    "personalization_hooks": ["specific things about this brand to reference in proposals"]
  },
  "market_context": {
    "industry_sponsorship_activity": "high|medium|low",
    "key_trends": ["relevant market trends"],
    "coritiba_fit_score": 8.0,
    "recommended_proposal_type": "sponsorship|barter|hybrid|lei_de_incentivo"
  }
}

Rules:
- Find 5-10 real Brazilian competitors
- NEVER include rival football clubs (Athletico Paranaense, Flamengo, Corinthians, etc.)
- Focus on commercial competitors, not sports teams
- Be specific to Brazilian market (Paraná/national)
- Base everything on known facts about these industries`;

    const result = await invokeClaude({
      messages: [{ role: "user", content: queryPrompt }],
      maxTokens: 3000,
      temperature: 0.4,
    });

    const parsed = extractJson(result.text) as Record<string, unknown> | null;
    if (!parsed) throw new Error("AI returned invalid response");

    const discoveredCompetitors = (parsed.competitors as Array<Record<string, unknown>>) ?? [];
    const differentiators = (parsed.differentiators as Record<string, unknown>) ?? {};
    const marketContext = (parsed.market_context as Record<string, unknown>) ?? {};

    // ── Step 2: Save competitors as company records ───────────────────────────
    const savedCompetitorIds: string[] = [];
    for (const comp of discoveredCompetitors.slice(0, 8)) {
      // Check if already exists
      const { data: existing } = await sb
        .from("companies")
        .select("id, company_name")
        .ilike("company_name", `%${String(comp.name).slice(0, 30)}%`)
        .maybeSingle();

      if (!existing) {
        const { data: newComp } = await (sb as any)
          .from("companies")
          .insert({
            company_name: comp.name,
            website: comp.website ?? null,
            industry: comp.industry ?? co.industry,
            business_type: comp.business_type ?? "B2C",
            company_size: comp.estimated_size ?? "medium",
            segment: comp.segment ?? "national",
            status: "prospect",
            pipeline_stage: "prospect",
            notes: `Auto-discovered as competitor of ${co.company_name}. ${comp.reason ?? ""}`,
            full_intelligence: {
              sponsorship_history: comp.sponsorship_history,
              marketing_maturity: comp.marketing_maturity,
              sponsorship_likelihood: comp.sponsorship_likelihood,
              discovered_from: companyId,
              discovery_reason: comp.reason,
            },
          })
          .select("id")
          .single();

        if (newComp?.id) savedCompetitorIds.push(newComp.id as string);
      } else {
        savedCompetitorIds.push(existing.id as string);
      }
    }

    // ── Step 3: Update main company with competitor names + differentiators ───
    const competitorNames = discoveredCompetitors.map(c => String(c.name));

    const updatedIntelligence = {
      ...(co.full_intelligence as Record<string, unknown> ?? {}),
      competitors: discoveredCompetitors,
      differentiators,
      market_context: marketContext,
      competitor_names: competitorNames,
      discovery_completed_at: new Date().toISOString(),
    };

    await sb.from("companies")
      .update({
        competitors: competitorNames,
        full_intelligence: updatedIntelligence,
        last_discovery_at: new Date().toISOString(),
        discovery_method: "ai_auto",
      } as unknown as Record<string, unknown>)
      .eq("id", companyId);

    return NextResponse.json({
      success: true,
      competitors_found: discoveredCompetitors.length,
      competitors_saved_as_companies: savedCompetitorIds.length,
      competitor_names: competitorNames,
      differentiators,
      market_context: marketContext,
    });
  } catch (err) {
    console.error("[company/discover]", err);
    return NextResponse.json({ error: err instanceof Error ? err.message : "Discovery failed" }, { status: 500 });
  }
}
