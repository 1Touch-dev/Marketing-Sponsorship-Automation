/**
 * Website Content Intelligence
 * Fallback chain:
 * 1. Playwright (if browser available)
 * 2. Apify website-content-crawler (JS-rendered deep extraction)
 * 3. Lightweight fetch scraper
 */

import { runActor, ACTORS } from "@/lib/intelligence/apify";
import { logger } from "@/lib/monitoring/logger";

export type WebContent = {
  url: string;
  title: string;
  text: string;
  markdown?: string;
  meta_description?: string;
  keywords: string[];
  social_links: string[];
  tech_signals: string[];
  sponsorship_mentions: string[];
  campaign_mentions: string[];
  hero_text: string;
  navigation: string[];
  cta_texts: string[];
  pricing_signals: string[];
  screenshot_url?: string | null;
  scrape_method: "playwright" | "apify_crawler" | "fetch";
  scraped_at: string;
  completeness: number; // 0–1
};

/**
 * Scrape a website using the best available method.
 * Priority: Playwright → Apify → fetch
 */
export async function scrapeWebsiteWithFallback(
  url: string,
  opts: { maxPages?: number; useApify?: boolean } = {}
): Promise<WebContent> {
  const { maxPages = 1, useApify = true } = opts;
  const targetUrl = normalizeUrl(url);

  // 1. Try Playwright
  try {
    const { checkPlaywright, scrapeWithPlaywright } = await import("@/lib/intelligence/playwright-scraper");
    if (await checkPlaywright()) {
      const result = await scrapeWithPlaywright(targetUrl);
      return { ...result, scrape_method: "playwright", scraped_at: new Date().toISOString() };
    }
  } catch { /* Playwright not available */ }

  // 2. Try Apify website-content-crawler
  if (useApify && process.env.APIFY_API_TOKEN) {
    try {
      const result = await scrapeWithApify(targetUrl, maxPages);
      return { ...result, scrape_method: "apify_crawler", scraped_at: new Date().toISOString() };
    } catch (err) {
      logger.warn("Apify crawler failed, falling back to fetch", { url: targetUrl, error: String(err) });
    }
  }

  // 3. Fallback: lightweight fetch
  const result = await scrapeWithFetch(targetUrl);
  return { ...result, scrape_method: "fetch", scraped_at: new Date().toISOString() };
}

// ── Apify website-content-crawler ─────────────────────────────────────────────
type ApifyCrawlerItem = {
  url?: string;
  title?: string;
  text?: string;
  markdown?: string;
  metadata?: { description?: string; languageCode?: string };
  crawlDepth?: number;
};

async function scrapeWithApify(url: string, maxPages = 1): Promise<Omit<WebContent, "scrape_method" | "scraped_at">> {
  const result = await runActor<ApifyCrawlerItem>(
    ACTORS.WEBSITE_CRAWLER,
    {
      startUrls: [{ url }],
      maxCrawlDepth: 0,        // homepage only for speed
      maxCrawlPages: maxPages,
      crawlerType: "playwright:firefox", // JS rendering
      proxyConfiguration: { useApifyProxy: true },
      removeCookieWarnings: true,
      clickElementsCssSelector: null,
      htmlTransformer: "readableText",
      outputFormats: ["text", "markdown"],
    },
    { timeoutMs: 90_000, maxItems: maxPages, retries: 2 }
  );

  const page = result.items[0];
  if (!page) throw new Error("Apify crawler returned no pages");

  const text = page.text ?? page.markdown ?? "";
  const title = page.title ?? "";
  const metaDesc = page.metadata?.description ?? "";

  return buildWebContent(url, title, metaDesc, text, page.markdown);
}

// ── Fetch fallback ─────────────────────────────────────────────────────────────
async function scrapeWithFetch(url: string): Promise<Omit<WebContent, "scrape_method" | "scraped_at">> {
  let html = "";
  const variants = [url, url.replace("https://", "https://www.")];
  for (const u of variants) {
    try {
      const res = await fetch(u, {
        signal: AbortSignal.timeout(8000),
        headers: { "User-Agent": "Mozilla/5.0 (compatible; CommercialIntelBot/2.0)" },
      });
      if (res.ok) { html = await res.text(); break; }
    } catch { continue; }
  }

  const title = html.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1]?.trim() ?? "";
  const metaDesc = html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i)?.[1]?.trim()
    ?? html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+name=["']description["']/i)?.[1]?.trim() ?? "";

  const textContent = html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .slice(0, 4000)
    .trim();

  return buildWebContent(url, title, metaDesc, textContent);
}

// ── Shared content builder ────────────────────────────────────────────────────
function buildWebContent(
  url: string,
  title: string,
  metaDesc: string,
  text: string,
  markdown?: string
): Omit<WebContent, "scrape_method" | "scraped_at"> {
  const heroText = extractHeroText(text);
  const keywords = extractKeywords(title + " " + metaDesc + " " + heroText);
  const sponsorshipMentions = extractPatterns(text, [/patroc[íi]n/gi, /sponsor/gi, /parceria/gi, /apoio\s+institucional/gi, /brand\s+activation/gi]);
  const campaignMentions = extractPatterns(text, [/campanha/gi, /promoç[aã]o/gi, /oferta\s+especial/gi, /sorteio/gi]);
  const pricingSignals = extractPatterns(text, [/R\$[\d.,]+/, /\bplano\b/gi, /\bassinar\b/gi, /\bcontrato\b/gi]);
  const socialLinks = detectSocialFromText(text);
  const techSignals = detectTech(text);
  const navigation = extractNavItems(text);
  const ctaTexts = extractCTAs(text);

  // Completeness score
  let completeness = 0;
  if (title) completeness += 0.2;
  if (metaDesc) completeness += 0.15;
  if (heroText) completeness += 0.15;
  if (keywords.length > 5) completeness += 0.1;
  if (socialLinks.length > 0) completeness += 0.1;
  if (navigation.length > 3) completeness += 0.1;
  if (sponsorshipMentions.length > 0) completeness += 0.1;
  if (text.length > 500) completeness += 0.1;

  return {
    url,
    title,
    text: text.slice(0, 3000),
    markdown,
    meta_description: metaDesc,
    keywords,
    social_links: socialLinks,
    tech_signals: techSignals,
    sponsorship_mentions: sponsorshipMentions,
    campaign_mentions: campaignMentions,
    hero_text: heroText,
    navigation,
    cta_texts: ctaTexts,
    pricing_signals: pricingSignals,
    screenshot_url: null,
    completeness: Math.min(completeness, 1),
  };
}

// ── Text extraction helpers ───────────────────────────────────────────────────
function extractHeroText(text: string): string {
  const firstLines = text.split(/\n/).filter((l) => l.trim().length > 20).slice(0, 3);
  return firstLines.join(" ").slice(0, 300);
}

function extractKeywords(text: string): string[] {
  const words = text.toLowerCase().match(/\b[a-záàâãéèêíïóôõöúùûü]{4,}\b/g) ?? [];
  const stops = new Set(["para","como","mais","uma","que","não","com","por","seu","sua","nos","nas","dos","das","este","esta","são","será","foi","quando","sobre","pelo","pela"]);
  const freq: Record<string, number> = {};
  for (const w of words) { if (!stops.has(w)) freq[w] = (freq[w] ?? 0) + 1; }
  return Object.entries(freq).sort((a, b) => b[1] - a[1]).slice(0, 20).map((e) => e[0]);
}

function extractPatterns(text: string, patterns: RegExp[]): string[] {
  const found = new Set<string>();
  for (const re of patterns) {
    const matches = text.match(re) ?? [];
    matches.forEach((m) => found.add(m.toLowerCase().trim()));
  }
  return [...found].slice(0, 10);
}

function detectSocialFromText(text: string): string[] {
  const found: string[] = [];
  const p: Record<string, RegExp> = { linkedin: /linkedin\.com/i, instagram: /instagram\.com/i, youtube: /youtube\.com/i, facebook: /facebook\.com/i, twitter: /twitter\.com|x\.com/i };
  for (const [name, re] of Object.entries(p)) { if (re.test(text)) found.push(name); }
  return found;
}

function detectTech(text: string): string[] {
  const s: string[] = [];
  if (/react|next\.js|__NEXT_DATA__/i.test(text)) s.push("React/Next.js");
  if (/shopify/i.test(text)) s.push("Shopify");
  if (/wordpress|wp-content/i.test(text)) s.push("WordPress");
  if (/google.*analytics|gtag|GA4/i.test(text)) s.push("Google Analytics");
  if (/hubspot/i.test(text)) s.push("HubSpot");
  if (/vtex/i.test(text)) s.push("VTEX");
  if (/rd\s*station|rdstation/i.test(text)) s.push("RD Station");
  if (/salesforce/i.test(text)) s.push("Salesforce");
  return s;
}

function extractNavItems(text: string): string[] {
  const words = text.match(/\b[A-Z][a-z]{2,15}\b/g) ?? [];
  return [...new Set(words)].slice(0, 12);
}

function extractCTAs(text: string): string[] {
  const ctas = text.match(/\b(Saiba mais|Fale conosco|Entre em contato|Solicite|Compre|Assine|Agende|Ver mais|Download|Inscreva)\b/gi) ?? [];
  return [...new Set(ctas.map((c) => c.trim()))].slice(0, 8);
}

function normalizeUrl(url: string): string {
  if (url.startsWith("http")) return url;
  return `https://${url}`;
}
