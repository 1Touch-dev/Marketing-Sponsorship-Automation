import { NextResponse } from "next/server";
import { fetchAndStoreCompanyLogo } from "@/lib/companies/logo-enrichment";
import { requirePermission } from "@/lib/auth/server-permission";

export const maxDuration = 30;

/**
 * POST /api/companies/logo
 * Auto-fetch company logo using logo.dev (512px) with Clearbit/Apollo/favicon
 * fallback. Delegates to the shared lib/companies/logo-enrichment resolver so
 * every entry point (create, bulk, product-discovery, this button) is consistent.
 */
export async function POST(req: Request) {
  const auth = await requirePermission("run_intelligence");
  if ("error" in auth) return auth.error;

  try {
    const { company_id, domain, force_refresh } = (await req.json()) as {
      company_id: string;
      domain?: string;
      force_refresh?: boolean;
    };

    if (!company_id) return NextResponse.json({ error: "company_id required" }, { status: 400 });

    const result = await fetchAndStoreCompanyLogo({
      companyId: company_id,
      domain,
      forceRefresh: force_refresh,
    });

    if (!result.logoUrl) {
      return NextResponse.json({ error: "No domain available or no logo found" }, { status: 400 });
    }

    return NextResponse.json({
      logo_url: result.logoUrl,
      source: result.skipped ? "cached" : result.source,
      domain: result.domain,
      company_id,
    });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Logo fetch failed" }, { status: 500 });
  }
}

// GET /api/companies/logo?company_id=xxx — get current logo
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const company_id = searchParams.get("company_id");
  if (!company_id) return NextResponse.json({ error: "company_id required" }, { status: 400 });

  const { supabaseAdmin } = await import("@/lib/supabase/server");
  const sb = supabaseAdmin();
  const { data } = await sb.from("companies").select("id, company_name, logo_url, logo_source, logo_fetched_at").eq("id", company_id).maybeSingle();
  return NextResponse.json({ company: data });
}
