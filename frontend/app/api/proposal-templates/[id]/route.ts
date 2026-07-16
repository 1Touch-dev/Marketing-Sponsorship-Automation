import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { recordAudit } from "@/lib/audit/log";

export const runtime = "nodejs";

/** GET /api/proposal-templates/[id] — full template (content included). */
export async function GET(_req: Request, ctx: { params: { id: string } }) {
  const sb = supabaseAdmin();
  const { data, error } = await sb
    .from("proposal_templates")
    .select("*")
    .eq("id", ctx.params.id)
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Increment use_count (best-effort; column may be pre-migration).
  const current = (data as { use_count?: number }).use_count ?? 0;
  try {
    await sb.from("proposal_templates").update({ use_count: current + 1 } as never).eq("id", ctx.params.id);
  } catch {
    /* pre-migration */
  }

  await recordAudit({
    entity_type: "proposal_template",
    entity_id: ctx.params.id,
    action: "proposal_template.applied",
    metadata: {},
  });

  return NextResponse.json({ data });
}

export async function DELETE(_req: Request, ctx: { params: { id: string } }) {
  const sb = supabaseAdmin();
  const { error } = await sb
    .from("proposal_templates")
    .update({ active: false } as never)
    .eq("id", ctx.params.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await recordAudit({
    entity_type: "proposal_template",
    entity_id: ctx.params.id,
    action: "proposal_template.deleted",
    metadata: {},
  });

  return NextResponse.json({ deleted: true });
}
