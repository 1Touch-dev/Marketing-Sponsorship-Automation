import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { fetchAndStoreCompanyLogo } from "@/lib/companies/logo-enrichment";
import { recordAudit } from "@/lib/audit/log";

export const runtime = "nodejs";
export const maxDuration = 120;

const MAX_BATCH = 300;
const CONCURRENCY = 5;

interface BulkLogoResult {
  company_id: string;
  company_name: string;
  status: "fetched" | "skipped" | "failed";
  source?: string | null;
}

/**
 * POST /api/companies/bulk-logo-fetch
 *
 * Body:
 *   company_ids?: string[]   — explicit list (from a filtered /companies view)
 *   only_missing?: boolean   — when no company_ids given, target companies
 *                              with no logo_url yet (default true)
 *   force_refresh?: boolean  — re-fetch even if a logo already exists
 *   limit?: number           — cap when scanning all companies (default 200)
 *
 * Runs with a small concurrency pool so we don't hammer logo.dev/Clearbit.
 */
export async function POST(req: Request) {
  const sb = supabaseAdmin();
  const {
    company_ids,
    only_missing = true,
    force_refresh = false,
    limit = 200,
  } = (await req.json().catch(() => ({}))) as {
    company_ids?: string[];
    only_missing?: boolean;
    force_refresh?: boolean;
    limit?: number;
  };

  let targets: Array<{ id: string; company_name: string; website: string | null }> = [];

  if (company_ids?.length) {
    const { data } = await sb
      .from("companies")
      .select("id, company_name, website")
      .in("id", company_ids.slice(0, MAX_BATCH));
    targets = data ?? [];
  } else {
    let query = sb
      .from("companies")
      .select("id, company_name, website")
      .neq("status", "closed")
      .limit(Math.min(limit, MAX_BATCH));
    if (only_missing && !force_refresh) {
      query = query.is("logo_url", null);
    }
    const { data } = await query;
    targets = data ?? [];
  }

  if (targets.length === 0) {
    return NextResponse.json({ processed: 0, fetched: 0, skipped: 0, failed: 0, results: [] as BulkLogoResult[] });
  }

  const results: BulkLogoResult[] = [];
  let cursor = 0;

  async function worker() {
    while (cursor < targets.length) {
      const idx = cursor++;
      const company = targets[idx];
      try {
        const r = await fetchAndStoreCompanyLogo({
          companyId: company.id,
          website: company.website,
          companyName: company.company_name,
          forceRefresh: force_refresh,
        });
        results.push({
          company_id: company.id,
          company_name: company.company_name,
          status: r.skipped ? "skipped" : r.logoUrl ? "fetched" : "failed",
          source: r.source,
        });
      } catch {
        results.push({ company_id: company.id, company_name: company.company_name, status: "failed" });
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, targets.length) }, worker));

  const fetched = results.filter((r) => r.status === "fetched").length;
  const skipped = results.filter((r) => r.status === "skipped").length;
  const failed = results.filter((r) => r.status === "failed").length;

  await recordAudit({
    entity_type: "company",
    entity_id: null,
    action: "company.bulk_logo_fetch",
    metadata: { processed: results.length, fetched, skipped, failed, force_refresh },
  });

  return NextResponse.json({ processed: results.length, fetched, skipped, failed, results });
}
