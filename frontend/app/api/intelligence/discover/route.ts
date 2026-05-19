/**
 * POST /api/intelligence/discover
 * Runs autonomous competitor discovery using Apify + AI.
 * Supports background queuing for long-running jobs.
 */

import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { discoverCompetitors } from "@/lib/intelligence/competitor-engine";
import { readIntelCache, writeIntelCache } from "@/lib/intelligence/cache";
import { enqueueJob } from "@/lib/jobs/queue";
import { recordAudit } from "@/lib/audit/log";
import { logger } from "@/lib/monitoring/logger";
import type { CompetitorDiscoveryResult } from "@/lib/intelligence/competitor-engine";

export const maxDuration = 90;
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const startTime = Date.now();
  try {
    const { company_id, force_refresh, background } = await req.json() as {
      company_id: string;
      force_refresh?: boolean;
      background?: boolean;
    };

    const sb = supabaseAdmin();
    const { data: company } = await sb.from("companies").select("*").eq("id", company_id).maybeSingle();
    if (!company) return NextResponse.json({ error: "Company not found" }, { status: 404 });

    // Cache check
    if (!force_refresh) {
      const cached = await readIntelCache<CompetitorDiscoveryResult>(company_id, "competitor_discovery");
      if (cached) {
        return NextResponse.json({ success: true, from_cache: true, ...cached });
      }
    }

    // Background mode — queue and return immediately
    if (background) {
      const jobId = await enqueueJob("intelligence_scrape", { company_id, action: "competitor_discovery" });

      // Fire async (no await)
      void runDiscoveryAndPersist(company as CompanyRow, null);

      return NextResponse.json({
        success: true,
        queued: true,
        job_id: jobId,
        message: "Discovery queued — check back in 30-60 seconds",
      });
    }

    // Foreground mode — run now
    const result = await runDiscoveryAndPersist(company as CompanyRow, null);

    logger.info("Competitor discovery API completed", {
      company_id,
      competitors_found: result.competitors.length,
      duration_ms: Date.now() - startTime,
    });

    return NextResponse.json({ success: true, from_cache: false, ...result });
  } catch (err) {
    logger.apiError("/api/intelligence/discover", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Discovery failed" },
      { status: 500 }
    );
  }
}

async function runDiscoveryAndPersist(company: CompanyRow, jobId: string | null): Promise<CompetitorDiscoveryResult> {
  try {
    const result = await discoverCompetitors({
      id: company.id,
      name: company.company_name,
      industry: company.industry,
      website: company.website,
      segment: company.segment,
      company_size: company.company_size,
      business_type: company.business_type,
      full_intelligence: company.full_intelligence as Record<string, unknown> | null,
    });

    // Persist results
    await writeIntelCache(company.id, "competitor_discovery", result);

    // Update top-level fields for easy access
    const sb = supabaseAdmin();
    const { data: existing } = await sb.from("companies").select("full_intelligence").eq("id", company.id).maybeSingle();
    const currentIntel = (existing?.full_intelligence ?? {}) as Record<string, unknown>;

    await sb.from("companies").update({
      full_intelligence: {
        ...currentIntel,
        competitors: result.competitors,
        market_categories: result.market_categories,
        keyword_clusters: result.keyword_clusters,
        sponsorship_landscape: result.sponsorship_landscape,
        industry_graph: result.industry_graph,
        coritiba_positioning: result.coritiba_positioning,
        competitor_discovery: { data: result, cached_at: new Date().toISOString(), ttl_ms: 7 * 24 * 60 * 60 * 1000 },
        last_discovery_at: new Date().toISOString(),
        discovery_method: result.apify_used ? "apify+claude" : "claude_only",
      },
    }).eq("id", company.id);

    await recordAudit({
      action: "company.competitor_discovery_completed",
      entity_type: "company",
      entity_id: company.id,
      metadata: {
        competitors_found: result.competitors.length,
        apify_used: result.apify_used,
        queries_run: result.queries_executed,
      },
    });

    if (jobId) logger.info("Job completed", { job_id: jobId });
    return result;
  } catch (err) {
    if (jobId) logger.error("Job failed", { job_id: jobId });
    throw err;
  }
}

type CompanyRow = {
  id: string;
  company_name: string;
  industry?: string | null;
  website?: string | null;
  segment?: string | null;
  company_size?: string | null;
  business_type?: string | null;
  full_intelligence?: unknown;
};
