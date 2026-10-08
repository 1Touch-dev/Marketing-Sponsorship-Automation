import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { requirePermission } from "@/lib/auth/server-permission";
import { reconcileSoldCounters } from "@/lib/inventory/proposal-units";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Dry run: where quantity_sold disagrees with the units held by active contracts. */
export async function GET() {
  const auth = await requirePermission("manage_inventory");
  if ("error" in auth) return auth.error;
  const diffs = await reconcileSoldCounters(supabaseAdmin(), auth.user.tenant_id, false);
  return NextResponse.json({ in_sync: diffs.length === 0, differences: diffs });
}

/** Rewrites quantity_sold to match active contracts. */
export async function POST() {
  const auth = await requirePermission("manage_inventory");
  if ("error" in auth) return auth.error;
  const diffs = await reconcileSoldCounters(supabaseAdmin(), auth.user.tenant_id, true);
  return NextResponse.json({ corrected: diffs });
}
