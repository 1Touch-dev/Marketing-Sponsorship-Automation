/**
 * Google Search Intelligence
 * Uses Apify's google-search-scraper actor for commercial intelligence.
 * Falls back to AI-only analysis when Apify is unavailable.
 */

import { runActor, ACTORS, ApifyRunError } from "@/lib/intelligence/apify";
import { logger } from "@/lib/monitoring/logger";

// ── Types ─────────────────────────────────────────────────────────────────────
export type SearchOptions = {
  lang?: string;        // default: "pt"
  country?: string;     // default: "BR"
  numResults?: number;  // default: 10
  safeSearch?: boolean; // default: true
  /** Max Apify actor wait time (ms) */
  timeoutMs?: number;
};

export type OrganicResult = {
  title: string;
  url: string;
  description: string;
  position: number;
  domain?: string;
};

export type GoogleSearchResult = {
  query: string;
  organic_results: OrganicResult[];
  related_searches: string[];
  keywords: string[];
  ads: Array<{ title: string; url: string; description: string }>;
  people_also_ask: string[];
  knowledge_graph?: { title?: string; description?: string; website?: string };
  metadata: {
    total_results?: number;
    search_time_ms?: number;
    actor_used: string;
    from_cache: boolean;
    searched_at: string;
  };
};

// ── Main search function ──────────────────────────────────────────────────────
export async function searchGoogle(
  query: string,
  options: SearchOptions = {}
): Promise<GoogleSearchResult> {
  const {
    lang = "pt-BR",
    country = "br",
    numResults = 10,
    safeSearch = true,
    timeoutMs = 45_000,
  } = options;

  const startTime = Date.now();

  try {
    const result = await runActor<RawSerpItem>(
      ACTORS.GOOGLE_SEARCH,
      {
        queries: query,
        countryCode: country.toLowerCase(),
        languageCode: lang,
        maxPagesPerQuery: 1,
        resultsPerPage: Math.min(numResults, 10),
        saveHtml: false,
        saveHtmlToKeyValueStore: false,
      },
      { timeoutMs, maxItems: numResults + 10, retries: 2 }
    );

    return normalizeSearchResults(query, result.items);
  } catch (err) {
    // Graceful degradation — return empty result on failure
    logger.warn("Google search actor failed, returning empty result", {
      query,
      error: err instanceof Error ? err.message : String(err),
      duration_ms: Date.now() - startTime,
    });
    return emptySearchResult(query, err instanceof Error ? err.message : String(err));
  }
}

// ── Multi-query batch search ──────────────────────────────────────────────────
export async function batchSearchGoogle(
  queries: string[],
  options: SearchOptions = {}
): Promise<GoogleSearchResult[]> {
  // Run up to 3 in parallel, then batch the rest
  const CONCURRENCY = 3;
  const results: GoogleSearchResult[] = [];

  for (let i = 0; i < queries.length; i += CONCURRENCY) {
    const batch = queries.slice(i, i + CONCURRENCY);
    const batchResults = await Promise.all(batch.map((q) => searchGoogle(q, options)));
    results.push(...batchResults);
    // Small pause between batches to respect rate limits
    if (i + CONCURRENCY < queries.length) await sleep(500);
  }

  return results;
}

// ── Normalize raw Apify SERP output ──────────────────────────────────────────
type RawSerpItem = {
  searchQuery?: { term?: string };
  organicResults?: Array<{
    title?: string;
    url?: string;
    description?: string;
    rank?: number;
  }>;
  relatedQueries?: Array<{ title?: string } | string>;
  peopleAlsoAsk?: Array<{ question?: string } | string>;
  adsTop?: Array<{ title?: string; url?: string; description?: string }>;
  knowledgeGraph?: { title?: string; description?: string; website?: string };
  // thescrappa variant field names
  title?: string;
  url?: string;
  description?: string;
};

function normalizeSearchResults(
  query: string,
  items: RawSerpItem[]
): GoogleSearchResult {
  // The actor returns one item per result page; first item has all results
  const page = items[0] as Record<string, unknown> | undefined;

  const organic: OrganicResult[] = [];
  const rawOrganic = (page?.organicResults ?? items) as Array<Record<string, unknown>>;

  for (const r of rawOrganic) {
    if (r.url && typeof r.url === "string") {
      organic.push({
        title: String(r.title ?? ""),
        url: String(r.url ?? ""),
        description: String(r.description ?? r.snippet ?? ""),
        position: Number(r.rank ?? r.position ?? organic.length + 1),
        domain: extractDomain(String(r.url ?? "")),
      });
    }
  }

  const relatedRaw = (page?.relatedQueries ?? []) as Array<Record<string, string> | string>;
  const related = relatedRaw.map((r) => (typeof r === "string" ? r : String(r.title ?? r.query ?? ""))).filter(Boolean).slice(0, 8);

  const paaRaw = (page?.peopleAlsoAsk ?? []) as Array<Record<string, string> | string>;
  const paa = paaRaw.map((r) => (typeof r === "string" ? r : String(r.question ?? r.text ?? ""))).filter(Boolean).slice(0, 6);

  const adsRaw = (page?.adsTop ?? []) as Array<Record<string, string>>;
  const ads = adsRaw.map((a) => ({ title: String(a.title ?? ""), url: String(a.url ?? ""), description: String(a.description ?? "") })).slice(0, 4);

  const kg = page?.knowledgeGraph as Record<string, string> | undefined;

  // Extract keywords from titles + descriptions
  const allText = organic.map((o) => o.title + " " + o.description).join(" ");
  const keywords = extractKeywords(allText + " " + related.join(" "));

  return {
    query,
    organic_results: organic,
    related_searches: related,
    keywords,
    ads,
    people_also_ask: paa,
    knowledge_graph: kg ? { title: kg.title, description: kg.description, website: kg.website } : undefined,
    metadata: {
      total_results: organic.length,
      actor_used: ACTORS.GOOGLE_SEARCH,
      from_cache: false,
      searched_at: new Date().toISOString(),
    },
  };
}

function emptySearchResult(query: string, error?: string): GoogleSearchResult {
  return {
    query,
    organic_results: [],
    related_searches: [],
    keywords: [],
    ads: [],
    people_also_ask: [],
    metadata: {
      total_results: 0,
      actor_used: "none",
      from_cache: false,
      searched_at: new Date().toISOString(),
    },
  };
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function extractDomain(url: string): string {
  try { return new URL(url).hostname.replace("www.", ""); } catch { return ""; }
}

function extractKeywords(text: string): string[] {
  const words = text.toLowerCase().match(/\b[a-záàâãéèêíïóôõöúùûü]{4,}\b/g) ?? [];
  const stops = new Set(["para","como","mais","mais","uma","que","não","com","por","seu","sua","nos","nas","dos","das","este","esta","são","será","foi","quando","sobre","pelo","pela","been","that","with","from","this","have","they","their","which","what"]);
  const freq: Record<string, number> = {};
  for (const w of words) { if (!stops.has(w)) freq[w] = (freq[w] ?? 0) + 1; }
  return Object.entries(freq).sort((a, b) => b[1] - a[1]).slice(0, 20).map((e) => e[0]);
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
