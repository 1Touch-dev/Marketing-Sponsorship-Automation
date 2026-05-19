/**
 * Playwright scraper — only imported dynamically when available.
 * This file is NOT imported at build time; only called via dynamic import.
 */

import { logger } from "@/lib/monitoring/logger";
import type { WebContent } from "@/lib/intelligence/website-crawler";

export async function checkPlaywright(): Promise<boolean> {
  try {
    await import("playwright");
    return true;
  } catch {
    return false;
  }
}

export async function scrapeWithPlaywright(
  url: string
): Promise<Omit<WebContent, "scrape_method" | "scraped_at">> {
  const { chromium } = await import("playwright");
  const browser = await chromium.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"],
  });
  const context = await browser.newContext({
    userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
    viewport: { width: 1440, height: 900 },
    locale: "pt-BR",
  });
  const page = await context.newPage();
  let screenshotBase64: string | null = null;

  try {
    await page.goto(url, { waitUntil: "networkidle", timeout: 20000 });
    await page.waitForTimeout(2000);

    try {
      const ss = await page.screenshot({ type: "jpeg", quality: 60, clip: { x: 0, y: 0, width: 1440, height: 800 } });
      screenshotBase64 = `data:image/jpeg;base64,${ss.toString("base64")}`;
    } catch { /* skip */ }

    const title = await page.title();
    const metaDescription = await page.$eval('meta[name="description"]', (el) => (el as HTMLMetaElement).content).catch(() => "");
    const heroText = await page.$$eval("h1, h2", (els) => els.slice(0, 3).map((e) => e.textContent?.trim() ?? "").join(" | ")).catch(() => "");
    const navigation = await page.$$eval("nav a, header a", (els) => [...new Set(els.slice(0, 20).map((e) => e.textContent?.trim() ?? "").filter(Boolean))]).catch(() => [] as string[]);
    const ctaTexts = await page.$$eval("button, a[class*='btn'], a[class*='cta']", (els) => [...new Set(els.slice(0, 12).map((e) => e.textContent?.trim() ?? "").filter(Boolean))]).catch(() => [] as string[]);
    const text = await page.evaluate(() => document.body.innerText.slice(0, 4000)).catch(() => "");
    const links = await page.$$eval("a[href]", (els) => els.map((e) => (e as HTMLAnchorElement).href)).catch(() => [] as string[]);

    const socialLinks: string[] = [];
    const socialPatterns: Record<string, RegExp> = { linkedin: /linkedin\.com\/company/i, instagram: /instagram\.com/i, youtube: /youtube\.com/i, facebook: /facebook\.com/i, twitter: /twitter\.com|x\.com/i };
    for (const [name, re] of Object.entries(socialPatterns)) {
      if (links.some((l) => re.test(l))) socialLinks.push(name);
    }

    const keywords = extractKeywords(title + " " + metaDescription + " " + heroText);
    const html = await page.content().catch(() => "");
    const techSignals = detectTech(html);
    const sponsorshipMentions = extractPatterns(text, [/patroc[íi]n/gi, /sponsor/gi, /parceria/gi]);
    const campaignMentions = extractPatterns(text, [/campanha/gi, /promoç[aã]o/gi]);
    const pricingSignals = extractPatterns(text, [/R\$[\d.,]+/, /\bplano\b/gi, /\bcontrato\b/gi]);

    let completeness = 0;
    if (title) completeness += 0.2; if (metaDescription) completeness += 0.15; if (heroText) completeness += 0.15;
    if (keywords.length > 5) completeness += 0.1; if (socialLinks.length > 0) completeness += 0.1;
    if (navigation.length > 3) completeness += 0.1; if (screenshotBase64) completeness += 0.1; if (text.length > 500) completeness += 0.1;

    return { url, title, text, meta_description: metaDescription, keywords, social_links: socialLinks, tech_signals: techSignals, sponsorship_mentions: sponsorshipMentions, campaign_mentions: campaignMentions, hero_text: heroText, navigation, cta_texts: ctaTexts, pricing_signals: pricingSignals, screenshot_url: screenshotBase64, completeness: Math.min(completeness, 1) };
  } finally {
    await browser.close();
  }
}

function extractKeywords(text: string): string[] {
  const words = text.toLowerCase().match(/\b[a-záàâãéèêíïóôõöúùûü]{4,}\b/g) ?? [];
  const stops = new Set(["para","como","mais","uma","que","não","com","por","seu","sua","nos","nas","dos","das"]);
  const freq: Record<string, number> = {};
  for (const w of words) { if (!stops.has(w)) freq[w] = (freq[w] ?? 0) + 1; }
  return Object.entries(freq).sort((a, b) => b[1] - a[1]).slice(0, 20).map((e) => e[0]);
}

function extractPatterns(text: string, patterns: RegExp[]): string[] {
  const found = new Set<string>();
  for (const re of patterns) { const m = text.match(re) ?? []; m.forEach((x) => found.add(x.toLowerCase().trim())); }
  return [...found].slice(0, 10);
}

function detectTech(html: string): string[] {
  const s: string[] = [];
  if (/react|__NEXT_DATA__/i.test(html)) s.push("React/Next.js");
  if (/shopify/i.test(html)) s.push("Shopify");
  if (/wordpress|wp-content/i.test(html)) s.push("WordPress");
  if (/gtag|GA4/i.test(html)) s.push("Google Analytics");
  if (/hubspot/i.test(html)) s.push("HubSpot");
  return s;
}

function sleep(ms: number) { return new Promise((r) => setTimeout(r, ms)); }
