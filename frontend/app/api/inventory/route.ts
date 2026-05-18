import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { recordAudit } from "@/lib/audit/log";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const sb = supabaseAdmin();
  const url = new URL(req.url);
  const type = url.searchParams.get("type");
  const cat = url.searchParams.get("category");

  let query = (sb as ReturnType<typeof supabaseAdmin>)
    .from("inventory_items" as "companies")
    .select("*")
    .eq("status", "active")
    .order("sort_order");

  if (type) query = query.eq("inventory_type", type) as typeof query;
  if (cat) query = query.eq("category", cat) as typeof query;

  const { data, error } = await query;
  if (error?.message?.includes("not find") || error?.message?.includes("does not exist")) {
    return NextResponse.json({ data: [], migration_needed: true });
  }
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data });
}

export async function POST(req: Request) {
  const sb = supabaseAdmin();
  const body = await req.json().catch(() => ({}));

  if (!body.name || !body.category || !body.inventory_type) {
    return NextResponse.json({ error: "name, category, and inventory_type are required" }, { status: 400 });
  }

  const { data, error } = await (sb as ReturnType<typeof supabaseAdmin>)
    .from("inventory_items" as "companies")
    .insert(body as never)
    .select("*")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await recordAudit({
    entity_type: "inventory",
    entity_id: null,
    action: "inventory.created",
    metadata: { name: body.name, category: body.category, type: body.inventory_type },
  });

  return NextResponse.json({ data }, { status: 201 });
}
