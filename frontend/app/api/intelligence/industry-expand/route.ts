/**
 * POST /api/intelligence/industry-expand
 * Autonomously discovers companies in a given industry using Apify + AI.
 * Supports: local, Paraná, Brazil national, international scopes.
 */

import { NextResponse } from "next/server";
import { batchSearchGoogle } from "@/lib/intelligence/google-search";
import { invokeClaude } from "@/lib/bedrock/client";
import { supabaseAdmin } from "@/lib/supabase/server";
import { recordAudit } from "@/lib/audit/log";
import { logger } from "@/lib/monitoring/logger";

export const maxDuration = 90;
export const dynamic = "force-dynamic";

type Scope = "local" | "state" | "national" | "international";

type DiscoveredBrand = {
  name: string;
  domain?: string;
  industry: string;
  scope: Scope;
  sponsorship_active: boolean;
  sponsorship_likelihood: number;
  estimated_size: "small" | "medium" | "large";
  business_type: "B2B" | "B2C" | "B2B+B2C";
  why_interesting: string;
  source: "apify_search" | "ai_generated";
};

export async function POST(req: Request) {
  const startTime = Date.now();
  try {
    const { industry, company_id, scope = "national", limit = 20 } = await req.json() as {
      industry: string;
      company_id?: string;
      scope?: Scope;
      limit?: number;
    };

    if (!industry) return NextResponse.json({ error: "industry is required" }, { status: 400 });

    // Build search queries for this industry + scope
    const queries = buildIndustryQueries(industry, scope);
    logger.info("Industry expansion starting", { industry, scope, queries_count: queries.length });

    // Run Apify searches
    let searchResults: Awaited<ReturnType<typeof batchSearchGoogle>> = [];
    let apifyUsed = false;
    try {
      searchResults = await batchSearchGoogle(queries.slice(0, 5), {
        lang: "pt-BR",
        country: "br",
        numResults: 10,
        timeoutMs: 50_000,
      });
      apifyUsed = searchResults.some((r) => r.organic_results.length > 0);
    } catch (err) {
      logger.warn("Apify search failed for industry expand", { industry, error: String(err) });
    }

    // Aggregate domains found
    const domains = searchResults.flatMap((r) =>
      r.organic_results
        .filter((o) => !isNonCommercialDomain(o.domain ?? ""))
        .map((o) => ({ domain: o.domain ?? "", title: o.title, description: o.description, query: r.query }))
    );
    const uniqueDomains = deduplicateDomains(domains).slice(0, 30);
    const keywords = [...new Set(searchResults.flatMap((r) => r.keywords))].slice(0, 20);

    // AI enrichment
    const brands = await aiDiscoverBrands(industry, scope, uniqueDomains, keywords, limit);

    // Persist to Supabase as discovered leads if company_id provided
    if (company_id && brands.length > 0) {
      const sb = supabaseAdmin();
      const { data: existing } = await sb.from("companies").select("full_intelligence").eq("id", company_id).maybeSingle();
      const intel = (existing?.full_intelligence ?? {}) as Record<string, unknown>;
      await sb.from("companies").update({
        full_intelligence: {
          ...intel,
          industry_expansion: {
            industry,
            scope,
            brands,
            keywords,
            expanded_at: new Date().toISOString(),
            apify_used: apifyUsed,
          },
        },
      }).eq("id", company_id);
    }

    await recordAudit({
      action: "intelligence.industry_expand",
      entity_type: company_id ? "company" : "system",
      entity_id: company_id ?? "system",
      metadata: { industry, scope, brands_found: brands.length, apify_used: apifyUsed, duration_ms: Date.now() - startTime },
    });

    return NextResponse.json({
      success: true,
      industry,
      scope,
      brands,
      keywords,
      apify_used: apifyUsed,
      domains_found: uniqueDomains.length,
      duration_ms: Date.now() - startTime,
    });
  } catch (err) {
    logger.apiError("/api/intelligence/industry-expand", err);
    return NextResponse.json({ error: err instanceof Error ? err.message : "Failed" }, { status: 500 });
  }
}

// ── AI brand discovery ─────────────────────────────────────────────────────────
async function aiDiscoverBrands(
  industry: string,
  scope: Scope,
  domains: Array<{ domain: string; title: string; description: string }>,
  keywords: string[],
  limit: number
): Promise<DiscoveredBrand[]> {
  const geoLabel = { local: "Curitiba/Paraná", state: "Estado do Paraná", national: "Brasil", international: "Global/Internacional" }[scope];

  const prompt = `You are Coritiba FC's commercial intelligence analyst.
CRITICAL: NEVER mention Athletico Paranaense, Corinthians, Flamengo, Palmeiras, São Paulo FC, Grêmio, Internacional, Vasco, Cruzeiro or any football club.

Industry: ${industry}
Geographic scope: ${geoLabel}

Domains discovered via web search:
${domains.slice(0, 20).map((d) => `- ${d.domain}: "${d.title}" — ${d.description?.slice(0, 80)}`).join("\n")}

Keywords: ${keywords.slice(0, 15).join(", ")}

Discover up to ${Math.min(limit, 25)} companies in this industry that are relevant sponsorship prospects for Coritiba FC.
Include both well-known brands AND promising local/regional companies.
Mark companies that are actively sponsoring sports/events.

Return JSON ONLY:
{
  "brands": [
    {
      "name": "Company Name",
      "domain": "company.com.br",
      "industry": "${industry}",
      "scope": "${scope}",
      "sponsorship_active": true,
      "sponsorship_likelihood": 8.5,
      "estimated_size": "large",
      "business_type": "B2C",
      "why_interesting": "National brand with active sports marketing budget, strong Paraná presence"
    }
  ]
}`;

  const result = await invokeClaude({ messages: [{ role: "user", content: prompt }], maxTokens: 2500, temperature: 0.4 });
  try {
    const match = result.text.match(/\{[\s\S]*\}/);
    if (match) {
      const parsed = JSON.parse(match[0]) as { brands?: DiscoveredBrand[] };
      return (parsed.brands ?? []).map((b) => ({ ...b, source: domains.some((d) => d.domain === b.domain) ? "apify_search" : "ai_generated" } as DiscoveredBrand));
    }
  } catch { /* */ }
  return [];
}

// ── Query builders ────────────────────────────────────────────────────────────
function buildIndustryQueries(industry: string, scope: Scope): string[] {
  const geoMap: Record<Scope, string[]> = {
    local: ["Curitiba", "Paraná"],
    state: ["Paraná Brasil"],
    national: ["Brasil", "Brazil"],
    international: ["Brasil global", "multinacional"],
  };
  const geos = geoMap[scope];
  return [
    `principais empresas ${industry} ${geos[0]}`,
    `marcas ${industry} ${geos[0]} patrocínio esporte`,
    `${industry} empresas líderes ${geos[0]}`,
    `${industry} brands sponsors sports Brazil`,
    `maiores ${industry} ${geos[0]} marketing`,
    `${industry} empresas ${geos[1] ?? geos[0]} B2C`,
  ];
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function isNonCommercialDomain(domain: string): boolean {
  return ["google.", "wikipedia.", "youtube.", "facebook.", "instagram.", "linkedin.", "twitter.", "gov.", "edu.", "globo.", "uol.", "g1.", "folha.", "estadao."].some((e) => domain.includes(e));
}

function deduplicateDomains<T extends { domain: string }>(items: T[]): T[] {
  const seen = new Set<string>();
  return items.filter((i) => { if (!i.domain || seen.has(i.domain)) return false; seen.add(i.domain); return true; });
}
