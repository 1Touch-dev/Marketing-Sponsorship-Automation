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
import { requirePermission } from "@/lib/auth/server-permission";

export const dynamic = "force-dynamic";
export const maxDuration = 90;

export async function POST(req: Request) {
  const auth = await requirePermission("run_intelligence");
  if ("error" in auth) return auth.error;

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
        lang: "pt-BR",
        country: "br",
        numResults: 8,
        timeoutMs: 45_000,
      });
      apifyWorked = searchResults.some((r) => r.organic_results.length > 0);
    } catch (e) {
      logger.warn("Apify search failed, using AI fallback", { error: String(e) });
    }

    const serpSnippets = apifyWorked && searchResults.length > 0
      ? searchResults.flatMap((r) => r.organic_results).slice(0, 10).map((o) => `- ${o.title}: ${(o.description ?? "").slice(0, 120)}`).join("\n")
      : "";

    const serpContext = serpSnippets
      ? `\nLive web search results (Brazil market):\n${serpSnippets}`
      : "\n(No live web search — use your knowledge of the Brazilian market)";

    // ── AI Enrichment ─────────────────────────────────────────────────
    const prompt = `You are a Brazilian commercial intelligence analyst for Coritiba FC sponsorship.
Analyze the company and return ONLY a valid JSON object. No prose, no markdown fences, no explanation.

Company: ${company_name}
Industry: ${industry ?? "Unknown"}
Website: ${website ?? "Unknown"}
${serpContext}

RULES:
- Return ONLY raw JSON, no markdown, no code blocks
- List 4-6 real direct competitor companies (same industry, same market position)
- Do NOT include football clubs as competitors
- Focus on companies that might sponsor Coritiba FC as alternatives

Required JSON structure:
{"competitors":[{"name":"string","reason":"string","estimated_spend":"string","sponsorship_active":true,"website":"string"}],"market_context":{"industry_summary":"string","average_sponsorship_budget":"string","market_growth":"string","seasonality":"string"},"sponsorship_discovery":[{"brand":"string","sport_type":"string","region":"string","notes":"string"}],"keyword_clusters":{"primary_keywords":["string"],"sponsorship_language":["string"]},"coritiba_positioning":{"unique_angle":"string","differentiation":"string","risk_mitigation":"string"}}`;

    const result = await invokeClaude({
      system: "You are a commercial intelligence expert. Always respond with valid JSON only. Never use markdown code blocks.",
      messages: [{ role: "user", content: prompt }],
      maxTokens: 3000,
      temperature: 0.2,
      json: true,
    });

    let intelligence: Record<string, unknown> = {};
    if (result.json && typeof result.json === "object") {
      intelligence = result.json as Record<string, unknown>;
    } else {
      try {
        const text = (result.text ?? "").trim();
        try {
          intelligence = JSON.parse(text);
        } catch {
          const stripped = text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/i, "").trim();
          try {
            intelligence = JSON.parse(stripped);
          } catch {
            const match = stripped.match(/\{[\s\S]*\}/);
            if (match) intelligence = JSON.parse(match[0]);
          }
        }
      } catch {
        logger.warn("Failed to parse Claude JSON for SERP", { company: company_name });
      }
    }

    // Ensure competitors is always an array
    if (!Array.isArray(intelligence.competitors)) intelligence.competitors = [];
    // Add data source metadata
    intelligence.apify_worked = apifyWorked;
    intelligence.data_source = apifyWorked ? "apify+ai" : "ai_only";
    intelligence.serp_worked = apifyWorked;

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
      serp_worked: apifyWorked,
      data_source: String(intelligence.data_source ?? (apifyWorked ? "apify+ai" : "ai_only")),
      competitors: Array.isArray(intelligence.competitors) ? intelligence.competitors : [],
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
