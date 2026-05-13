import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { recordAudit } from "@/lib/audit/log";
import { z } from "zod";

export const runtime = "nodejs";

const bodySchema = z.object({ campaign_id: z.string().uuid() });

/**
 * POST /api/campaigns/duplicate
 * Creates a copy of the given campaign (same company, status reset to draft).
 * Campaigns hold AI idea data, not user content, so duplication is lightweight.
 */
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload", issues: parsed.error.issues }, { status: 400 });
  }

  const sb = supabaseAdmin();
  const { data: source, error: srcErr } = await sb
    .from("campaigns")
    .select("*")
    .eq("id", parsed.data.campaign_id)
    .single();
  if (srcErr || !source) return NextResponse.json({ error: "Campaign not found" }, { status: 404 });

  const { data: copy, error: insErr } = await sb
    .from("campaigns")
    .insert({
      company_id: source.company_id,
      title: `${source.title} (copy)`,
      summary: source.summary,
      activation: source.activation,
      cta: source.cta,
      description: source.description,
      objective: source.objective,
      raw_output: source.raw_output,
      generated_by: source.generated_by,
      model_id: source.model_id,
      prompt_version: source.prompt_version,
      status: "draft",
    })
    .select("*")
    .single();

  if (insErr || !copy) return NextResponse.json({ error: insErr?.message ?? "Insert failed" }, { status: 500 });

  await recordAudit({
    entity_type: "campaign",
    entity_id: copy.id,
    action: "campaign.duplicated",
    metadata: { source_id: source.id },
  });

  return NextResponse.json({ data: copy }, { status: 201 });
}
