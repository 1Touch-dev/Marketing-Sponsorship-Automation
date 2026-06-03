/**
 * POST /api/intelligence/enrich
 * Enriches a company with:
 *   1. Hunter.io — decision maker emails + contacts
 *   2. Apollo.io — company intelligence (org enrich, dept headcount, funding)
 *   3. LinkedIn scrape via Apify — org info, leadership, posts
 *   4. Ad signals via Apify SERP — active campaigns, spend level
 *   5. Social presence score
 *
 * Persists results to companies.full_intelligence.enrichment
 */

import { NextResponse } from "next/server";
import { supabaseAdmin, supabaseServer } from "@/lib/supabase/server";
import { searchDomain, checkHunterHealth } from "@/lib/intelligence/hunter";
import { enrichCompanyApollo, checkApolloHealth } from "@/lib/intelligence/apollo";
import { enrichCompanySocial } from "@/lib/intelligence/social-scraper";
import { recordAudit } from "@/lib/audit/log";
import { logger } from "@/lib/monitoring/logger";

export const maxDuration = 90;

export async function POST(req: Request) {
  const startTime = Date.now();

  try {
    const { data: { user } } = await supabaseServer().auth.getUser().catch(() => ({ data: { user: null } }));
    const { company_id, include_hunter = true, include_apollo = true, include_social = true } = await req.json() as {
      company_id: string;
      include_hunter?: boolean;
      include_apollo?: boolean;
      include_social?: boolean;
    };

    if (!company_id) {
      return NextResponse.json({ error: "company_id is required" }, { status: 400 });
    }

    const sb = supabaseAdmin();
    const { data: company } = await sb
      .from("companies")
      .select("id, company_name, website, industry, full_intelligence")
      .eq("id", company_id)
      .maybeSingle();

    if (!company) {
      return NextResponse.json({ error: "Company not found" }, { status: 404 });
    }

    const domain = extractDomain(company.website ?? "");

    logger.info("Starting company enrichment", {
      company: company.company_name,
      domain: domain || "(no domain)",
      include_hunter,
      include_apollo,
      include_social,
    });

    const results: EnrichmentResult = {
      hunter: null,
      apollo: null,
      social: null,
      enriched_at: new Date().toISOString(),
      domain: domain || "",
    };

    // ── Run Hunter, Apollo, and social in parallel ───────────────────────
    const tasks: Promise<void>[] = [];

    if (include_hunter && domain) {
      tasks.push(
        searchDomain(domain, 10)
          .then((r) => { results.hunter = r; })
          .catch((err) => {
            logger.warn("Hunter enrichment failed (non-fatal)", { error: String(err) });
            results.hunter_error = err instanceof Error ? err.message : String(err);
          })
      );
    } else if (include_hunter && !domain) {
      results.hunter_error = "No website/domain — Hunter requires a domain to search";
    }

    if (include_apollo) {
      tasks.push(
        enrichCompanyApollo(domain || company.company_name, company.company_name)
          .then((r) => { results.apollo = r; })
          .catch((err) => {
            logger.warn("Apollo enrichment failed (non-fatal)", { error: String(err) });
            results.apollo_error = err instanceof Error ? err.message : String(err);
          })
      );
    }

    if (include_social && domain) {
      const existingIntel = (company.full_intelligence ?? {}) as Record<string, unknown>;
      const scrapeData = (existingIntel.scrape_metadata as Record<string, unknown>) ?? {};
      tasks.push(
        enrichCompanySocial(company.company_name, domain, scrapeData)
          .then((r) => { results.social = r; })
          .catch((err) => {
            logger.warn("Social enrichment failed (non-fatal)", { error: String(err) });
            results.social_error = err instanceof Error ? err.message : String(err);
          })
      );
    } else if (include_social && !domain) {
      results.social_error = "No website/domain — social enrichment skipped";
    }

    await Promise.all(tasks);

    // ── Persist to DB ─────────────────────────────────────────────────────
    const existing = (company.full_intelligence ?? {}) as Record<string, unknown>;
    const updatedIntelligence = {
      ...existing,
      enrichment: results,
    };

    await sb
      .from("companies")
      .update({ full_intelligence: updatedIntelligence })
      .eq("id", company_id);

    await recordAudit({
      action: "company.enrichment_run",
      entity_type: "company",
      entity_id: company_id,
      performed_by: user?.id ?? null,
      metadata: {
        domain,
        hunter_contacts: results.hunter?.emails?.length ?? 0,
        decision_makers: results.hunter?.decision_makers?.length ?? 0,
        apollo_org: !!results.apollo?.organization,
        apollo_people: results.apollo?.decision_makers?.length ?? 0,
        social_score: results.social?.social?.total_social_score ?? null,
        has_linkedin: !!results.social?.linkedin,
        duration_ms: Date.now() - startTime,
      },
    });

    logger.info("Company enrichment complete", {
      company: company.company_name,
      hunter_contacts: results.hunter?.emails?.length ?? 0,
      apollo_marketing_team: results.apollo?.organization?.marketing_team_size ?? null,
      duration_ms: Date.now() - startTime,
    });

    return NextResponse.json({
      success: true,
      enrichment: results,
      summary: {
        contacts_found: results.hunter?.emails?.length ?? 0,
        decision_makers: results.hunter?.decision_makers?.length ?? 0,
        apollo_org_found: !!results.apollo?.organization,
        apollo_marketing_team_size: results.apollo?.organization?.marketing_team_size ?? null,
        apollo_people_found: results.apollo?.decision_makers?.length ?? 0,
        apollo_people_search_available: results.apollo?.people_search_available ?? false,
        linkedin_found: !!results.social?.linkedin,
        social_score: results.social?.social?.total_social_score ?? 0,
        has_active_ads: results.social?.ads?.has_active_google_ads || results.social?.ads?.has_active_meta_ads,
        ad_spend_signal: results.social?.ads?.estimated_ad_spend_signal ?? "unknown",
      },
    });

  } catch (err) {
    logger.apiError("/api/intelligence/enrich", err instanceof Error ? err : new Error(String(err)));
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Enrichment failed" },
      { status: 500 }
    );
  }
}

// ── GET — check Hunter health / enrichment status ─────────────────────────────
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const company_id = searchParams.get("company_id");

  if (company_id) {
    // Return existing enrichment for company
    const sb = supabaseAdmin();
    const { data: company } = await sb
      .from("companies")
      .select("full_intelligence")
      .eq("id", company_id)
      .maybeSingle();

    const enrichment = (company?.full_intelligence as Record<string, unknown>)?.enrichment ?? null;
    return NextResponse.json({ enrichment });
  }

  const [hunter, apollo] = await Promise.all([checkHunterHealth(), checkApolloHealth()]);
  return NextResponse.json({ hunter, apollo });
}

// ── Types ─────────────────────────────────────────────────────────────────────

type EnrichmentResult = {
  hunter: Awaited<ReturnType<typeof searchDomain>> | null;
  hunter_error?: string;
  apollo: Awaited<ReturnType<typeof enrichCompanyApollo>> | null;
  apollo_error?: string;
  social: Awaited<ReturnType<typeof enrichCompanySocial>> | null;
  social_error?: string;
  enriched_at: string;
  domain: string;
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function extractDomain(website: string): string {
  if (!website) return "";
  try {
    const url = website.startsWith("http") ? website : `https://${website}`;
    return new URL(url).hostname.replace("www.", "");
  } catch {
    return website.replace(/^https?:\/\/(www\.)?/, "").split("/")[0];
  }
}
