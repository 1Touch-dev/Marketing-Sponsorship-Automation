/**
 * POST /api/intelligence/enrich
 * Enriches a company with:
 *   1. Domain resolution fallback chain (website → Apollo → CRM contacts → Hunter)
 *   2. Hunter.io — decision maker emails + contacts
 *   3. Apollo.io — company intelligence (org enrich, dept headcount, funding)
 *   4. LinkedIn scrape via Apify — org info, leadership, posts
 *   5. Ad signals via Apify SERP — active campaigns, spend level
 *   6. Social presence score
 *
 * Works even when companies.website is empty — domain is resolved automatically.
 * Persists results to companies.full_intelligence.enrichment and updates
 * companies.domain / domain_source when a better domain is discovered.
 */

import { NextResponse } from "next/server";
import { supabaseAdmin, supabaseServer } from "@/lib/supabase/server";
import { searchDomain, checkHunterHealth } from "@/lib/intelligence/hunter";
import { enrichCompanyApollo, checkApolloHealth } from "@/lib/intelligence/apollo";
import { enrichCompanySocial } from "@/lib/intelligence/social-scraper";
import { resolveCompanyDomain } from "@/lib/intelligence/domain-resolution";
import { recordAudit } from "@/lib/audit/log";
import { logger } from "@/lib/monitoring/logger";

export const maxDuration = 90;

export async function POST(req: Request) {
  const startTime = Date.now();

  try {
    const { data: { user } } = await supabaseServer().auth.getUser().catch(() => ({ data: { user: null } }));
    const {
      company_id,
      include_hunter = true,
      include_apollo = true,
      include_social = true,
    } = await req.json() as {
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
      .select("id, company_name, website, industry, country, full_intelligence")
      .eq("id", company_id)
      .maybeSingle();

    if (!company) {
      return NextResponse.json({ error: "Company not found" }, { status: 404 });
    }

    // ── Step 1: Resolve domain via fallback chain ──────────────────────────
    const domainResolution = await resolveCompanyDomain({
      id: company.id,
      company_name: company.company_name,
      website: company.website,
      country: company.country,
    });

    const domain = domainResolution.final_domain ?? "";

    logger.info("Starting company enrichment", {
      company: company.company_name,
      domain: domain || "(no domain — all resolution steps failed)",
      domain_source: domainResolution.source,
      include_hunter,
      include_apollo,
      include_social,
    });

    // ── Step 2: If we discovered a better domain, update company record ───
    const storedDomain = extractDomain(company.website ?? "");
    if (domain && domain !== storedDomain) {
      const domainUpdates: Record<string, unknown> = {
        domain_source: domainResolution.source,
        domain_updated_at: new Date().toISOString(),
      };
      // If company has no website at all, write discovered domain as website too
      if (!company.website && domain) {
        domainUpdates.website = `https://${domain}`;
      }
      // Write to domain columns if they exist (migration 0022); ignore if columns absent
      try {
        await sb
          .from("companies")
          .update(domainUpdates)
          .eq("id", company_id);
      } catch {
        // non-fatal — migration may not be applied yet
      }
    }

    const results: EnrichmentResult = {
      hunter: null,
      apollo: null,
      social: null,
      enriched_at: new Date().toISOString(),
      domain,
      domain_resolution: domainResolution,
    };

    // ── Step 3: Run Hunter, Apollo, and social in parallel ─────────────────
    const tasks: Promise<void>[] = [];

    if (include_hunter && domain) {
      tasks.push(
        searchDomain(domain, 10)
          .then((r) => {
            results.hunter = r;
            // Extract domains from discovered emails and store in resolution candidates
            const emailDomains = (r.emails ?? [])
              .map((e) => {
                const parts = e.email.split("@");
                return parts.length === 2 ? parts[1] : null;
              })
              .filter((d): d is string => !!d && d === domain);
            if (emailDomains.length > 0) {
              results.domain_resolution = {
                ...results.domain_resolution,
                source: results.domain_resolution.source ?? "email_inference",
              };
            }
          })
          .catch((err) => {
            logger.warn("Hunter enrichment failed (non-fatal)", { error: String(err) });
            results.hunter_error = err instanceof Error ? err.message : String(err);
          })
      );
    } else if (include_hunter && !domain) {
      results.hunter_error =
        "Domain could not be resolved — Hunter enrichment skipped. All fallback sources (website, Apollo, CRM contacts, Hunter name search) were attempted.";
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
      results.social_error = "Domain not resolved — social enrichment skipped";
    }

    await Promise.all(tasks);

    // ── Step 4: Persist to DB ──────────────────────────────────────────────
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
        domain_source: domainResolution.source,
        resolution_steps: domainResolution.steps.filter((s) => s.tried).map((s) => s.step),
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
      domain,
      domain_source: domainResolution.source,
      hunter_contacts: results.hunter?.emails?.length ?? 0,
      apollo_marketing_team: results.apollo?.organization?.marketing_team_size ?? null,
      duration_ms: Date.now() - startTime,
    });

    return NextResponse.json({
      success: true,
      enrichment: results,
      domain_resolution: domainResolution,
      summary: {
        domain_resolved: !!domain,
        domain,
        domain_source: domainResolution.source,
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

import type { DomainResolutionResult } from "@/lib/intelligence/domain-resolution";

type EnrichmentResult = {
  hunter: Awaited<ReturnType<typeof searchDomain>> | null;
  hunter_error?: string;
  apollo: Awaited<ReturnType<typeof enrichCompanyApollo>> | null;
  apollo_error?: string;
  social: Awaited<ReturnType<typeof enrichCompanySocial>> | null;
  social_error?: string;
  enriched_at: string;
  domain: string;
  domain_resolution: DomainResolutionResult;
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function extractDomain(website: string): string {
  if (!website) return "";
  try {
    const url = website.startsWith("http") ? website : `https://${website}`;
    return new URL(url).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return website.replace(/^https?:\/\/(www\.)?/, "").split("/")[0].toLowerCase();
  }
}
