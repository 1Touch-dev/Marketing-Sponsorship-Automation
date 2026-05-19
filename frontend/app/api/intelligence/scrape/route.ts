import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { invokeClaude } from "@/lib/bedrock/client";
import { recordAudit } from "@/lib/audit/log";

export const maxDuration = 90;

/**
 * POST /api/intelligence/scrape
 * Scrape a company website and enrich with AI analysis
 */
export async function POST(req: Request) {
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

    // --- STEP 1: Website scraping via lightweight fetch ---
    const scraped = await scrapeWebsite(targetDomain);

    // --- STEP 2: Competitor discovery via AI ---
    const competitorPrompt = `You are a business intelligence analyst for Coritiba FC sponsorship.
Company: ${company.company_name}
Industry: ${company.industry ?? "Unknown"}
Website text preview: ${scraped.textPreview.slice(0, 800)}
Meta description: ${scraped.metaDescription}
Keywords: ${scraped.keywords.join(", ")}

Identify 5-8 DIRECT competitor companies (not clubs) that compete with ${company.company_name} in Brazil.
Also identify 3-5 related sponsorship opportunities.
Return JSON only:
{
  "competitors": [{"name": "Company Name", "reason": "Why they compete", "website": "domain.com", "sponsorship_spend": "estimated"}],
  "related_companies": [{"name": "Name", "relationship": "partner/supplier/adjacent"}],
  "sponsorship_profile": {
    "likelihood_score": 8.5,
    "marketing_maturity": "high/medium/low",
    "estimated_budget_range": "R$X–Y/year",
    "best_contact_approach": "description",
    "timing_recommendation": "Q1/Q2/Q3/Q4 or ongoing"
  }
}`;

    const competitorResult = await invokeClaude({
      messages: [{ role: "user", content: competitorPrompt }],
      maxTokens: 2000,
      temperature: 0.3,
    });

    let competitorData: Record<string, unknown> = {};
    try {
      const jsonMatch = competitorResult.text.match(/\{[\s\S]*\}/);
      if (jsonMatch) competitorData = JSON.parse(jsonMatch[0]);
    } catch { /* fallback */ }

    // --- STEP 3: Full AI enrichment ---
    const enrichmentPrompt = `You are a Coritiba FC commercial intelligence analyst.

Company: ${company.company_name}
Domain: ${targetDomain}
Industry: ${company.industry ?? "Unknown"}
Website signals:
- Title: ${scraped.title}
- Description: ${scraped.metaDescription}
- Keywords: ${scraped.keywords.join(", ")}
- Technology stack signals: ${scraped.techSignals.join(", ")}
- Social links found: ${scraped.socialLinks.join(", ")}
- Content preview: ${scraped.textPreview.slice(0, 600)}

CRITICAL: Do NOT mention Athletico Paranaense, Corinthians, Flamengo, Palmeiras, São Paulo FC, Grêmio, or any Brazilian football club. Only Coritiba FC.

Provide deep intelligence for Coritiba FC sponsorship. Return JSON:
{
  "products_services": "What they sell",
  "target_audience": "Who buys from them",
  "marketing_goals": ["goal1", "goal2", "goal3"],
  "brand_positioning": "How they position",
  "digital_presence": "Strong/Medium/Weak — why",
  "sponsorship_history": "Known sponsorships or None detected",
  "geographic_reach": "Local/State/National/International",
  "growth_signals": "Growing/Stable/Declining — evidence",
  "coritiba_fit_score": 8.2,
  "coritiba_fit_rationale": "Why Coritiba FC specifically",
  "recommended_inventory": ["jersey_chest","led_board","social_media"],
  "recommended_strategies": ["fan_engagement","digital_social"],
  "key_messages": ["message 1 for proposal", "message 2"],
  "objection_handling": ["likely objection 1 and counter", "objection 2"],
  "local_context": "Curitiba/Paraná market context",
  "best_contact_timing": "Q1 2026 — budget planning season"
}`;

    const enrichmentResult = await invokeClaude({
      messages: [{ role: "user", content: enrichmentPrompt }],
      maxTokens: 3000,
      temperature: 0.4,
    });

    let enrichedData: Record<string, unknown> = {};
    try {
      const jsonMatch = enrichmentResult.text.match(/\{[\s\S]*\}/);
      if (jsonMatch) enrichedData = JSON.parse(jsonMatch[0]);
    } catch { /* fallback */ }

    // --- STEP 4: Auto-labeling ---
    const autoLabels = autoLabel(company, scraped, enrichedData);

    // --- STEP 5: Persist to DB ---
    const intelligencePayload = {
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
      },
    };

    await sb.from("companies").update({
      intelligence: intelligencePayload,
      full_intelligence: intelligencePayload,
      segment: autoLabels.segment ?? company.segment,
      company_size: autoLabels.size ?? company.company_size,
      business_type: autoLabels.business_type ?? company.business_type,
    }).eq("id", company_id);

    await recordAudit({
      action: "company.intelligence_scraped",
      entity_type: "company",
      entity_id: company_id,
      metadata: { domain: targetDomain, fit_score: enrichedData.coritiba_fit_score, competitors_found: (competitorData.competitors as unknown[])?.length ?? 0 },
    });

    return NextResponse.json({
      success: true,
      intelligence: intelligencePayload,
      auto_labels: autoLabels,
      scrape_metadata: { domain: targetDomain, title: scraped.title, keywords: scraped.keywords.length },
    });

  } catch (err) {
    console.error("[intelligence/scrape]", err);
    return NextResponse.json({ error: err instanceof Error ? err.message : "Scrape failed" }, { status: 500 });
  }
}

// ── Website scraper (lightweight — no Playwright needed for meta extraction) ─
async function scrapeWebsite(domain: string) {
  const urls = [
    `https://${domain}`,
    `https://www.${domain}`,
    `http://${domain}`,
  ];

  let html = "";
  for (const url of urls) {
    try {
      const res = await fetch(url, {
        signal: AbortSignal.timeout(8000),
        headers: {
          "User-Agent": "Mozilla/5.0 (compatible; MarketingBot/1.0; +https://coritiba.com.br)",
          "Accept": "text/html,application/xhtml+xml",
        },
      });
      if (res.ok) {
        html = await res.text();
        break;
      }
    } catch { continue; }
  }

  // Extract meta data
  const title = html.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1]?.trim() ?? "";
  const metaDesc = html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i)?.[1]?.trim() ??
                   html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+name=["']description["']/i)?.[1]?.trim() ?? "";
  const ogDesc = html.match(/<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']+)["']/i)?.[1]?.trim() ?? "";
  const keywords = extractKeywords(html, title, metaDesc);
  const socialLinks = extractSocialLinks(html);
  const techSignals = detectTechStack(html);

  // Extract clean text (limited)
  const textPreview = html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .slice(0, 2000)
    .trim();

  return {
    title,
    metaDescription: metaDesc || ogDesc,
    keywords,
    socialLinks,
    techSignals,
    textPreview,
    hasContent: html.length > 500,
  };
}

function extractKeywords(html: string, title: string, desc: string): string[] {
  const metaKw = html.match(/<meta[^>]+name=["']keywords["'][^>]+content=["']([^"']+)["']/i)?.[1] ?? "";
  const combined = `${title} ${desc} ${metaKw}`.toLowerCase();
  const words = combined.match(/\b[a-záàâãéèêíïóôõöúùûüç]{4,}\b/g) ?? [];
  const stops = new Set(["para","como","mais","uma","que","não","com","por","seu","sua","nos","nas","dos","das"]);
  const freq: Record<string,number> = {};
  for (const w of words) { if (!stops.has(w)) freq[w] = (freq[w] ?? 0) + 1; }
  return Object.entries(freq).sort((a,b) => b[1]-a[1]).slice(0,15).map(e => e[0]);
}

function extractSocialLinks(html: string): string[] {
  const found: string[] = [];
  const patterns = { linkedin: /linkedin\.com\/company/i, instagram: /instagram\.com/i, youtube: /youtube\.com/i, facebook: /facebook\.com/i };
  for (const [name, re] of Object.entries(patterns)) {
    if (re.test(html)) found.push(name);
  }
  return found;
}

function detectTechStack(html: string): string[] {
  const signals: string[] = [];
  if (/react|__NEXT_DATA__/i.test(html)) signals.push("React/Next.js");
  if (/shopify/i.test(html)) signals.push("Shopify");
  if (/wordpress|wp-content/i.test(html)) signals.push("WordPress");
  if (/google-analytics|gtag/i.test(html)) signals.push("Google Analytics");
  if (/hubspot/i.test(html)) signals.push("HubSpot");
  if (/salesforce/i.test(html)) signals.push("Salesforce");
  if (/vtex/i.test(html)) signals.push("VTEX");
  return signals;
}

function autoLabel(company: Record<string,string>, scraped: { keywords: string[]; textPreview: string }, intelligence: Record<string,unknown>) {
  const text = (scraped.textPreview + scraped.keywords.join(" ")).toLowerCase();
  const geo = intelligence.geographic_reach as string ?? "";

  let segment = company.segment;
  if (!segment) {
    if (/global|worldwide|international|multinational/i.test(text + geo)) segment = "international";
    else if (/nacional|nacional|brazil|brasil|todo.*brasil/i.test(text + geo)) segment = "national";
    else if (/paraná|curitiba|regional/i.test(text)) segment = "regional";
    else segment = "local";
  }

  let size = company.company_size;
  if (!size) {
    const score = intelligence.coritiba_fit_score as number ?? 0;
    if (/\b(million|bilhão|billion|thousands|k funcionários)\b/i.test(text)) size = "large";
    else if (/\b(hundred|centena|regional|filiais)\b/i.test(text)) size = "medium";
    else size = "small";
  }

  let business_type = company.business_type;
  if (!business_type) {
    const b2bSig = /\b(b2b|corporate|empresas|solution|platform|software|saas|enterprise)\b/i.test(text);
    const b2cSig = /\b(consumer|varejo|retail|shopping|cliente|loja)\b/i.test(text);
    if (b2bSig && b2cSig) business_type = "B2B+B2C";
    else if (b2bSig) business_type = "B2B";
    else business_type = "B2C";
  }

  return { segment, size, business_type };
}

function extractDomain(input: string): string | null {
  if (!input) return null;
  try {
    const url = input.startsWith("http") ? input : `https://${input}`;
    return new URL(url).hostname.replace("www.", "");
  } catch { return null; }
}
