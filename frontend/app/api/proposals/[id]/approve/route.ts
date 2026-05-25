import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { approvalSchema } from "@/lib/validators";
import { recordAudit } from "@/lib/audit/log";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";
import type { ProposalStatus } from "@/types/database";
import { guardColumns } from "@/lib/db/column-guard";
import crypto from "crypto";

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

  const sb = supabaseAdmin();

  // Insert approval record (skip for submit_review — that's just a status change)
  if (parsed.data.decision !== "submit_review") {
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
  const appUrl = process.env.APP_URL ?? "http://localhost:3000";
  const p = proposal as Record<string, unknown>;
  fetch(`${appUrl}/api/crm`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      entity_type: "proposal",
      entity_id: parsed.data.proposal_id,
      operation: p.pipedrive_deal_id ? "status_change" : "create",
      payload: {
        pipedrive_deal_id: p.pipedrive_deal_id ?? null,
        pipedrive_pipeline_id: p.pipedrive_pipeline_id ?? null,
        new_status: newStatus,
        status_reason: parsed.data.comments ?? null,
      },
    }),
  }).catch(() => {});

  return NextResponse.json({ data: proposal });
}
