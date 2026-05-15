import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const assetType = searchParams.get("type");
  const category = searchParams.get("category");

  const sb = supabaseAdmin();

  let packsQuery = sb
    .from("brand_asset_packs")
    .select("*, brand_assets(*)")
    .eq("status", "active")
    .eq("club", "Coritiba FC")
    .order("created_at", { ascending: true });

  if (assetType) {
    packsQuery = packsQuery.eq("asset_type", assetType);
  }

  const { data: packs, error } = await packsQuery;

  if (error) {
    // Table might not exist yet (migration not applied)
    if (error.code === "42P01") {
      return NextResponse.json({
        data: [],
        message: "Brand asset system not yet initialized. Please apply migration 0008_brand_asset_system.sql",
      });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Filter assets by category if provided
  let result = packs ?? [];
  if (category) {
    result = result.map((pack) => ({
      ...pack,
      brand_assets: (pack.brand_assets as Array<{ asset_category: string }> ?? []).filter(
        (a) => a.asset_category === category,
      ),
    }));
  }

  return NextResponse.json({ data: result });
}
