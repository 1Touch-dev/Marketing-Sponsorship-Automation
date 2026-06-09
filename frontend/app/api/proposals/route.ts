import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";

export const runtime = "nodejs";

/**
 * GET /api/proposals?limit=N&status=approved&company_id=...
 * Returns a paginated list of proposals (public metadata, no content blob).
 */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const limit = Math.min(parseInt(searchParams.get("limit") ?? "20", 10), 100);
  const offset = parseInt(searchParams.get("offset") ?? "0", 10);
  const status = searchParams.get("status");
  const companyId = searchParams.get("company_id");

  const sb = supabaseAdmin();
  let query = sb
    .from("proposals")
    .select("id, title, status, version, company_id, campaign_id, created_at, updated_at, companies(company_name, industry)")
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (status) query = query.eq("status", status);
  if (companyId) query = query.eq("company_id", companyId);

  const { data, error } = await query;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data ?? []);
}
