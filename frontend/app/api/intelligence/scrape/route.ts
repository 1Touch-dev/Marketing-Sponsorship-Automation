import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { invokeClaude } from "@/lib/bedrock/client";
import { recordAudit } from "@/lib/audit/log";
import { logger } from "@/lib/monitoring/logger";
import { requirePermission } from "@/lib/auth/server-permission";

export const maxDuration = 90;

/** POST /api/intelligence/scrape */
export async function POST(req: Request) {
  const auth = await requirePermission("run_intelligence");
  if ("error" in auth) return auth.error;

  const startTime = Date.now();
  try {
    const { company_id, domain, force_refresh } = await req.json() as {
      company_id: string;
      domain?: string;
      force_refresh?: boolean;
    };

    const sb = supabaseAdmin();
    const { data: company } = await sb.from("companies").select("*").eq("id", company_id).maybeSingle();
    if (!company) return NextResponse.json({ error: "Company not found" }, { status: 404 });

    const targetDomain = domain ?? extractDomain(company.website ?? "");
    if (!targetDomain) return NextResponse.json({ error: "No domain available to scrape" }, { status: 400 });

    // ── Try Playwright first, fallback to fetch ───────────────────────
    let scraped: ScrapedData;
    let scrapeMethod = "fetch";

    try {
      const playwrightAvailable = await checkPlaywright();
      if (playwrightAvailable) {
        scraped = await scrapeWithPlaywright(targetDomain);
        scrapeMethod = "playwright";
        logger.info("Playwright scrape success", { domain: targetDomain });
      } else {
        scraped = await scrapeWithFetch(targetDomain);
        scrapeMethod = "fetch";
      }
    } catch (e) {
      logger.warn("Primary scrape failed, trying fetch fallback", { domain: targetDomain, error: String(e) });
      scraped = await scrapeWithFetch(targetDomain);
      scrapeMethod = "fetch_fallback";
    }

    // ── AI Competitor Discovery ────────────────────────────────────────
    const competitorPrompt = buildCompetitorPrompt(company, targetDomain, scraped);
    const competitorResult = await invokeClaude({
      messages: [{ role: "user", content: competitorPrompt }],
      maxTokens: 2000,
      temperature: 0.3,
    });
    let competitorData: Record<string, unknown> = {};
    try {
      const m = competitorResult.text.match(/\{[\s\S]*\}/);
      if (m) competitorData = JSON.parse(m[0]);
    } catch { /* */ }

    // ── Full AI Enrichment ────────────────────────────────────────────
    const enrichmentPrompt = buildEnrichmentPrompt(company, targetDomain, scraped);
    const enrichmentResult = await invokeClaude({
      messages: [{ role: "user", content: enrichmentPrompt }],
      maxTokens: 3000,
      temperature: 0.4,
    });
    let enrichedData: Record<string, unknown> = {};
    try {
      const m = enrichmentResult.text.match(/\{[\s\S]*\}/);
      if (m) enrichedData = JSON.parse(m[0]);
    } catch { /* */ }

    // ── Auto-labeling ─────────────────────────────────────────────────
    const autoLabels = autoLabel(company as Record<string,string>, scraped, enrichedData);

    // ── Scrape Scoring ────────────────────────────────────────────────
    const scrapeScore = {
      confidence: scraped.hasContent ? (scrapeMethod === "playwright" ? 0.92 : 0.72) : 0.35,
      render_quality: scrapeMethod === "playwright" ? "full_js" : "static_html",
      extraction_completeness: calculateCompleteness(scraped),
      js_rendered: scrapeMethod === "playwright",
      method: scrapeMethod,
    };

    // ── Persist ───────────────────────────────────────────────────────
    const { data: existingCo } = await sb.from("companies").select("full_intelligence").eq("id", company_id).maybeSingle();
    const existingIntel = (existingCo?.full_intelligence ?? {}) as Record<string, unknown>;

    const scrapeHistory = [
      ...(((existingIntel.scrape_history ?? []) as Array<Record<string, unknown>>).slice(0, 4)),
      {
        scraped_at: new Date().toISOString(),
        domain: targetDomain,
        method: scrapeMethod,
        confidence: scrapeScore.confidence,
        title: scraped.title,
      },
    ];

    const intelligencePayload: Record<string, unknown> = {
      ...enrichedData,
      competitors: competitorData.competitors ?? [],
      related_companies: competitorData.related_companies ?? [],
      sponsorship_profile: competitorData.sponsorship_profile ?? {},
      scrape_metadata: {
        domain: targetDomain,
        scraped_at: new Date().toISOString(),
        title: scraped.title,
        meta_description: scraped.metaDescription,
        keywords: scraped.keywords,
        social_links: scraped.socialLinks,
        tech_signals: scraped.techSignals,
        navigation_items: scraped.navigationItems,
        cta_texts: scraped.ctaTexts,
        campaign_mentions: scraped.campaignMentions,
        sponsorship_mentions: scraped.sponsorshipMentions,
        screenshot_url: scraped.screenshotUrl,
        hero_text: scraped.heroText,
        pricing_signals: scraped.pricingSignals,
        method: scrapeMethod,
      },
      scrape_score: scrapeScore,
      scrape_history: scrapeHistory,
    };

    await sb.from("companies").update({
      intelligence: intelligencePayload,
      full_intelligence: intelligencePayload,
      segment: autoLabels.segment ?? (company as Record<string,string>).segment,
      company_size: autoLabels.size ?? (company as Record<string,string>).company_size,
      business_type: autoLabels.business_type ?? (company as Record<string,string>).business_type,
    }).eq("id", company_id);

    await recordAudit({
      action: "company.intelligence_scraped",
      entity_type: "company",
      entity_id: company_id,
      metadata: {
        domain: targetDomain,
        method: scrapeMethod,
        fit_score: enrichedData.coritiba_fit_score,
        competitors_found: (competitorData.competitors as unknown[])?.length ?? 0,
        duration_ms: Date.now() - startTime,
      },
    });

    logger.info("Intelligence scrape completed", {
      company_id,
      domain: targetDomain,
      method: scrapeMethod,
      duration_ms: Date.now() - startTime,
    });

    return NextResponse.json({
      success: true,
      intelligence: intelligencePayload,
      auto_labels: autoLabels,
      scrape_score: scrapeScore,
      scrape_metadata: intelligencePayload.scrape_metadata,
    });

  } catch (err) {
    logger.apiError("/api/intelligence/scrape", err);
    return NextResponse.json({ error: err instanceof Error ? err.message : "Scrape failed" }, { status: 500 });
  }
}

// ── Playwright scraper ────────────────────────────────────────────────────────
async function checkPlaywright(): Promise<boolean> {
  try {
    // Dynamic import to avoid build-time errors if not installed
    await import("playwright");
    return true;
  } catch {
    return false;
  }
}

async function scrapeWithPlaywright(domain: string): Promise<ScrapedData> {
  const { chromium } = await import("playwright");
  const browser = await chromium.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"],
  });

  const context = await browser.newContext({
    userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36",
    viewport: { width: 1440, height: 900 },
    locale: "pt-BR",
  });

  const page = await context.newPage();
  let screenshotBase64: string | null = null;

  try {
    const url = domain.startsWith("http") ? domain : `https://${domain}`;
    await page.goto(url, { waitUntil: "networkidle", timeout: 20000 });

    // Wait for main content
    await page.waitForTimeout(2000);

    // Take screenshot
    try {
      const screenshot = await page.screenshot({ type: "jpeg", quality: 60, clip: { x: 0, y: 0, width: 1440, height: 800 } });
      screenshotBase64 = `data:image/jpeg;base64,${screenshot.toString("base64")}`;
    } catch { /* skip screenshot */ }

    const title = await page.title();
    const metaDescription = await page.$eval('meta[name="description"]', (el) => (el as HTMLMetaElement).content).catch(() => "");
    const ogDescription = await page.$eval('meta[property="og:description"]', (el) => (el as HTMLMetaElement).content).catch(() => "");

    // Extract navigation structure
    const navigationItems = await page.$$eval("nav a, header a", (els) =>
      els.slice(0, 20).map((el) => (el as HTMLAnchorElement).textContent?.trim() ?? "").filter(Boolean)
    ).catch(() => [] as string[]);

    // Extract hero/above-fold text
    const heroText = await page.$$eval("h1, h2, .hero, [class*='hero'], [class*='banner']", (els) =>
      els.slice(0, 5).map((el) => el.textContent?.trim() ?? "").filter(Boolean).join(" | ")
    ).catch(() => "");

    // Extract CTAs
    const ctaTexts = await page.$$eval("button, .cta, [class*='cta'], a.btn, a[class*='button']", (els) =>
      [...new Set(els.slice(0, 15).map((el) => el.textContent?.trim() ?? "").filter(Boolean))]
    ).catch(() => [] as string[]);

    // Extract all visible text (limited)
    const textContent = await page.evaluate(() => document.body.innerText.slice(0, 3000)).catch(() => "");

    // Detect sponsorship/partnership language
    const sponsorshipMentions = extractSponsorshipMentions(textContent);
    const campaignMentions = extractCampaignMentions(textContent);
    const pricingSignals = extractPricingSignals(textContent);
    const socialLinks = await extractSocialLinksPlaywright(page);
    const techSignals = await detectTechStackPlaywright(page);

    const keywords = extractKeywordsFromText(title + " " + metaDescription + " " + heroText);

    return {
      title,
      metaDescription: metaDescription || ogDescription,
      keywords,
      socialLinks,
      techSignals,
      textPreview: textContent.slice(0, 2000),
      heroText,
      navigationItems,
      ctaTexts,
      sponsorshipMentions,
      campaignMentions,
      pricingSignals,
      screenshotUrl: screenshotBase64,
      hasContent: textContent.length > 200,
    };
  } finally {
    await browser.close();
  }
}

async function extractSocialLinksPlaywright(page: import("playwright").Page): Promise<string[]> {
  try {
    const links = await page.$$eval("a[href]", (els) =>
      els.map((el) => (el as HTMLAnchorElement).href).filter(Boolean)
    );
    const found: string[] = [];
    const patterns: Record<string, RegExp> = {
      linkedin: /linkedin\.com\/company/i,
      instagram: /instagram\.com/i,
      youtube: /youtube\.com/i,
      facebook: /facebook\.com/i,
      twitter: /twitter\.com|x\.com/i,
    };
    for (const [name, re] of Object.entries(patterns)) {
      if (links.some((l) => re.test(l))) found.push(name);
    }
    return found;
  } catch { return []; }
}

async function detectTechStackPlaywright(page: import("playwright").Page): Promise<string[]> {
  try {
    const html = await page.content();
    return detectTechFromHtml(html);
  } catch { return []; }
}

// ── Fetch scraper fallback ─────────────────────────────────────────────────
async function scrapeWithFetch(domain: string): Promise<ScrapedData> {
  const urls = [`https://${domain}`, `https://www.${domain}`, `http://${domain}`];
  let html = "";
  for (const url of urls) {
    try {
      const res = await fetch(url, {
        signal: AbortSignal.timeout(8000),
        headers: { "User-Agent": "Mozilla/5.0 (compatible; CommercialBot/2.0)" },
      });
      if (res.ok) { html = await res.text(); break; }
    } catch { continue; }
  }

  const title = html.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1]?.trim() ?? "";
  const metaDesc = html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i)?.[1]?.trim() ?? "";
  const ogDesc = html.match(/<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']+)["']/i)?.[1]?.trim() ?? "";
  const heroText = html.match(/<h1[^>]*>([^<]+)<\/h1>/i)?.[1]?.trim() ?? "";

  const textPreview = html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .slice(0, 2000)
    .trim();

  const navMatch = html.match(/<nav[^>]*>([\s\S]*?)<\/nav>/i)?.[1] ?? "";
  const navigationItems = [...(navMatch.matchAll(/>([^<]{3,40})</g) ?? [])].slice(0, 15).map((m) => m[1].trim()).filter(Boolean);

  return {
    title,
    metaDescription: metaDesc || ogDesc,
    keywords: extractKeywordsFromText(title + " " + (metaDesc || ogDesc)),
    socialLinks: extractSocialLinksFromHtml(html),
    techSignals: detectTechFromHtml(html),
    textPreview,
    heroText,
    navigationItems,
    ctaTexts: [],
    sponsorshipMentions: extractSponsorshipMentions(textPreview),
    campaignMentions: extractCampaignMentions(textPreview),
    pricingSignals: extractPricingSignals(textPreview),
    screenshotUrl: null,
    hasContent: html.length > 500,
  };
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function extractKeywordsFromText(text: string): string[] {
  const words = text.toLowerCase().match(/\b[a-záàâãéèêíïóôõöúùûüç]{4,}\b/g) ?? [];
  const stops = new Set(["para","como","mais","uma","que","não","com","por","seu","sua","nos","nas","dos","das","este","esta","são","será","foi","quando","sobre"]);
  const freq: Record<string, number> = {};
  for (const w of words) { if (!stops.has(w)) freq[w] = (freq[w] ?? 0) + 1; }
  return Object.entries(freq).sort((a, b) => b[1] - a[1]).slice(0, 20).map((e) => e[0]);
}

function extractSocialLinksFromHtml(html: string): string[] {
  const found: string[] = [];
  const p: Record<string, RegExp> = { linkedin: /linkedin\.com\/company/i, instagram: /instagram\.com/i, youtube: /youtube\.com/i, facebook: /facebook\.com/i, twitter: /twitter\.com|x\.com/i };
  for (const [name, re] of Object.entries(p)) { if (re.test(html)) found.push(name); }
  return found;
}

function detectTechFromHtml(html: string): string[] {
  const s: string[] = [];
  if (/react|__NEXT_DATA__/i.test(html)) s.push("React/Next.js");
  if (/shopify/i.test(html)) s.push("Shopify");
  if (/wordpress|wp-content/i.test(html)) s.push("WordPress");
  if (/google-analytics|gtag|GA4/i.test(html)) s.push("Google Analytics");
  if (/hubspot/i.test(html)) s.push("HubSpot");
  if (/salesforce/i.test(html)) s.push("Salesforce");
  if (/vtex/i.test(html)) s.push("VTEX");
  if (/rd station|rdstation/i.test(html)) s.push("RD Station");
  if (/mailchimp/i.test(html)) s.push("Mailchimp");
  return s;
}

function extractSponsorshipMentions(text: string): string[] {
  const patterns = [/patroc[íi]ni/gi, /sponsor/gi, /parceria/gi, /partnership/gi, /apoio/gi, /apoiador/gi, /colabora[cç][aã]o/gi, /brand activation/gi];
  const found: string[] = [];
  for (const re of patterns) {
    const matches = text.match(re);
    if (matches) found.push(...matches.map((m) => m.toLowerCase()));
  }
  return [...new Set(found)].slice(0, 10);
}

function extractCampaignMentions(text: string): string[] {
  const patterns = [/campanha/gi, /promocao|promoção/gi, /oferta/gi, /desconto/gi, /sorteio/gi, /concurso/gi, /evento/gi];
  const found: string[] = [];
  for (const re of patterns) {
    const m = text.match(re);
    if (m) found.push(...m.map((x) => x.toLowerCase()));
  }
  return [...new Set(found)].slice(0, 10);
}

function extractPricingSignals(text: string): string[] {
  const matches = text.match(/R\$[\d.,]+|\bpreço\b|\bplano\b|\bassinar\b|\bmensalidade\b|\bcontrato\b|\borcamento|orçamento/gi) ?? [];
  return [...new Set(matches.map((m) => m.toLowerCase()))].slice(0, 8);
}

function calculateCompleteness(s: ScrapedData): number {
  let score = 0;
  if (s.title) score += 0.2;
  if (s.metaDescription) score += 0.15;
  if (s.heroText) score += 0.15;
  if (s.keywords.length > 5) score += 0.1;
  if (s.socialLinks.length > 0) score += 0.1;
  if (s.navigationItems.length > 3) score += 0.1;
  if (s.sponsorshipMentions.length > 0) score += 0.1;
  if (s.techSignals.length > 0) score += 0.05;
  if (s.screenshotUrl) score += 0.05;
  return Math.min(score, 1);
}

function extractDomain(input: string): string | null {
  if (!input) return null;
  try {
    const url = input.startsWith("http") ? input : `https://${input}`;
    return new URL(url).hostname.replace("www.", "");
  } catch { return null; }
}

function autoLabel(company: Record<string, string>, scraped: ScrapedData, intelligence: Record<string, unknown>) {
  const text = (scraped.textPreview + scraped.keywords.join(" ") + scraped.heroText).toLowerCase();
  const geo = String(intelligence.geographic_reach ?? "");
  let segment = company.segment;
  if (!segment) {
    if (/global|worldwide|international|multinational/i.test(text + geo)) segment = "international";
    else if (/nacional|national|brazil|brasil|todo.*brasil/i.test(text + geo)) segment = "national";
    else if (/paraná|curitiba|regional/i.test(text)) segment = "regional";
    else segment = "local";
  }
  let size = company.company_size;
  if (!size) {
    if (/\b(million|bilhão|billion|milhares|grande porte)\b/i.test(text)) size = "large";
    else if (/\b(centena|hundreds|regional|filiais|médio porte)\b/i.test(text)) size = "medium";
    else size = "small";
  }
  let business_type = company.business_type;
  if (!business_type) {
    const b2b = /\b(b2b|corporate|empresas|solution|platform|software|saas|enterprise|corporativo)\b/i.test(text);
    const b2c = /\b(consumer|varejo|retail|shopping|cliente|loja|consumidor)\b/i.test(text);
    business_type = b2b && b2c ? "B2B+B2C" : b2b ? "B2B" : "B2C";
  }
  return { segment, size, business_type };
}

function buildCompetitorPrompt(company: Record<string, unknown>, domain: string, scraped: ScrapedData): string {
  return `You are a business intelligence analyst for Coritiba FC.
Company: ${String(company.company_name ?? "")}
Industry: ${String(company.industry ?? "Unknown")}
Website: ${domain}
Hero text: ${scraped.heroText}
Meta: ${scraped.metaDescription}
Keywords: ${scraped.keywords.slice(0, 10).join(", ")}
Sponsorship mentions: ${scraped.sponsorshipMentions.join(", ") || "None"}

Identify 5-8 DIRECT COMPETITOR companies (NOT football clubs). Return JSON only:
{
  "competitors": [{"name": "Company", "reason": "...", "estimated_spend": "R$X/year", "website": "domain.com", "sponsorship_active": true}],
  "related_companies": [{"name": "Name", "relationship": "partner/supplier/adjacent"}],
  "sponsorship_profile": {"likelihood_score": 8.5, "estimated_budget_range": "R$X–Y/year", "best_contact_approach": "..."}
}`;
}

function buildEnrichmentPrompt(company: Record<string, unknown>, domain: string, scraped: ScrapedData): string {
  return `You are Coritiba FC's commercial intelligence analyst. CRITICAL: NEVER mention Athletico Paranaense, Corinthians, Flamengo, Palmeiras, São Paulo FC, Grêmio, Internacional or any competitor club.

Company: ${String(company.company_name ?? "")}
Domain: ${domain}
Title: ${scraped.title}
Description: ${scraped.metaDescription}
Hero: ${scraped.heroText}
Navigation: ${scraped.navigationItems.join(", ")}
CTAs: ${scraped.ctaTexts.join(", ")}
Sponsorship mentions: ${scraped.sponsorshipMentions.join(", ")}
Campaign mentions: ${scraped.campaignMentions.join(", ")}
Tech stack: ${scraped.techSignals.join(", ")}
Social: ${scraped.socialLinks.join(", ")}
Keywords: ${scraped.keywords.slice(0, 12).join(", ")}

Return JSON ONLY:
{
  "products_services": "...",
  "target_audience": "...",
  "marketing_goals": ["goal1","goal2","goal3"],
  "brand_positioning": "...",
  "digital_presence": "Strong/Medium/Weak — reason",
  "sponsorship_history": "...",
  "geographic_reach": "Local/State/National/International",
  "growth_signals": "Growing/Stable/Declining — evidence",
  "coritiba_fit_score": 8.2,
  "coritiba_fit_rationale": "...",
  "recommended_inventory": ["jersey_chest","led_board"],
  "recommended_strategies": ["fan_engagement"],
  "key_messages": ["message1","message2"],
  "objection_handling": ["objection — counter"],
  "local_context": "Curitiba/Paraná context",
  "best_contact_timing": "Q2 2026 — budget planning",
  "esg_alignment": "...",
  "activation_concepts": ["concept1","concept2"]
}`;
}

type ScrapedData = {
  title: string;
  metaDescription: string;
  keywords: string[];
  socialLinks: string[];
  techSignals: string[];
  textPreview: string;
  heroText: string;
  navigationItems: string[];
  ctaTexts: string[];
  sponsorshipMentions: string[];
  campaignMentions: string[];
  pricingSignals: string[];
  screenshotUrl: string | null;
  hasContent: boolean;
};
