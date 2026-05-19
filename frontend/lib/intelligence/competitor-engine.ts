/**
 * Autonomous Competitor Discovery Engine
 * Uses Apify Google Search + AI enrichment to recursively discover
 * competitors, suppliers, and sponsorship-fit brands for any company.
 */

import { batchSearchGoogle } from "@/lib/intelligence/google-search";
import { invokeClaude } from "@/lib/bedrock/client";
import { logger } from "@/lib/monitoring/logger";

// ── Types ─────────────────────────────────────────────────────────────────────
export type CompanyProfile = {
  id: string;
  name: string;
  industry?: string | null;
  website?: string | null;
  segment?: string | null;
  company_size?: string | null;
  business_type?: string | null;
  full_intelligence?: Record<string, unknown> | null;
};

export type DiscoveredCompetitor = {
  name: string;
  domain?: string;
  relationship: "direct_competitor" | "indirect_competitor" | "supplier" | "partner" | "adjacent";
  sponsorship_likelihood: number;   // 0–10
  marketing_maturity: number;       // 0–10
  sports_partnership_probability: number; // 0–10
  business_type: "B2B" | "B2C" | "B2B+B2C";
  geographic_reach: "local" | "state" | "national" | "international";
  why_relevant: string;
  source_queries: string[];
};

export type CompetitorDiscoveryResult = {
  company_id: string;
  company_name: string;
  competitors: DiscoveredCompetitor[];
  search_queries_run: string[];
  keyword_clusters: string[];
  market_categories: string[];
  sponsorship_landscape: string;
  industry_graph: {
    adjacent_industries: string[];
    suppliers: string[];
    distribution_channels: string[];
    b2b_buyers?: string[];
  };
  coritiba_positioning: {
    unique_angle: string;
    top_prospects: string[];
    risk_factors: string[];
  };
  discovered_at: string;
  apify_used: boolean;
  queries_executed: number;
};

// ── Main discovery function ───────────────────────────────────────────────────
export async function discoverCompetitors(
  company: CompanyProfile
): Promise<CompetitorDiscoveryResult> {
  const startTime = Date.now();
  logger.info("Competitor discovery starting", { company_id: company.id, company_name: company.name });

  // STEP 1: Generate search expansion terms
  const queries = buildSearchQueries(company);

  // STEP 2: Run Apify Google Search (batch)
  let searchResults: Awaited<ReturnType<typeof batchSearchGoogle>> = [];
  let apifyUsed = false;
  try {
    searchResults = await batchSearchGoogle(queries.slice(0, 6), {
      lang: "pt",
      country: "BR",
      numResults: 10,
      timeoutMs: 50_000,
    });
    apifyUsed = searchResults.some((r) => r.organic_results.length > 0);
    logger.info("Batch search completed", {
      queries_run: searchResults.length,
      total_results: searchResults.reduce((s, r) => s + r.organic_results.length, 0),
    });
  } catch (err) {
    logger.warn("Apify search failed, proceeding with AI-only discovery", { error: String(err) });
  }

  // STEP 3: Aggregate search signals
  const searchSignals = aggregateSearchSignals(searchResults);

  // STEP 4: AI Classification & Enrichment
  const enriched = await aiClassifyCompetitors(company, searchSignals, queries);

  const durationMs = Date.now() - startTime;
  logger.info("Competitor discovery completed", {
    company_id: company.id,
    competitors_found: enriched.competitors.length,
    apify_used: apifyUsed,
    duration_ms: durationMs,
  });

  return {
    ...enriched,
    search_queries_run: queries,
    apify_used: apifyUsed,
    queries_executed: queries.length,
    discovered_at: new Date().toISOString(),
  };
}

// ── STEP 1: Generate targeted search queries ──────────────────────────────────
function buildSearchQueries(company: CompanyProfile): string[] {
  const name = company.name;
  const industry = company.industry ?? "";
  const size = company.company_size ?? "medium";
  const geo = company.segment === "local" ? "Curitiba Paraná" : company.segment === "regional" ? "Paraná Brasil" : "Brasil";

  const queries = [
    // Direct competitor discovery
    `concorrentes de "${name}" ${geo}`,
    `empresas similares "${name}" mercado brasileiro`,
    // Industry competitors
    `principais empresas ${industry} ${geo}`,
    `marcas líderes ${industry} Brasil patrocínio esporte`,
    // Sponsorship discovery
    `${name} patrocínio futebol esporte`,
    `${industry} marcas patrocinam clubes futebol brasil`,
    // Market positioning
    `${industry} empresas ${size === "large" ? "grandes corporações" : "médio porte"} ${geo}`,
    // Goods/services discovery
    `${name} produtos serviços concorrentes`,
    // Sponsorship-active brands
    `sponsor football club brazil ${industry}`,
    `investimento esportivo ${industry} brasil 2024 2025`,
  ];

  // Add specific local queries if regional
  if (company.segment === "local" || company.segment === "regional") {
    queries.push(`empresas ${industry} Curitiba`);
    queries.push(`patrocinadores Coritiba FC parceiros`);
  }

  return [...new Set(queries)].slice(0, 10);
}

// ── STEP 3: Aggregate signals from search results ─────────────────────────────
type SearchSignals = {
  domains: Array<{ domain: string; title: string; description: string; query: string }>;
  related_keywords: string[];
  people_also_ask: string[];
  ad_companies: string[];
};

function aggregateSearchSignals(
  results: Awaited<ReturnType<typeof batchSearchGoogle>>
): SearchSignals {
  const domains: SearchSignals["domains"] = [];
  const keywords = new Set<string>();
  const paa = new Set<string>();
  const ads: string[] = [];

  for (const r of results) {
    for (const org of r.organic_results) {
      if (org.domain && !isNonCommercialDomain(org.domain)) {
        domains.push({ domain: org.domain, title: org.title, description: org.description, query: r.query });
      }
    }
    r.keywords.forEach((k) => keywords.add(k));
    r.related_searches.forEach((s) => keywords.add(s));
    r.people_also_ask.forEach((q) => paa.add(q));
    r.ads.forEach((a) => { if (a.url) ads.push(extractDomain(a.url)); });
  }

  return {
    domains: deduplicateDomains(domains).slice(0, 40),
    related_keywords: [...keywords].slice(0, 30),
    people_also_ask: [...paa].slice(0, 15),
    ad_companies: [...new Set(ads)].slice(0, 10),
  };
}

// ── STEP 4: AI classification ─────────────────────────────────────────────────
async function aiClassifyCompetitors(
  company: CompanyProfile,
  signals: SearchSignals,
  queries: string[]
): Promise<Omit<CompetitorDiscoveryResult, "search_queries_run" | "discovered_at" | "apify_used" | "queries_executed">> {
  const prompt = `You are Coritiba FC's commercial intelligence analyst.

CRITICAL RULES (NEVER VIOLATE):
- NEVER list Athletico Paranaense, Corinthians, Flamengo, Palmeiras, São Paulo FC, Grêmio, Internacional, Vasco, Cruzeiro, or any Brazilian football club as a competitor or prospect
- ALWAYS stay focused on commercial/corporate companies
- Keep all recommendations grounded in Coritiba FC partnership value

Company to analyze: ${company.name}
Industry: ${company.industry ?? "Unknown"}
Size: ${company.company_size ?? "Unknown"}
Location: ${company.segment ?? "local"}
Business type: ${company.business_type ?? "Unknown"}

Domains discovered via web search:
${signals.domains.slice(0, 20).map((d) => `- ${d.domain}: "${d.title}" — ${d.description?.slice(0, 100)}`).join("\n")}

Keywords found: ${signals.related_keywords.slice(0, 15).join(", ")}
People also ask: ${signals.people_also_ask.slice(0, 5).join(" | ")}
Ad companies found: ${signals.ad_companies.join(", ")}
Search queries run: ${queries.slice(0, 5).join(" | ")}

Based on all signals above, provide comprehensive competitor intelligence. Return JSON ONLY:
{
  "company_id": "${company.id}",
  "company_name": "${company.name}",
  "competitors": [
    {
      "name": "Company Name",
      "domain": "company.com.br",
      "relationship": "direct_competitor",
      "sponsorship_likelihood": 8.5,
      "marketing_maturity": 7.0,
      "sports_partnership_probability": 6.5,
      "business_type": "B2C",
      "geographic_reach": "national",
      "why_relevant": "Direct competitor with active sports marketing budget",
      "source_queries": ["query that surfaced this"]
    }
  ],
  "keyword_clusters": ["keyword1", "keyword2"],
  "market_categories": ["category1", "category2"],
  "sponsorship_landscape": "Overview of sponsorship behavior in this industry in Brazil",
  "industry_graph": {
    "adjacent_industries": ["industry1", "industry2"],
    "suppliers": ["supplier type"],
    "distribution_channels": ["channel1"],
    "b2b_buyers": ["buyer type"]
  },
  "coritiba_positioning": {
    "unique_angle": "Why Coritiba FC is uniquely positioned vs other clubs for this industry",
    "top_prospects": ["Company A", "Company B"],
    "risk_factors": ["potential objection or risk"]
  }
}`;

  const result = await invokeClaude({
    messages: [{ role: "user", content: prompt }],
    maxTokens: 3000,
    temperature: 0.3,
  });

  try {
    const match = result.text.match(/\{[\s\S]*\}/);
    if (match) return JSON.parse(match[0]) as Omit<CompetitorDiscoveryResult, "search_queries_run" | "discovered_at" | "apify_used" | "queries_executed">;
  } catch { /* fallback */ }

  return {
    company_id: company.id,
    company_name: company.name,
    competitors: [],
    keyword_clusters: signals.related_keywords.slice(0, 10),
    market_categories: [],
    sponsorship_landscape: "AI analysis unavailable",
    industry_graph: { adjacent_industries: [], suppliers: [], distribution_channels: [] },
    coritiba_positioning: { unique_angle: "", top_prospects: [], risk_factors: [] },
  };
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function extractDomain(url: string): string {
  try { return new URL(url).hostname.replace("www.", ""); } catch { return ""; }
}

function isNonCommercialDomain(domain: string): boolean {
  const exclude = ["google.", "wikipedia.", "youtube.", "facebook.", "instagram.", "linkedin.", "twitter.", "globo.", "uol.", "r7.", "folha.", "estadao.", "g1.", "gov.", "edu."];
  return exclude.some((e) => domain.includes(e));
}

function deduplicateDomains<T extends { domain: string }>(items: T[]): T[] {
  const seen = new Set<string>();
  return items.filter((i) => {
    if (!i.domain || seen.has(i.domain)) return false;
    seen.add(i.domain);
    return true;
  });
}
