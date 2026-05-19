/**
 * POST /api/intelligence/serp
 * Market intelligence via Apify Google Search + Claude AI enrichment.
 * Replaces SerpAPI dependency. Graceful fallback to AI-only when Apify unavailable.
 */

import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { invokeClaude } from "@/lib/bedrock/client";
import { searchGoogle, batchSearchGoogle } from "@/lib/intelligence/google-search";
import { logger } from "@/lib/monitoring/logger";

export const dynamic = "force-dynamic";
export const maxDuration = 90;

export async function POST(req: Request) {
  try {
    const { company_id, company_name, industry, website } = await req.json() as {
      company_id: string;
      company_name: string;
      industry?: string;
      website?: string;
    };

    const startTime = Date.now();

    // ── Apify Google Search ───────────────────────────────────────────
    const queries = [
      `concorrentes de ${company_name} Brasil`,
      `${company_name} patrocínio esporte futebol`,
      `empresas similares ${company_name} ${industry ?? ""}`,
    ];

    let searchResults: Awaited<ReturnType<typeof batchSearchGoogle>> = [];
    let apifyWorked = false;

    try {
      searchResults = await batchSearchGoogle(queries.slice(0, 2), {
        lang: "pt",
        country: "BR",
        numResults: 8,
        timeoutMs: 45_000,
      });
      apifyWorked = searchResults.some((r) => r.organic_results.length > 0);
    } catch (e) {
      logger.warn("Apify search failed, using AI fallback", { error: String(e) });
    }

    const serpContext = apifyWorked && searchResults.length > 0
      ? `\nWeb search results:\n${searchResults.flatMap((r) => r.organic_results).slice(0, 8).map((o) => `- ${o.title}: ${o.description?.slice(0, 100) ?? ""}`).join("\n")}`
      : "\n(No live web search — using training knowledge for Brazil market)";

    // ── AI Enrichment ─────────────────────────────────────────────────
    const prompt = `You are a Brazilian commercial intelligence analyst for Coritiba FC sponsorship.
Company: ${company_name}
Industry: ${industry ?? "Unknown"}
Website: ${website ?? "Unknown"}
${serpContext}

CRITICAL RULES:
- NEVER mention Athletico Paranaense, Corinthians, Flamengo, Palmeiras, São Paulo FC, Grêmio, Internacional or any Brazilian football club
- Only suggest non-football commercial/corporate companies
- Keep all recommendations Coritiba FC focused

Return JSON ONLY:
{
  "competitors": [
    {"name": "Company Name", "reason": "Direct competitor because...", "estimated_spend": "R$X/year", "sponsorship_active": true, "website": "domain.com", "confidence": 0.9}
  ],
  "market_context": {
    "industry_summary": "Overview of sponsorship behavior in this industry",
    "average_sponsorship_budget": "R$X–Y/year for companies this size",
    "typical_roi_metrics": ["metric1", "metric2"],
    "market_growth": "Growing/Stable/Declining",
    "seasonality": "Q1/Q2/Q3/Q4 budget planning typical timing"
  },
  "sponsorship_discovery": [
    {"brand": "Brand Name", "sport_type": "football/motorsport/etc", "club_or_team": "Team Name", "region": "national/regional", "notes": "context"}
  ],
  "keyword_clusters": {
    "primary_keywords": ["kw1","kw2"],
    "sponsorship_language": ["phrase1","phrase2"],
    "audience_terms": ["term1","term2"]
  },
  "industry_graph": {
    "adjacent_industries": ["industry1","industry2"],
    "b2b_partners": ["partner type1","partner type2"],
    "distribution_channels": ["channel1","channel2"]
  },
  "coritiba_positioning": {
    "unique_angle": "Why Coritiba specifically over other clubs",
    "differentiation": "What makes this partnership unique",
    "risk_mitigation": "How to address likely objections"
  },
  "apify_worked": ${apifyWorked},
  "data_source": "${apifyWorked ? "apify+ai" : "ai_only"}"
}`;

    const result = await invokeClaude({
      messages: [{ role: "user", content: prompt }],
      maxTokens: 3000,
      temperature: 0.3,
    });

    let intelligence: Record<string, unknown> = {};
    try {
      const match = result.text.match(/\{[\s\S]*\}/);
      if (match) intelligence = JSON.parse(match[0]);
    } catch { /* fallback */ }

    // ── Persist ───────────────────────────────────────────────────────
    const sb = supabaseAdmin();
    const { data: company } = await sb.from("companies")
      .select("full_intelligence, intelligence")
      .eq("id", company_id)
      .maybeSingle();

    const existing = (company?.full_intelligence ?? company?.intelligence ?? {}) as Record<string, unknown>;
    const updated = {
      ...existing,
      serp_intelligence: intelligence,
      competitors: intelligence.competitors ?? existing.competitors ?? [],
      market_context: intelligence.market_context ?? {},
      keyword_clusters: intelligence.keyword_clusters ?? {},
      industry_graph: intelligence.industry_graph ?? {},
      sponsorship_discovery: intelligence.sponsorship_discovery ?? [],
      serp_updated_at: new Date().toISOString(),
      serp_method: apifyWorked ? "apify+claude" : "claude_only",
    };

    await sb.from("companies").update({
      full_intelligence: updated,
      intelligence: updated,
    }).eq("id", company_id);

    logger.info("SERP intelligence completed", {
      company_id,
      apify_worked: apifyWorked,
      duration_ms: Date.now() - startTime,
      competitors_found: (intelligence.competitors as unknown[])?.length ?? 0,
    });

    return NextResponse.json({
      success: true,
      apify_worked: apifyWorked,
      data_source: intelligence.data_source ?? "ai_only",
      competitors: intelligence.competitors ?? [],
      market_context: intelligence.market_context ?? {},
      keyword_clusters: intelligence.keyword_clusters ?? {},
      industry_graph: intelligence.industry_graph ?? {},
      sponsorship_discovery: intelligence.sponsorship_discovery ?? [],
      coritiba_positioning: intelligence.coritiba_positioning ?? {},
    });
  } catch (err) {
    logger.apiError("/api/intelligence/serp", err);
    return NextResponse.json({ error: err instanceof Error ? err.message : "Failed" }, { status: 500 });
  }
}
