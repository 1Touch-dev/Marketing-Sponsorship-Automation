import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { resolveTenantId } from "@/lib/tenants/current";
import { loadSummary } from "@/lib/finance/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Cash, barter and savings, kept apart and never added together (?company_id= for one account): what is
 * proposed, contracted, invoiced and settled for each, what counts as recognised under the current rules,
 * contracts whose total disagrees with the lines behind it, and what is missing. A draft deal is never revenue.
 */
export async function GET(req: Request) {
  const res = await loadSummary(supabaseAdmin(), await resolveTenantId(), { companyId: new URL(req.url).searchParams.get("company_id") });
  if (!res.ok) return NextResponse.json({ error: res.error }, { status: res.status });
  return NextResponse.json(res.value);
}
