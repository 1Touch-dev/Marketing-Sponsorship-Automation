import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { resolveTenantId } from "@/lib/tenants/current";
import { loadCompanyStatuses } from "@/lib/company-status/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Every company that has a contract, with its delivery status and risks (?status= and ?at_risk=true to filter), and counts. */
export async function GET(req: Request) {
  const u = new URL(req.url).searchParams;
  const res = await loadCompanyStatuses(supabaseAdmin(), await resolveTenantId());
  if (!res.ok) return NextResponse.json({ error: res.error }, { status: res.status });
  const byStatus: Record<string, number> = {};
  let atRisk = 0;
  for (const s of res.value) { byStatus[s.delivery_status] = (byStatus[s.delivery_status] ?? 0) + 1; if (s.at_risk) atRisk++; }
  let rows = res.value;
  if (u.get("status")) rows = rows.filter((s) => s.delivery_status === u.get("status"));
  if (u.get("at_risk") === "true") rows = rows.filter((s) => s.at_risk);
  return NextResponse.json({ summary: { companies: res.value.length, by_status: byStatus, at_risk: atRisk }, data: rows });
}
