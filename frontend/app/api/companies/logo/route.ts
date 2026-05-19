import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";

export const maxDuration = 30;

/**
 * POST /api/companies/logo
 * Auto-fetch company logo using logo.dev (free, no key needed for basic use)
 * Fallback: favicon, OpenGraph image
 */
export async function POST(req: Request) {
  try {
    const { company_id, domain, force_refresh } = await req.json() as {
      company_id: string;
      domain?: string;
      force_refresh?: boolean;
    };

    const sb = supabaseAdmin();

    // Get company
    const { data: company } = await sb.from("companies").select("id, company_name, website, logo_url, logo_fetched_at").eq("id", company_id).maybeSingle();
    if (!company) return NextResponse.json({ error: "Company not found" }, { status: 404 });

    // If logo already fetched and not forcing refresh, return existing
    if (company.logo_url && company.logo_fetched_at && !force_refresh) {
      return NextResponse.json({ logo_url: company.logo_url, source: "cached", company_id });
    }

    // Extract domain
    const rawDomain = domain ?? extractDomain(company.website ?? company.company_name);
    if (!rawDomain) return NextResponse.json({ error: "No domain available" }, { status: 400 });

    // Strategy 1: logo.dev — returns PNG via CDN URL (free tier, no API key for img)
    const logoDevUrl = `https://img.logo.dev/${rawDomain}?format=png&size=128`;

    // Strategy 2: Clearbit (deprecated but still works)
    const clearbitUrl = `https://logo.clearbit.com/${rawDomain}`;

    // Strategy 3: favicon via Google
    const faviconUrl = `https://www.google.com/s2/favicons?domain=${rawDomain}&sz=128`;

    // Test logo.dev first
    let finalUrl: string | null = null;
    let source = "logo_dev";

    try {
      const testRes = await fetch(logoDevUrl, { method: "HEAD", signal: AbortSignal.timeout(5000) });
      if (testRes.ok && testRes.headers.get("content-type")?.includes("image")) {
        finalUrl = logoDevUrl;
      }
    } catch { /* fallthrough */ }

    // Fallback to clearbit
    if (!finalUrl) {
      try {
        const testRes = await fetch(clearbitUrl, { method: "HEAD", signal: AbortSignal.timeout(5000) });
        if (testRes.ok && testRes.headers.get("content-type")?.includes("image")) {
          finalUrl = clearbitUrl;
          source = "clearbit";
        }
      } catch { /* fallthrough */ }
    }

    // Final fallback: favicon (always works, lower quality)
    if (!finalUrl) {
      finalUrl = faviconUrl;
      source = "favicon";
    }

    // Update company with logo_url
    await sb.from("companies").update({
      logo_url: finalUrl,
      logo_source: source,
      logo_fetched_at: new Date().toISOString(),
    }).eq("id", company_id);

    // Also insert into company_logos table if it exists
    try {
      await sb.from("company_logos" as "companies").insert({
        company_id,
        source,
        original_url: finalUrl,
        stored_url: finalUrl,
        format: "png",
        is_primary: true,
        fetch_status: "fetched",
      } as unknown as Record<string,unknown>);
    } catch { /* table may not exist yet */ }

    return NextResponse.json({ logo_url: finalUrl, source, domain: rawDomain, company_id });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Logo fetch failed" }, { status: 500 });
  }
}

// GET /api/companies/logo?company_id=xxx — get current logo
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const company_id = searchParams.get("company_id");
  if (!company_id) return NextResponse.json({ error: "company_id required" }, { status: 400 });

  const sb = supabaseAdmin();
  const { data } = await sb.from("companies").select("id, company_name, logo_url, logo_source, logo_fetched_at").eq("id", company_id).maybeSingle();
  return NextResponse.json({ company: data });
}

function extractDomain(input: string | null): string | null {
  if (!input) return null;
  try {
    // If it's a URL
    if (input.includes(".")) {
      const url = input.startsWith("http") ? input : `https://${input}`;
      return new URL(url).hostname.replace("www.", "");
    }
  } catch { /* fallthrough */ }
  return null;
}
