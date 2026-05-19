/**
 * POST /api/intelligence/goods-search
 * Search for companies by product/service type (goods discovery).
 * James's "Find Similar Companies" feature.
 */

import { NextResponse } from "next/server";
import { batchSearchGoogle } from "@/lib/intelligence/google-search";
import { invokeClaude } from "@/lib/bedrock/client";
import { recordAudit } from "@/lib/audit/log";
import { logger } from "@/lib/monitoring/logger";

export const maxDuration = 90;
export const dynamic = "force-dynamic";

type GoodsSearchResult = {
  query: string;
  companies: Array<{
    name: string;
    domain?: string;
    category: string;
    products_services: string;
    locality: string;
    business_type: "B2B" | "B2C" | "B2B+B2C";
    sponsorship_fit: number;
    barter_potential: boolean;
    estimated_size: "small" | "medium" | "large";
    why_good_prospect: string;
  }>;
  market_keywords: string[];
  related_categories: string[];
  apify_used: boolean;
  searched_at: string;
};

export async function POST(req: Request) {
  const startTime = Date.now();
  try {
    const { query, location = "Brasil", limit = 15 } = await req.json() as {
      query: string;
      location?: string;
      limit?: number;
    };

    if (!query) return NextResponse.json({ error: "query is required" }, { status: 400 });

    // Build search queries for goods/services
    const queries = [
      `empresas ${query} ${location}`,
      `fornecedores ${query} ${location} patrocínio`,
      `${query} marcas Brasil esporte`,
      `${query} companies Brazil sponsors`,
    ];

    // Run Apify searches
    let searchResults: Awaited<ReturnType<typeof batchSearchGoogle>> = [];
    let apifyUsed = false;
    try {
      searchResults = await batchSearchGoogle(queries.slice(0, 4), {
        lang: "pt",
        country: "BR",
        numResults: 10,
        timeoutMs: 45_000,
      });
      apifyUsed = searchResults.some((r) => r.organic_results.length > 0);
    } catch (err) {
      logger.warn("Apify search failed for goods-search", { query, error: String(err) });
    }

    const domains = searchResults
      .flatMap((r) => r.organic_results)
      .filter((o) => !isNonCommercialDomain(o.domain ?? ""))
      .map((o) => ({ domain: o.domain, title: o.title, description: o.description }));

    const uniqueDomains = deduplicateDomains(domains).slice(0, 25);
    const keywords = [...new Set(searchResults.flatMap((r) => r.keywords))].slice(0, 20);

    // AI enrichment
    const prompt = `You are Coritiba FC's commercial intelligence analyst.
CRITICAL: NEVER mention any Brazilian football club as a prospect or competitor.

Search query: "${query}"
Location: ${location}

Domains found via web search:
${uniqueDomains.slice(0, 15).map((d) => `- ${d.domain}: "${d.title}" — ${d.description?.slice(0, 80)}`).join("\n")}

Keywords: ${keywords.slice(0, 12).join(", ")}

Find up to ${limit} companies that:
1. Sell "${query}" products/services
2. Would benefit from Coritiba FC sponsorship
3. Have barter potential (can exchange goods/services for visibility)

Consider: uniform suppliers, food/beverage companies, tech companies, equipment providers, etc.

Return JSON ONLY:
{
  "companies": [
    {
      "name": "Company Name",
      "domain": "company.com.br",
      "category": "category name",
      "products_services": "brief description",
      "locality": "Curitiba / Paraná / Brasil",
      "business_type": "B2B",
      "sponsorship_fit": 8.0,
      "barter_potential": true,
      "estimated_size": "medium",
      "why_good_prospect": "reason"
    }
  ],
  "market_keywords": ["keyword1", "keyword2"],
  "related_categories": ["category1", "category2"]
}`;

    const aiResult = await invokeClaude({ messages: [{ role: "user", content: prompt }], maxTokens: 2500, temperature: 0.4 });
    let aiData: { companies?: GoodsSearchResult["companies"]; market_keywords?: string[]; related_categories?: string[] } = {};
    try {
      const m = aiResult.text.match(/\{[\s\S]*\}/);
      if (m) aiData = JSON.parse(m[0]);
    } catch { /* */ }

    await recordAudit({
      action: "intelligence.goods_search",
      entity_type: "system",
      entity_id: "system",
      metadata: { query, location, companies_found: aiData.companies?.length ?? 0, apify_used: apifyUsed, duration_ms: Date.now() - startTime },
    });

    const result: GoodsSearchResult = {
      query,
      companies: aiData.companies ?? [],
      market_keywords: aiData.market_keywords ?? keywords.slice(0, 10),
      related_categories: aiData.related_categories ?? [],
      apify_used: apifyUsed,
      searched_at: new Date().toISOString(),
    };

    return NextResponse.json({ success: true, ...result });
  } catch (err) {
    logger.apiError("/api/intelligence/goods-search", err);
    return NextResponse.json({ error: err instanceof Error ? err.message : "Failed" }, { status: 500 });
  }
}

function isNonCommercialDomain(domain: string): boolean {
  return ["google.", "wikipedia.", "youtube.", "facebook.", "instagram.", "linkedin.", "twitter.", "gov.", "edu.", "globo.", "uol.", "g1."].some((e) => domain.includes(e));
}
function deduplicateDomains<T extends { domain?: string }>(items: T[]): T[] {
  const seen = new Set<string>();
  return items.filter((i) => { const d = i.domain ?? ""; if (!d || seen.has(d)) return false; seen.add(d); return true; });
}
