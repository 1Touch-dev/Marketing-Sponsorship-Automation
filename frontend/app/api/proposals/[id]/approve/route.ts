import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { approvalSchema } from "@/lib/validators";
import { recordAudit } from "@/lib/audit/log";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";
import type { ProposalStatus } from "@/types/database";
import { guardColumns } from "@/lib/db/column-guard";
import { enqueueCrmSync, resolveProposalPipedriveIds } from "@/lib/pipedrive/sync";
import crypto from "crypto";
import { requirePermission } from "@/lib/auth/server-permission";

export const runtime = "nodejs";

const STATUS_MAP: Record<string, ProposalStatus> = {
  approve:          "approved",
  reject:           "rejected",
  request_revision: "revision_requested",
  submit_review:    "under_review",
  active_contract:  "active_contract",
};

export async function POST(req: Request, ctx: { params: { id: string } }) {
  const ip = getClientIp(req);
  const rl = checkRateLimit(`approval:${ip}`, { max: 30, windowMs: 60_000 });
  if (!rl.ok) return NextResponse.json({ error: rl.message }, { status: 429 });

  const body = await req.json().catch(() => ({}));
  const parsed = approvalSchema.safeParse({ ...body, proposal_id: ctx.params.id });
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload", issues: parsed.error.issues }, { status: 400 });
  }

  // Server-side enforcement (Phase 5 audit finding, 2026-09-08) — this
  // endpoint approves/rejects/sends proposals to real prospects; it had no
  // permission check at all before this. "submit_review" is a lower bar
  // (any sales rep moving their own draft forward); every other decision
  // is the actual approval-flow gate.
  const requiredPermission = parsed.data.decision === "submit_review" ? "submit_proposal" : "approve_proposal";
  const auth = await requirePermission(requiredPermission);
  if ("error" in auth) return auth.error;

  const sb = supabaseAdmin();

  // Insert approval record (skip for status-only transitions that aren't in approval_decision enum)
  const SKIP_APPROVAL_INSERT = new Set(["submit_review", "active_contract"]);
  if (!SKIP_APPROVAL_INSERT.has(parsed.data.decision)) {
    const { error: insErr } = await sb.from("approvals").insert({
      proposal_id: parsed.data.proposal_id,
      decision: parsed.data.decision,
      comments: parsed.data.comments ?? null,
    });
    if (insErr) return NextResponse.json({ error: insErr.message }, { status: 500 });
  }

  const newStatus = STATUS_MAP[parsed.data.decision];
  if (!newStatus) return NextResponse.json({ error: "Unknown decision" }, { status: 400 });

  const updateData: Record<string, unknown> = {
    status: newStatus,
    status_reason: parsed.data.status_reason ?? parsed.data.comments ?? null,
  };

  if (parsed.data.decision === "approve") {
    updateData.approved_at = new Date().toISOString();

    // Auto-generate share_token if the proposal doesn't have one
    const { data: current } = await sb
      .from("proposals")
      .select("share_token")
      .eq("id", parsed.data.proposal_id)
      .maybeSingle();

    const existing = (current as Record<string, unknown> | null)?.share_token;
    if (!existing) {
      updateData.share_token = crypto.randomBytes(24).toString("hex");
    }
  }

  const update = guardColumns("proposals", updateData);

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
    metadata: { comments: parsed.data.comments ?? null, new_status: newStatus },
  });

  // ── Fire-and-forget: sync status change to Pipedrive ─────────────────────
  void (async () => {
    const ids = await resolveProposalPipedriveIds(sb, parsed.data.proposal_id);
    const p = proposal as Record<string, unknown>;
    const content = (p.content as Record<string, unknown>) ?? {};
    const dealId = ids.dealId ?? (p.pipedrive_deal_id as number) ?? (content.pipedrive_deal_id as number) ?? null;
    const pipelineId = ids.pipelineId ?? (p.pipedrive_pipeline_id as number) ?? (content.pipedrive_pipeline_id as number) ?? null;

    await enqueueCrmSync({
      entity_type: "proposal",
      entity_id: parsed.data.proposal_id,
      operation: dealId ? "status_change" : "create",
      payload: {
        pipedrive_deal_id: dealId,
        pipedrive_pipeline_id: pipelineId,
        new_status: newStatus,
        status_reason: parsed.data.comments ?? null,
      },
    });
  })().catch(err => console.error("[CRM] proposal approve sync failed", err));

  return NextResponse.json({ data: proposal });
}
