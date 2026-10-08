import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { resolveTenantId } from "@/lib/tenants/current";
import { loadMetrics } from "@/lib/metrics/load";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Every business number with its definition, source, caveats and a link to the rows behind it. */
export async function GET() {
  const tenantId = await resolveTenantId();
  const snapshot = await loadMetrics(supabaseAdmin(), tenantId);
  return NextResponse.json(snapshot);
}
