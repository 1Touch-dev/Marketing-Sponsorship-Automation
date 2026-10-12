import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { resolveTenantId } from "@/lib/tenants/current";
import { listObligations } from "@/lib/obligations/store";
import { groupByMatch, loadMatches } from "@/lib/delivery/match";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Obligations, filterable by ?contract_id, ?company_id, ?project_id, ?status, ?owner, ?match_id and ?timing (overdue | due_soon | upcoming | done), with counts; ?group_by=match adds the grouping. */
export async function GET(req: Request) {
  const u = new URL(req.url).searchParams;
  const res = await listObligations(supabaseAdmin(), await resolveTenantId(), {
    contractId: u.get("contract_id"), companyId: u.get("company_id"), projectId: u.get("project_id"), status: u.get("status"), owner: u.get("owner"), timing: u.get("timing"), matchId: u.get("match_id"),
  });
  if (!res.ok) return NextResponse.json({ error: res.error }, { status: res.status });
  const byStatus: Record<string, number> = {};
  const byTiming: Record<string, number> = {};
  for (const o of res.value) { byStatus[o.status] = (byStatus[o.status] ?? 0) + 1; byTiming[o.timing] = (byTiming[o.timing] ?? 0) + 1; }
  // ?group_by=match also returns the work grouped around each match (soonest first, the work with no match last)
  const groups = u.get("group_by") === "match" ? groupByMatch(res.value, await loadMatches(supabaseAdmin(), res.value.map((o) => o.match_id).filter((m): m is string => !!m))) : undefined;
  return NextResponse.json({ summary: { total: res.value.length, by_status: byStatus, by_timing: byTiming }, data: res.value, ...(groups ? { groups } : {}) });
}
