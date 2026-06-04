import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { recordAudit } from "@/lib/audit/log";

export const runtime = "nodejs";

export async function PATCH(
  req: Request,
  ctx: { params: { id: string; packageId: string } }
) {
  const sb = supabaseAdmin();
  const body = await req.json().catch(() => ({}));

  if (body.benefits && Array.isArray(body.benefits)) body.benefits = JSON.stringify(body.benefits);
  if (body.inventory_items && Array.isArray(body.inventory_items)) body.inventory_items = JSON.stringify(body.inventory_items);

  const { data, error } = await sb
    .from("proposal_packages")
    .update(body as never)
    .eq("id", ctx.params.packageId)
    .eq("proposal_id", ctx.params.id)
    .select("*")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await recordAudit({
    entity_type: "proposal_package",
    entity_id: ctx.params.packageId,
    action: "proposal_package.updated",
    metadata: { fields: Object.keys(body) },
  });

  return NextResponse.json({ data });
}

export async function DELETE(
  _req: Request,
  ctx: { params: { id: string; packageId: string } }
) {
  const sb = supabaseAdmin();
  const { error } = await sb
    .from("proposal_packages")
    .update({ active: false } as never)
    .eq("id", ctx.params.packageId)
    .eq("proposal_id", ctx.params.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await recordAudit({
    entity_type: "proposal_package",
    entity_id: ctx.params.packageId,
    action: "proposal_package.deleted",
    metadata: {},
  });

  return NextResponse.json({ ok: true });
}
