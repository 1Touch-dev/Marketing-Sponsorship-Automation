import { NextRequest, NextResponse } from "next/server";
import { fetchAndStoreCompanyLogo } from "@/lib/companies/logo-enrichment";

/**
 * POST /api/companies/enrich
 * Legacy alias kept for the "Add Company" form's fire-and-forget call.
 * Delegates to the shared resolver (logo.dev 512px + Clearbit/Apollo/favicon
 * fallback) instead of the old logo.dev-only 128px check.
 */
export async function POST(req: NextRequest) {
  const { companyId, website, companyName } = (await req.json()) as {
    companyId?: string;
    website?: string;
    companyName?: string;
  };

  if (!companyId) {
    return NextResponse.json({ error: "companyId required" }, { status: 400 });
  }

  const result = await fetchAndStoreCompanyLogo({
    companyId,
    website,
    companyName,
    forceRefresh: false,
  });

  return NextResponse.json({ ok: true, logoUrl: result.logoUrl, domain: result.domain, source: result.source });
}
