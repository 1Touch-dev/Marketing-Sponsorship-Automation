import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { invokeClaude } from "@/lib/bedrock/client";
import { logger } from "@/lib/monitoring/logger";

export const dynamic = "force-dynamic";
export const maxDuration = 90;

const SERPAPI_KEY = process.env.SERPAPI_KEY ?? process.env.SERPAPI_API_KEY ?? "";
const SERPAPI_BASE = "https://serpapi.com/search.json";

/** POST /api/intelligence/serp */
export async function POST(req: Request) {
  try {
    const { company_id, company_name, industry, website } = await req.json() as {
      company_id: string;
      company_name: string;
      industry?: string;
      website?: string;
    };

    const startTime = Date.now();
    let serpResults: SerpResult[] = [];
    let serpWorked = false;

    // ── Try SerpAPI if key is configured ─────────────────────────────
    if (SERPAPI_KEY && SERPAPI_KEY.length > 10) {
      try {
        const queries = [
          `concorrentes de ${company_name} Brasil`,
          `${company_name} patrocínio esporte futebol`,
          `empresas similares ${company_name} ${industry ?? ""}`,
        ];

        const allResults: SerpResult[] = [];
        for (const q of queries.slice(0, 2)) {
          const url = `${SERPAPI_BASE}?engine=google&q=${encodeURIComponent(q)}&api_key=${SERPAPI_KEY}&num=8&gl=br&hl=pt&safe=active`;
          const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
          if (!res.ok) continue;
          const data = await res.json() as { organic_results?: SerpResult[]; error?: string };
          if (data.error) {
            logger.warn("SerpAPI key invalid", { error: data.error });
            break;
          }
          allResults.push(...(data.organic_results ?? []));
          serpWorked = true;
        }
        serpResults = allResults;
      } catch (e) {
        logger.warn("SerpAPI fetch failed, using AI fallback", { error: String(e) });
      }
    }

    // ── AI-powered competitor discovery (always runs) ─────────────────
    const serpContext = serpWorked && serpResults.length > 0
      ? `\nWeb search results for context:\n${serpResults.slice(0, 6).map(r => `- ${r.title}: ${r.snippet ?? ""}`).join("\n")}`
      : "\n(No live web search available — use your training knowledge for Brazil market)";

    const prompt = `You are a Brazilian commercial intelligence analyst for Coritiba FC sponsorship.

Company: ${company_name}
Industry: ${industry ?? "Unknown"}
Website: ${website ?? "Unknown"}
${serpContext}

CRITICAL RULES:
- NEVER mention Athletico Paranaense, Corinthians, Flamengo, Palmeiras, São Paulo FC, Grêmio, Internacional or any Brazilian football club as inspiration
- Only suggest non-football competitors and business-domain companies
- Keep all recommendations Coritiba FC focused

Provide deep market intelligence for this company's sponsorship ecosystem. Return JSON ONLY:
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
  "serp_worked": ${serpWorked},
  "data_source": "${serpWorked ? "serp+ai" : "ai_only"}"
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

    // ── Persist to company intelligence ──────────────────────────────
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
      serp_method: serpWorked ? "serpapi+claude" : "claude_only",
    };

    await sb.from("companies").update({
      full_intelligence: updated,
      intelligence: updated,
    }).eq("id", company_id);

    logger.info("SERP intelligence completed", {
      company_id,
      serp_worked: serpWorked,
      duration_ms: Date.now() - startTime,
      competitors_found: (intelligence.competitors as unknown[])?.length ?? 0,
    });

    return NextResponse.json({
      success: true,
      serp_worked: serpWorked,
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

type SerpResult = {
  title: string;
  link: string;
  snippet?: string;
  position?: number;
};
