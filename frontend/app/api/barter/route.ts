import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { recordAudit } from "@/lib/audit/log";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const sb = supabaseAdmin();
  const url = new URL(req.url);
  const status = url.searchParams.get("status");

  let query = (sb as ReturnType<typeof supabaseAdmin>)
    .from("barter_items" as "companies")
    .select("*")
    .order("priority", { ascending: false })
    .order("created_at", { ascending: false });

  if (status) query = query.eq("status", status) as typeof query;

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

  if (!body.item_name || !body.category) {
    return NextResponse.json({ error: "item_name and category are required" }, { status: 400 });
  }

  const { data, error } = await (sb as ReturnType<typeof supabaseAdmin>)
    .from("barter_items" as "companies")
    .insert(body as never)
    .select("*")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await recordAudit({
    entity_type: "barter",
    entity_id: null,
    action: "barter.created",
    metadata: { item_name: body.item_name },
  });

  return NextResponse.json({ data }, { status: 201 });
}
