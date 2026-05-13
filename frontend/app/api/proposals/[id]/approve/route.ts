import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { approvalSchema } from "@/lib/validators";
import { recordAudit } from "@/lib/audit/log";
import type { ProposalStatus } from "@/types/database";

export const runtime = "nodejs";

const STATUS_MAP: Record<string, ProposalStatus> = {
  approve: "approved",
  reject: "rejected",
  request_revision: "revision_requested",
};

export async function POST(req: Request, ctx: { params: { id: string } }) {
  const body = await req.json().catch(() => ({}));
  const parsed = approvalSchema.safeParse({ ...body, proposal_id: ctx.params.id });
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload", issues: parsed.error.issues }, { status: 400 });
  }

  const sb = supabaseAdmin();
  const { error: insErr } = await sb.from("approvals").insert({
    proposal_id: parsed.data.proposal_id,
    decision: parsed.data.decision,
    comments: parsed.data.comments ?? null,
  });
  if (insErr) return NextResponse.json({ error: insErr.message }, { status: 500 });

  const newStatus = STATUS_MAP[parsed.data.decision];
  const update: Record<string, unknown> = { status: newStatus };
  if (parsed.data.decision === "approve") update.approved_at = new Date().toISOString();

  const { data: proposal, error: updErr } = await sb
    .from("proposals")
    .update(update)
    .eq("id", parsed.data.proposal_id)
    .select("*")
    .single();
  if (updErr) return NextResponse.json({ error: updErr.message }, { status: 500 });

  await recordAudit({
    entity_type: "proposal",
    entity_id: parsed.data.proposal_id,
    action: `proposal.${parsed.data.decision}`,
    metadata: { comments: parsed.data.comments ?? null },
  });

  return NextResponse.json({ data: proposal });
}
