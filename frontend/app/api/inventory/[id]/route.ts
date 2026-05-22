import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { recordAudit } from "@/lib/audit/log";

export const runtime = "nodejs";

export async function PATCH(req: Request, ctx: { params: { id: string } }) {
  const sb = supabaseAdmin();
  const body = await req.json().catch(() => ({}));
  const id = ctx.params.id;

  const { data, error } = await (sb as ReturnType<typeof supabaseAdmin>)
    .from("inventory_items" as "companies")
    .update(body as never)
    .eq("id", id)
    .select("*")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await recordAudit({
    entity_type: "inventory",
    entity_id: id,
    action: "inventory.updated",
    metadata: { name: body.name },
  });

  return NextResponse.json({ data });
}

export async function DELETE(_req: Request, ctx: { params: { id: string } }) {
  const sb = supabaseAdmin();
  const id = ctx.params.id;

  // Soft-delete by setting status to "deleted"
  const { error } = await (sb as ReturnType<typeof supabaseAdmin>)
    .from("inventory_items" as "companies")
    .update({ status: "deleted" } as never)
    .eq("id", id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await recordAudit({
    entity_type: "inventory",
    entity_id: id,
    action: "inventory.deleted",
    metadata: {},
  });

  return NextResponse.json({ success: true });
}
