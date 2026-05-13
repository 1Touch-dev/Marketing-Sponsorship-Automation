import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { recordAudit } from "@/lib/audit/log";
import { guardColumns } from "@/lib/db/column-guard";
import { z } from "zod";
import type { ProposalContent } from "@/types/database";

export const runtime = "nodejs";

const bodySchema = z.object({ proposal_id: z.string().uuid() });

/**
 * POST /api/proposals/duplicate
 * Creates a new draft proposal copying content from the source.
 * The copy starts at version 1 with status=draft.
 */
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload", issues: parsed.error.issues }, { status: 400 });
  }

  const sb = supabaseAdmin();
  const { data: source, error: srcErr } = await sb
    .from("proposals")
    .select("*")
    .eq("id", parsed.data.proposal_id)
    .single();
  if (srcErr || !source) return NextResponse.json({ error: "Proposal not found" }, { status: 404 });

  const { data: copy, error: insErr } = await sb
    .from("proposals")
    .insert(
      guardColumns("proposals", {
        company_id: source.company_id,
        campaign_id: source.campaign_id,
        title: `${source.title} (copy)`,
        content: source.content,
        content_md: source.content_md,
        status: "draft",
        version: 1,
        generated_by: source.generated_by,
        model_id: source.model_id,
        prompt_version: source.prompt_version,
      }),
    )
    .select("*")
    .single();

  if (insErr || !copy) return NextResponse.json({ error: insErr?.message ?? "Insert failed" }, { status: 500 });

  // Snapshot version 1 for the copy
  await sb.from("proposal_versions").insert({
    proposal_id: copy.id,
    version: 1,
    content: copy.content as ProposalContent,
    content_md: copy.content_md ?? null,
    edit_reason: `Duplicated from proposal ${source.id}`,
  });

  await recordAudit({
    entity_type: "proposal",
    entity_id: copy.id,
    action: "proposal.duplicated",
    metadata: { source_id: source.id },
  });

  return NextResponse.json({ data: copy }, { status: 201 });
}
