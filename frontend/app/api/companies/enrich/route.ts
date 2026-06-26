import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";

export async function POST(req: NextRequest) {
  const { companyId, website, companyName } = await req.json() as {
    companyId?: string;
    website?: string;
    companyName?: string;
  };

  if (!companyId) {
    return NextResponse.json({ error: "companyId required" }, { status: 400 });
  }

  const sb = supabaseAdmin();

  // Extract domain from website
  let domain = "";
  if (website) {
    try {
      const url = new URL(website.startsWith("http") ? website : `https://${website}`);
      domain = url.hostname.replace(/^www\./, "");
    } catch {
      domain = website.replace(/^(https?:\/\/)?(www\.)?/, "").split("/")[0];
    }
  }

  // Try logo.dev free API
  let logoUrl: string | null = null;
  if (domain) {
    const logoDevUrl = `https://img.logo.dev/${domain}?token=pk_X-1ZO13GSgeOoUrIuJ6BeA&size=128&format=png`;
    // Verify logo exists — logo.dev returns a 1x1 placeholder (68 bytes) for unknown domains
    try {
      const check = await fetch(logoDevUrl, { method: "HEAD" });
      if (check.ok && check.headers.get("content-length") !== "68") {
        logoUrl = logoDevUrl;
      }
    } catch {
      // ignore network errors
    }
  }

  // Update company with logo if found
  const updates: Record<string, unknown> = {};
  if (logoUrl) updates.logo_url = logoUrl;

  if (Object.keys(updates).length > 0) {
    await sb.from("companies").update(updates).eq("id", companyId);
  }

  void companyName; // acknowledged but not used — kept for future enrichment steps

  return NextResponse.json({ ok: true, logoUrl, domain });
}
