import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
export const dynamic = "force-dynamic";
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const companyId = searchParams.get("company_id");
  if (!companyId) return NextResponse.json({ error: "company_id required" }, { status: 400 });
  const sb = supabaseAdmin();
  const { data: company } = await sb.from("companies").select("intelligence, full_intelligence").eq("id", companyId).maybeSingle();
  if (!company) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const intel = (company.full_intelligence ?? company.intelligence ?? {}) as Record<string, unknown>;
  return NextResponse.json({ competitors: intel.competitors ?? [], sponsorship_profile: intel.sponsorship_profile ?? {}, scrape_metadata: intel.scrape_metadata ?? null });
}
