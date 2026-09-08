import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { proposalUpdateSchema } from "@/lib/validators";
import { recordAudit } from "@/lib/audit/log";
import type { ProposalContent } from "@/types/database";
import { requirePermission } from "@/lib/auth/server-permission";

export const runtime = "nodejs";

function renderMarkdown(content: ProposalContent): string {
  const lines: string[] = [];
  if (content.title) lines.push(`# ${content.title}`, "");
  if (content.executive_summary) lines.push("## Executive summary", content.executive_summary, "");
  if (content.campaign_rationale) lines.push("## Campaign rationale", content.campaign_rationale, "");
  if (content.sponsorship_value) lines.push("## Sponsorship value", content.sponsorship_value, "");
  if (content.activation_plan) lines.push("## Activation plan", content.activation_plan, "");
  if (content.deliverables?.length) lines.push("## Deliverables", ...content.deliverables.map((d) => `- ${d}`), "");
  if (content.investment_note) lines.push("## Investment", content.investment_note, "");
  if (content.cta) lines.push("## Call to action", content.cta, "");
  return lines.join("\n");
}

export async function PATCH(req: Request, ctx: { params: { id: string } }) {
  const auth = await requirePermission("edit_proposal");
  if ("error" in auth) return auth.error;

  const body = await req.json().catch(() => ({}));
  const parsed = proposalUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload", issues: parsed.error.issues }, { status: 400 });
  }

  const sb = supabaseAdmin();
  const { data: existing, error: getErr } = await sb
    .from("proposals")
    .select("*")
    .eq("id", ctx.params.id)
    .single();
  if (getErr || !existing) return NextResponse.json({ error: "Proposal not found" }, { status: 404 });

  const nextVersion = existing.version + 1;
  const mergedContent: ProposalContent = {
    ...(existing.content as ProposalContent),
    ...(parsed.data.content ?? {}),
  };
  const updated: Record<string, unknown> = {
    title: parsed.data.title ?? existing.title,
    content: mergedContent,
    content_md: renderMarkdown(mergedContent),
    version: nextVersion,
    // Reset to under_review if it was previously approved
    status:
      existing.status === "approved" || existing.status === "sent"
        ? existing.status
        : "under_review",
  };
  if ("ab_test_config" in parsed.data) {
    updated.ab_test_config = parsed.data.ab_test_config ?? null;
  }

  const { data: saved, error: updErr } = await sb
    .from("proposals")
    .update(updated)
    .eq("id", existing.id)
    .select("*")
    .single();
  if (updErr || !saved) return NextResponse.json({ error: updErr?.message ?? "Update failed" }, { status: 500 });

  await sb.from("proposal_versions").insert({
    proposal_id: saved.id,
    version: nextVersion,
    content: mergedContent,
    content_md: updated.content_md,
    edit_reason: parsed.data.edit_reason ?? "Manual edit",
  });

  await recordAudit({
    entity_type: "proposal",
    entity_id: saved.id,
    action: "proposal.edited",
    metadata: { version: nextVersion, reason: parsed.data.edit_reason ?? null },
  });

  return NextResponse.json({ data: saved });
}

export async function DELETE(_req: Request, ctx: { params: { id: string } }) {
  const auth = await requirePermission("delete_proposal");
  if ("error" in auth) return auth.error;

  const sb = supabaseAdmin();
  const { error } = await sb.from("proposals").delete().eq("id", ctx.params.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  await recordAudit({ entity_type: "proposal", entity_id: ctx.params.id, action: "proposal.deleted" });
  return NextResponse.json({ ok: true });
}
