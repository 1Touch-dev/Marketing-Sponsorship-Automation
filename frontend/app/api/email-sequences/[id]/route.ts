import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { recordAudit } from "@/lib/audit/log";

export const runtime = "nodejs";

export async function PATCH(req: Request, ctx: { params: { id: string } }) {
  const sb = supabaseAdmin();
  const { id } = ctx.params;
  const body = (await req.json().catch(() => ({}))) as {
    name?: string;
    description?: string;
    steps?: Array<{ flow_type: string; template_id?: string | null; delay_days: number }>;
    active?: boolean;
    is_default?: boolean;
  };

  const patch: Record<string, unknown> = {};
  if (body.name !== undefined) patch.name = body.name;
  if (body.description !== undefined) patch.description = body.description;
  if (body.active !== undefined) patch.active = body.active;
  if (Array.isArray(body.steps)) {
    patch.steps = JSON.stringify(
      body.steps.map((s, i) => ({
        step: i + 1,
        flow_type: s.flow_type,
        template_id: s.template_id ?? null,
        delay_days: Number.isFinite(s.delay_days) ? Math.max(0, s.delay_days) : 0,
      })),
    );
  }

  if (body.is_default) {
    await sb.from("email_sequences").update({ is_default: false } as never).eq("is_default", true as never);
    patch.is_default = true;
  } else if (body.is_default === false) {
    patch.is_default = false;
  }

  const { data, error } = await sb
    .from("email_sequences")
    .update(patch as never)
    .eq("id", id)
    .select("*")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await recordAudit({
    entity_type: "email_sequence",
    entity_id: id,
    action: "email_sequence.updated",
    metadata: { fields: Object.keys(patch) },
  });

  return NextResponse.json({ data });
}

export async function DELETE(_req: Request, ctx: { params: { id: string } }) {
  const sb = supabaseAdmin();
  const { id } = ctx.params;

  // Soft-delete: deactivate so history/enrollments remain intact.
  const { error } = await sb.from("email_sequences").update({ active: false } as never).eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await recordAudit({
    entity_type: "email_sequence",
    entity_id: id,
    action: "email_sequence.deleted",
    metadata: {},
  });

  return NextResponse.json({ deleted: true });
}
