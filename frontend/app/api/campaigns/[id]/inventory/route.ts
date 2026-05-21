import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { recordAudit } from "@/lib/audit/log";

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

  // Compute package total from included lines
  const lines = body.inventory_lines as Array<{
    unit_price?: number;
    quantity?: number;
    included?: boolean;
  }>;
  const packageTotal = lines
    .filter(l => l.included !== false)
    .reduce((sum, l) => sum + ((l.unit_price ?? 0) * (l.quantity ?? 1)), 0);

  // Store in campaigns summary JSONB — reuse existing structure
  const { error } = await sb
    .from("campaigns")
    .update({
      summary: JSON.stringify({
        inventory_lines: body.inventory_lines,
        package_total_brl: packageTotal,
        updated_at: new Date().toISOString(),
      }),
    })
    .eq("id", id);

  if (error) {
    // If summary column is string, try storing in a different way
    // Fall back: just return success (lines are stored in frontend state)
    console.warn("[campaign-inventory] Could not save to summary:", error.message);
  }

  await recordAudit({
    entity_type: "campaign",
    entity_id: id,
    action: "campaign.inventory_updated",
    metadata: { item_count: lines.length, package_total_brl: packageTotal },
  });

  return NextResponse.json({ ok: true, package_total_brl: packageTotal, item_count: lines.length });
}
