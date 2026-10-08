import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { requirePermission } from "@/lib/auth/server-permission";
import { isMissingMigration } from "@/lib/proposals/revision-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Every batch that was accepted or refused, newest first, with the limits and the estimate it was judged against. */
export async function GET(req: Request) {
  const auth = await requirePermission("view_audit");
  if ("error" in auth) return auth.error;
  const limit = Math.min(Number(new URL(req.url).searchParams.get("limit")) || 50, 200);
  const { data, error } = await supabaseAdmin().from("batch_decisions").select("id, kind, requested_by, items, per_item_estimate_usd, estimated_cost_usd, max_items, ceiling_usd, decision, reason, created_at").eq("tenant_id", auth.user.tenant_id).order("created_at", { ascending: false }).limit(limit);
  if (error) return isMissingMigration(error) ? NextResponse.json({ error: "Batch limits are not set up yet (migration 0070)." }, { status: 503 }) : NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ total: data?.length ?? 0, data: data ?? [] });
}
