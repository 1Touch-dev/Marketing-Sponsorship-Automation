/**
 * POST /api/intelligence/web-scrape
 * Enhanced website scraper using the full fallback chain:
 * Playwright → Apify website-content-crawler → fetch
 */

import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { scrapeWebsiteWithFallback } from "@/lib/intelligence/website-crawler";
import { invokeClaude } from "@/lib/bedrock/client";
import { recordAudit } from "@/lib/audit/log";
import { logger } from "@/lib/monitoring/logger";

export const maxDuration = 90;
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const startTime = Date.now();
  try {
    const { company_id, url, force_refresh } = await req.json() as {
      company_id: string;
      url?: string;
      force_refresh?: boolean;
    };

    const sb = supabaseAdmin();
    const { data: company } = await sb.from("companies").select("*").eq("id", company_id).maybeSingle();
    if (!company) return NextResponse.json({ error: "Company not found" }, { status: 404 });

    const targetUrl = url ?? (company as Record<string,string>).website ?? "";
    if (!targetUrl) return NextResponse.json({ error: "No URL available" }, { status: 400 });

    // Scrape with full fallback chain
    const scraped = await scrapeWebsiteWithFallback(targetUrl, { useApify: true });

    // AI enrichment from scraped content
    const enrichPrompt = buildEnrichmentPrompt(company as Record<string,string>, scraped);
    const enrichResult = await invokeClaude({
      messages: [{ role: "user", content: enrichPrompt }],
      maxTokens: 2500,
      temperature: 0.3,
    });

    let enriched: Record<string, unknown> = {};
    try {
      const m = enrichResult.text.match(/\{[\s\S]*\}/);
      if (m) enriched = JSON.parse(m[0]);
    } catch { /* */ }

    // Auto-labeling
    const autoLabels = autoLabel(scraped, enriched);

    // Persist
    const { data: existingCo } = await sb.from("companies").select("full_intelligence").eq("id", company_id).maybeSingle();
    const existingIntel = (existingCo?.full_intelligence ?? {}) as Record<string, unknown>;
    const scrapeHistory = [
      ...((existingIntel.scrape_history as Array<Record<string, unknown>> ?? []).slice(0, 4)),
      { scraped_at: scraped.scraped_at, url: targetUrl, method: scraped.scrape_method, completeness: scraped.completeness },
    ];

    const intelligencePayload = {
      ...existingIntel,
      ...enriched,
      scrape_metadata: {
        url: targetUrl,
        scraped_at: scraped.scraped_at,
        title: scraped.title,
        meta_description: scraped.meta_description,
        keywords: scraped.keywords,
        social_links: scraped.social_links,
        tech_signals: scraped.tech_signals,
        navigation: scraped.navigation,
        cta_texts: scraped.cta_texts,
        sponsorship_mentions: scraped.sponsorship_mentions,
        campaign_mentions: scraped.campaign_mentions,
        hero_text: scraped.hero_text,
        pricing_signals: scraped.pricing_signals,
        screenshot_url: scraped.screenshot_url,
        scrape_method: scraped.scrape_method,
        completeness: scraped.completeness,
      },
      scrape_history: scrapeHistory,
    };

    await sb.from("companies").update({
      intelligence: intelligencePayload,
      full_intelligence: intelligencePayload,
      ...(autoLabels.segment ? { segment: autoLabels.segment } : {}),
      ...(autoLabels.size ? { company_size: autoLabels.size } : {}),
      ...(autoLabels.business_type ? { business_type: autoLabels.business_type } : {}),
    } as unknown as Record<string, string>).eq("id", company_id);

    await recordAudit({
      action: "company.web_scraped",
      entity_type: "company",
      entity_id: company_id,
      metadata: { url: targetUrl, method: scraped.scrape_method, completeness: scraped.completeness, duration_ms: Date.now() - startTime },
    });

    return NextResponse.json({
      success: true,
      scrape_method: scraped.scrape_method,
      completeness: scraped.completeness,
      intelligence: intelligencePayload,
      auto_labels: autoLabels,
      scraped_at: scraped.scraped_at,
    });
  } catch (err) {
    logger.apiError("/api/intelligence/web-scrape", err);
    return NextResponse.json({ error: err instanceof Error ? err.message : "Scrape failed" }, { status: 500 });
  }
}

function buildEnrichmentPrompt(company: Record<string, string>, scraped: { title: string; meta_description?: string; hero_text: string; keywords: string[]; sponsorship_mentions: string[]; tech_signals: string[]; social_links: string[]; navigation: string[]; cta_texts: string[] }): string {
  return `You are Coritiba FC's commercial intelligence analyst.
CRITICAL: NEVER mention Athletico Paranaense, Corinthians, Flamengo, Palmeiras, São Paulo FC, or any football club.

Company: ${company.company_name}
URL: ${company.website ?? "unknown"}
Title: ${scraped.title}
Description: ${scraped.meta_description ?? ""}
Hero: ${scraped.hero_text}
Keywords: ${scraped.keywords.slice(0, 12).join(", ")}
CTAs: ${scraped.cta_texts.join(", ")}
Sponsorship mentions: ${scraped.sponsorship_mentions.join(", ")}
Tech: ${scraped.tech_signals.join(", ")}
Social: ${scraped.social_links.join(", ")}
Navigation: ${scraped.navigation.slice(0, 10).join(", ")}

Return JSON ONLY:
{
  "products_services": "...",
  "target_audience": "...",
  "marketing_goals": ["goal1", "goal2"],
  "brand_positioning": "...",
  "digital_presence": "Strong/Medium/Weak — reason",
  "geographic_reach": "Local/State/National/International",
  "growth_signals": "Growing/Stable/Declining",
  "coritiba_fit_score": 8.2,
  "coritiba_fit_rationale": "...",
  "recommended_inventory": ["jersey_chest", "led_board"],
  "recommended_strategies": ["fan_engagement"],
  "activation_concepts": ["concept1", "concept2"],
  "esg_alignment": "...",
  "best_contact_timing": "Q3 2026",
  "objection_handling": ["objection — counter"],
  "key_messages": ["message1", "message2"],
  "local_context": "Curitiba/Paraná context"
}`;
}

function autoLabel(scraped: { keywords: string[]; hero_text: string }, intelligence: Record<string, unknown>) {
  const text = (scraped.keywords.join(" ") + " " + scraped.hero_text).toLowerCase();
  const geo = String(intelligence.geographic_reach ?? "");
  const segment = /global|worldwide|international|multinacional/i.test(text + geo) ? "international" :
    /nacional|national|todo.*brasil/i.test(text + geo) ? "national" :
    /paraná|curitiba|regional/i.test(text) ? "regional" : "local";
  const size = /\b(bilhão|billion|multinacional|grande\s+porte|corporat)\b/i.test(text) ? "large" :
    /\b(centena|médio\s+porte|regional|filiais)\b/i.test(text) ? "medium" : "small";
  const b2b = /\b(b2b|corporate|empresas|solution|platform|saas|enterprise)\b/i.test(text);
  const b2c = /\b(consumer|varejo|retail|shopping|consumidor)\b/i.test(text);
  const business_type = b2b && b2c ? "B2B+B2C" : b2b ? "B2B" : "B2C";
  return { segment, size, business_type };
}
