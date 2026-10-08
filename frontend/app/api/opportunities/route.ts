import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { resolveTenantId } from "@/lib/tenants/current";
import { loadOpportunities } from "@/lib/opportunities/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Every opportunity of the tenant, filterable by ?status= and ?kind=, with counts. */
export async function GET(req: Request) {
  const tenantId = await resolveTenantId();
  const url = new URL(req.url);
  const res = await loadOpportunities(supabaseAdmin(), tenantId);
  if (!res.ok) return NextResponse.json({ error: res.error }, { status: res.status });

  const byStatus: Record<string, number> = {};
  const byKind: Record<string, number> = {};
  for (const o of res.value) {
    byStatus[o.status] = (byStatus[o.status] ?? 0) + 1;
    byKind[o.kind] = (byKind[o.kind] ?? 0) + 1;
  }
  const status = url.searchParams.get("status");
  const kind = url.searchParams.get("kind");
  const rows = res.value.filter((o) => (!status || o.status === status) && (!kind || o.kind === kind));
  return NextResponse.json({ summary: { total: res.value.length, by_status: byStatus, by_kind: byKind }, data: rows });
}
