import { buildProposalClaimsReport, type ProposalClaimsReport } from "@/lib/claims/proposal-report";
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
import { activateProposalUnits, leaveActiveContractUnits } from "@/lib/inventory/proposal-units";
import { approveRevision } from "@/lib/proposals/revision-store";
import { guardActivationTerms } from "@/lib/proposals/approval-guard";
import { recordEvidenceSafe } from "@/lib/contracts/evidence-store";

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

  // An approval applies to one exact revision of the terms: freeze the
  // current terms and bind the approval to them.
  let approvedRevisionId: string | null = null;
  if (parsed.data.decision === "approve") {
    const frozen = await approveRevision(sb, auth.user.tenant_id, parsed.data.proposal_id, { reason: "Approved", userId: auth.user.id });
    if (frozen.ok) approvedRevisionId = frozen.revision.id;
    else if (frozen.skipped === "error") {
      return NextResponse.json({ error: `Could not freeze the approved terms: ${frozen.error ?? "unknown error"}` }, { status: 500 });
    }
  }

  if (!SKIP_APPROVAL_INSERT.has(parsed.data.decision)) {
    const { error: insErr } = await sb.from("approvals").insert({
      tenant_id: auth.user.tenant_id,
      proposal_id: parsed.data.proposal_id,
      decision: parsed.data.decision,
      comments: parsed.data.comments ?? null,
      ...(approvedRevisionId ? { revision_id: approvedRevisionId } : {}),
    });
    if (insErr) return NextResponse.json({ error: insErr.message }, { status: 500 });
  }

  const newStatus = STATUS_MAP[parsed.data.decision];
  if (!newStatus) return NextResponse.json({ error: "Unknown decision" }, { status: 400 });

  // Inventory units are committed when a contract becomes active and released
  // when it stops being active; the first two steps below are conditional
  // updates, so concurrent requests cannot double-commit the last unit.
  if (newStatus === "active_contract") {
    const terms = await guardActivationTerms(sb, auth.user.tenant_id, parsed.data.proposal_id, auth.user.id);
    if (!terms.ok) return NextResponse.json({ error: terms.message, code: terms.code }, { status: 409 });
    const activation = await activateProposalUnits(sb, auth.user.tenant_id, parsed.data.proposal_id);
    if (!activation.ok) {
      if ("notFound" in activation) return NextResponse.json({ error: "Proposal not found" }, { status: 404 });
      return NextResponse.json(
        {
          error: `Cannot activate this contract: ${activation.conflict.name} — ${activation.conflict.reason}`,
          code: "inventory_unavailable",
          conflict: activation.conflict,
        },
        { status: 409 },
      );
    }

    // "Mark as active" says the deal is signed. Record that as a claim by this
    // person, never as proof: only signature evidence (the provider's record, or
    // a second person verifying a signed document) turns it into proof.
    const { data: linked } = await sb
      .from("contracts")
      .select("id")
      .eq("proposal_id", parsed.data.proposal_id)
      .eq("tenant_id", auth.user.tenant_id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (linked) {
      await recordEvidenceSafe(sb, auth.user.tenant_id, (linked as { id: string }).id, {
        evidence_type: "activation_claimed",
        source: "manual",
        actor_user_id: auth.user.id,
        actor_email: auth.user.email,
        detail: { comments: parsed.data.comments ?? null },
      });
    }
  } else {
    await leaveActiveContractUnits(sb, auth.user.tenant_id, parsed.data.proposal_id, newStatus);
  }

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
      .eq("tenant_id", auth.user.tenant_id)
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
    .eq("tenant_id", auth.user.tenant_id)
    .select("*")
    .single();
  if (updErr) return NextResponse.json({ error: updErr.message }, { status: 500 });

  // Which club figures the sponsor-facing documents will and will not show, so
  // the approver knows what is being put in front of the sponsor (Task 8).
  let claimsReport: ProposalClaimsReport | null = null;
  if (parsed.data.decision === "approve") {
    claimsReport = await buildProposalClaimsReport(sb, auth.user.tenant_id, proposal as { content?: unknown; strategy_variants?: unknown });
  }

  await recordAudit({
    entity_type: "proposal",
    entity_id: parsed.data.proposal_id,
    action: `proposal.${parsed.data.decision}`,
    metadata: {
      comments: parsed.data.comments ?? null,
      new_status: newStatus,
      ...(claimsReport
        ? { claims_shown: claimsReport.shown, claims_withheld: claimsReport.withheld.map((w) => ({ key: w.key, state: w.state })), claims_unregistered: claimsReport.unregistered, unsourced_text_figures: claimsReport.unsourced_text_figures.map((f) => f.figure) }
        : {}),
    },
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

  return NextResponse.json({ data: proposal, ...(claimsReport ? { claims: claimsReport } : {}) });
}
