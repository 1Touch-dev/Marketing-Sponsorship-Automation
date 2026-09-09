import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { recordAudit } from "@/lib/audit/log";
import { requirePermission } from "@/lib/auth/server-permission";

export const runtime = "nodejs";

export async function GET(
  _req: Request,
  ctx: { params: { id: string } }
) {
  const sb = supabaseAdmin();
  const { data, error } = await sb
    .from("email_templates")
    .select("*")
    .eq("id", ctx.params.id)
    .single();

  if (error || !data) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ data });
}

export async function PATCH(
  req: Request,
  ctx: { params: { id: string } }
) {
  const auth = await requirePermission("manage_templates");
  if ("error" in auth) return auth.error;

  const sb = supabaseAdmin();
  const id = ctx.params.id;
  const body = await req.json().catch(() => ({}));

  if (body.is_default) {
    await sb.from("email_templates").update({ is_default: false } as never).neq("id", id).eq("is_default", true as never);
  }

  if (body.variables && Array.isArray(body.variables)) {
    body.variables = JSON.stringify(body.variables);
  }

  const { data, error } = await sb
    .from("email_templates")
    .update(body as never)
    .eq("id", id)
    .select("*")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await recordAudit({
    entity_type: "email_template",
    entity_id: id,
    action: "email_template.updated",
    metadata: { fields: Object.keys(body) },
  });

  return NextResponse.json({ data });
}

export async function DELETE(
  _req: Request,
  ctx: { params: { id: string } }
) {
  const auth = await requirePermission("manage_templates");
  if ("error" in auth) return auth.error;

  const sb = supabaseAdmin();
  // Soft delete
  const { error } = await sb
    .from("email_templates")
    .update({ active: false } as never)
    .eq("id", ctx.params.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await recordAudit({
    entity_type: "email_template",
    entity_id: ctx.params.id,
    action: "email_template.deleted",
    metadata: {},
  });

  return NextResponse.json({ ok: true });
}
