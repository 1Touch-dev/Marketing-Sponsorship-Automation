/**
 * PATCH /api/proposal-templates/[id]/placeholders
 * Updates the placeholder_config array for a template (per-placeholder
 * type/prompt/base-image/logo-override settings from the config editor UI).
 * Body: { placeholder_config: PlaceholderConfig[] }
 */
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { recordAudit } from "@/lib/audit/log";
import type { PlaceholderConfig } from "@/lib/presentations/placeholder-parser";

export const runtime = "nodejs";

export async function PATCH(req: Request, ctx: { params: { id: string } }) {
  const sb = supabaseAdmin();
  const body = await req.json().catch(() => ({}));
  const config = body?.placeholder_config as PlaceholderConfig[] | undefined;

  if (!Array.isArray(config)) {
    return NextResponse.json({ error: "placeholder_config array required" }, { status: 400 });
  }

  const { data, error } = await sb
    .from("proposal_templates")
    .update({ placeholder_config: config } as never)
    .eq("id", ctx.params.id)
    .select("id, placeholder_config")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await recordAudit({
    entity_type: "proposal_template",
    entity_id: ctx.params.id,
    action: "proposal_template.placeholders_updated",
    metadata: { count: config.length },
  });

  return NextResponse.json({ data });
}
