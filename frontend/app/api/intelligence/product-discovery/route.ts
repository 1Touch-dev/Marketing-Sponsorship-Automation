/**
 * POST /api/intelligence/product-discovery
 *
 * James's flow: "when we add a product item, automatically scrape and find
 * competitors or companies that sell or manufacture that product in the city,
 * state, or nationally, and automatically scrape their info."
 *
 * Given a product/goods query this:
 *   1. Runs Apify Google SERP scraping across local / state / national tiers.
 *   2. AI-classifies the sellers/manufacturers of that product per tier.
 *   3. Optionally auto-saves them as prospect `companies` rows (deduped).
 *
 * Reuses the existing intelligence primitives (batchSearchGoogle, invokeClaude)
 * — this is the discovery engine wired to a product keyword rather than a
 * single company.
 */

import { NextResponse } from "next/server";
import { batchSearchGoogle } from "@/lib/intelligence/google-search";
import { invokeClaude } from "@/lib/bedrock/client";
import { supabaseAdmin } from "@/lib/supabase/server";
import { recordAudit } from "@/lib/audit/log";
import { logger } from "@/lib/monitoring/logger";
import { fetchAndStoreCompanyLogo } from "@/lib/companies/logo-enrichment";
import { requirePermission } from "@/lib/auth/server-permission";

export const maxDuration = 120;
export const dynamic = "force-dynamic";

type Tier = "local" | "state" | "national";

type DiscoveredSeller = {
  name: string;
  domain?: string;
  role: "seller" | "manufacturer" | "distributor" | "brand";
  products_services: string;
  locality: string;
  tier: Tier;
  business_type: "B2B" | "B2C" | "B2B+B2C";
  sponsorship_fit: number;
  barter_potential: boolean;
  estimated_size: "small" | "medium" | "large";
  why_good_prospect: string;
  source: "apify_search" | "ai_generated";
};

const TIER_GEO: Record<Tier, string> = {
  local: "Curitiba e região metropolitana, Paraná",
  state: "Estado do Paraná",
  national: "Brasil",
};

export async function POST(req: Request) {
  const auth = await requirePermission("run_intelligence");
  if ("error" in auth) return auth.error;

  const startTime = Date.now();
  try {
    const {
      product,
      tiers = ["local", "state", "national"],
      auto_save = false,
      limit_per_tier = 10,
    } = (await req.json()) as {
      product: string;
      tiers?: Tier[];
      auto_save?: boolean;
      limit_per_tier?: number;
    };

    if (!product || product.trim().length < 2) {
      return NextResponse.json({ error: "product is required (min 2 chars)" }, { status: 400 });
    }

    const activeTiers = (tiers.length ? tiers : (["local", "state", "national"] as Tier[])).filter(
      (t): t is Tier => t === "local" || t === "state" || t === "national",
    );

    const perTier: Record<Tier, DiscoveredSeller[]> = { local: [], state: [], national: [] };
    let apifyUsed = false;

    for (const tier of activeTiers) {
      const geo = TIER_GEO[tier];
      const queries = [
        `empresas que vendem ${product} ${geo}`,
        `fabricantes de ${product} ${geo}`,
        `fornecedores ${product} ${geo} patrocínio`,
        `principais marcas ${product} ${geo}`,
      ];

      let searchResults: Awaited<ReturnType<typeof batchSearchGoogle>> = [];
      try {
        searchResults = await batchSearchGoogle(queries, {
          lang: "pt-BR",
          country: "br",
          numResults: 10,
          timeoutMs: 45_000,
        });
        if (searchResults.some((r) => r.organic_results.length > 0)) apifyUsed = true;
      } catch (err) {
        logger.warn("Apify search failed for product-discovery", { product, tier, error: String(err) });
      }

      const domains = deduplicateDomains(
        searchResults
          .flatMap((r) => r.organic_results)
          .filter((o) => !isNonCommercialDomain(o.domain ?? ""))
          .map((o) => ({ domain: o.domain ?? "", title: o.title, description: o.description })),
      ).slice(0, 20);
      const keywords = [...new Set(searchResults.flatMap((r) => r.keywords))].slice(0, 15);

      perTier[tier] = await aiClassifySellers(product, tier, geo, domains, keywords, limit_per_tier);
    }

    const allSellers = activeTiers.flatMap((t) => perTier[t]);

    // Optional: persist discovered sellers as prospect companies (deduped).
    let savedCount = 0;
    if (auto_save && allSellers.length > 0) {
      savedCount = await saveSellersAsCompanies(product, allSellers);
    }

    await recordAudit({
      action: "intelligence.product_discovery",
      entity_type: "system",
      entity_id: "system",
      metadata: {
        product,
        tiers: activeTiers,
        sellers_found: allSellers.length,
        saved: savedCount,
        apify_used: apifyUsed,
        duration_ms: Date.now() - startTime,
      },
    });

    return NextResponse.json({
      success: true,
      product,
      tiers: activeTiers,
      by_tier: perTier,
      sellers: allSellers,
      total_found: allSellers.length,
      saved_as_companies: savedCount,
      apify_used: apifyUsed,
      duration_ms: Date.now() - startTime,
    });
  } catch (err) {
    logger.apiError("/api/intelligence/product-discovery", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Product discovery failed" },
      { status: 500 },
    );
  }
}

async function aiClassifySellers(
  product: string,
  tier: Tier,
  geo: string,
  domains: Array<{ domain: string; title: string; description: string }>,
  keywords: string[],
  limit: number,
): Promise<DiscoveredSeller[]> {
  const prompt = `You are Coritiba FC's commercial intelligence analyst.
CRITICAL: NEVER mention any Brazilian football club as a prospect or competitor.

Product / goods: "${product}"
Geographic tier: ${tier} (${geo})

Companies found via web search:
${domains.map((d) => `- ${d.domain}: "${d.title}" — ${(d.description ?? "").slice(0, 80)}`).join("\n") || "(none)"}

Keywords: ${keywords.join(", ")}

Find up to ${Math.min(limit, 15)} real companies located/operating in "${geo}" that SELL or MANUFACTURE "${product}".
For each, judge whether they are a good sponsorship prospect for Coritiba FC and whether they have barter potential (can exchange goods/services for exposure).

Return JSON ONLY:
{
  "sellers": [
    {
      "name": "Company Name",
      "domain": "company.com.br",
      "role": "seller|manufacturer|distributor|brand",
      "products_services": "brief description",
      "locality": "${geo}",
      "business_type": "B2B|B2C|B2B+B2C",
      "sponsorship_fit": 8.0,
      "barter_potential": true,
      "estimated_size": "small|medium|large",
      "why_good_prospect": "reason"
    }
  ]
}`;

  const result = await invokeClaude({
    messages: [{ role: "user", content: prompt }],
    maxTokens: 2500,
    temperature: 0.4,
  });
  try {
    const m = result.text.match(/\{[\s\S]*\}/);
    if (m) {
      const parsed = JSON.parse(m[0]) as { sellers?: Array<Omit<DiscoveredSeller, "tier" | "source">> };
      return (parsed.sellers ?? []).map((s) => ({
        ...s,
        tier,
        source: domains.some((d) => d.domain === s.domain) ? "apify_search" : "ai_generated",
      }));
    }
  } catch {
    /* ignore parse errors */
  }
  return [];
}

async function saveSellersAsCompanies(product: string, sellers: DiscoveredSeller[]): Promise<number> {
  const sb = supabaseAdmin();
  let saved = 0;
  for (const s of sellers.slice(0, 30)) {
    const { data: existing } = await sb
      .from("companies")
      .select("id")
      .ilike("company_name", `%${s.name.slice(0, 30)}%`)
      .maybeSingle();
    if (existing) continue;

    const { data: created } = await (sb as ReturnType<typeof supabaseAdmin>)
      .from("companies")
      .insert({
        company_name: s.name,
        website: s.domain ?? null,
        industry: product,
        business_type: s.business_type === "B2B+B2C" ? "B2C" : s.business_type,
        company_size: s.estimated_size,
        segment: s.tier === "local" ? "local" : s.tier === "state" ? "state" : "national",
        status: "prospect",
        pipeline_stage: "prospect",
        notes: `Auto-discovered as ${s.role} of "${product}" (${s.tier}). ${s.why_good_prospect ?? ""}`,
        full_intelligence: {
          discovered_via: "product_discovery",
          product,
          tier: s.tier,
          role: s.role,
          products_services: s.products_services,
          sponsorship_fit: s.sponsorship_fit,
          barter_potential: s.barter_potential,
          source: s.source,
        },
      } as unknown as never)
      .select("id")
      .single();
    if (created) {
      saved += 1;
      // Fire-and-forget logo scrape — auto-discovered companies should already
      // have a logo ready by the time someone opens the sponsor page (James: E).
      if (s.domain) {
        void fetchAndStoreCompanyLogo({
          companyId: created.id,
          domain: s.domain,
          companyName: s.name,
        }).catch(() => {});
      }
    }
  }
  return saved;
}

function isNonCommercialDomain(domain: string): boolean {
  return [
    "google.",
    "wikipedia.",
    "youtube.",
    "facebook.",
    "instagram.",
    "linkedin.",
    "twitter.",
    "gov.",
    "edu.",
    "globo.",
    "uol.",
    "g1.",
    "folha.",
    "estadao.",
    "mercadolivre.",
    "olx.",
  ].some((e) => domain.includes(e));
}

function deduplicateDomains<T extends { domain: string }>(items: T[]): T[] {
  const seen = new Set<string>();
  return items.filter((i) => {
    if (!i.domain || seen.has(i.domain)) return false;
    seen.add(i.domain);
    return true;
  });
}
