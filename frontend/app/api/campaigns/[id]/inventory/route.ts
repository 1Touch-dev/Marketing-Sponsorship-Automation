import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { recordAudit } from "@/lib/audit/log";

export const runtime = "nodejs";

export async function GET(
  _req: Request,
  ctx: { params: { id: string } }
) {
  const sb = supabaseAdmin();
  const { id } = ctx.params;

  const { data, error } = await sb
    .from("campaign_inventory_items")
    .select("*")
    .eq("campaign_id", id)
    .order("sort_order")
    .order("created_at");

  if (error?.code === "42P01" || error?.code === "PGRST205") {
    // Table not yet migrated — return empty (migration 0024 pending)
    return NextResponse.json({ data: [], migration_pending: true });
  }
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ data: data ?? [] });
}

export async function PATCH(
  req: Request,
  ctx: { params: { id: string } }
) {
  const sb = supabaseAdmin();
  const { id } = ctx.params;

  const body = await req.json() as { inventory_lines?: unknown[] };

  if (!Array.isArray(body.inventory_lines)) {
    return NextResponse.json({ error: "inventory_lines array required" }, { status: 400 });
  }

  const { data: campaign } = await sb
    .from("campaigns")
    .select("id, title")
    .eq("id", id)
    .maybeSingle();

  if (!campaign) return NextResponse.json({ error: "Campaign not found" }, { status: 404 });

  type LineInput = {
    id?: string;
    inventory_id?: string | null;
    name?: string;
    catalog_id?: string;
    category?: string;
    inventory_type?: string;
    quantity?: number;
    unit?: string;
    unit_price?: number;
    notes?: string;
    included?: boolean;
    sort_order?: number;
  };

  const lines = body.inventory_lines as LineInput[];
  const packageTotal = lines
    .filter(l => l.included !== false)
    .reduce((sum, l) => sum + ((l.unit_price ?? 0) * (l.quantity ?? 1)), 0);

  // Full replace: delete existing then insert new
  await sb.from("campaign_inventory_items").delete().eq("campaign_id", id);

  if (lines.length > 0) {
    const rows = lines.map((l, idx) => ({
      campaign_id: id,
      inventory_id: l.inventory_id ?? null,
      name: l.name ?? l.catalog_id ?? "Item",
      category: l.category ?? null,
      inventory_type: l.inventory_type ?? null,
      quantity: l.quantity ?? 1,
      unit: l.unit ?? null,
      unit_price: l.unit_price ?? 0,
      notes: l.notes ?? null,
      included: l.included !== false,
      sort_order: l.sort_order ?? idx,
    }));

    const { error: insertErr } = await sb.from("campaign_inventory_items").insert(rows);
    if (insertErr) {
      // Fallback: table not migrated yet — store in summary for now
      await sb.from("campaigns").update({
        summary: JSON.stringify({ inventory_lines: lines, package_total_brl: packageTotal, updated_at: new Date().toISOString() }),
      }).eq("id", id);
      console.warn("[campaign-inventory] migration 0024 pending, used summary fallback:", insertErr.message);
    }
  }

  await recordAudit({
    entity_type: "campaign",
    entity_id: id,
    action: "campaign.inventory_updated",
    metadata: { item_count: lines.length, package_total_brl: packageTotal },
  });

  return NextResponse.json({ ok: true, package_total_brl: packageTotal, item_count: lines.length });
}
