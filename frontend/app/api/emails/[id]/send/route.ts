import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { recordAudit } from "@/lib/audit/log";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";
import { startWorkflow, completeWorkflow, failWorkflow } from "@/lib/workflow-events";
import { logEmailToPipedrive } from "@/lib/pipedrive/email";
import { resolveProposalPipedriveIds } from "@/lib/pipedrive/sync";

export const runtime = "nodejs";
export const maxDuration = 30;

/**
 * POST /api/emails/:id/send
 * Body: { mode?: "draft" | "send" }
 *
 * "draft" = mark email as approved in DB + log activity to Pipedrive as scheduled (done:0)
 * "send"  = mark email as sent in DB + log activity to Pipedrive as done (done:1)
 *
 * Uses Pipedrive Activities API (type: "email") instead of Gmail.
 * Looks up pipedrive_deal_id / pipedrive_org_id from the linked proposal's company JSONB.
 */
export async function POST(req: Request, ctx: { params: { id: string } }) {
  const ip = getClientIp(req);
  const rl = checkRateLimit(`email-send:${ip}`, { max: 20, windowMs: 60_000 });
  if (!rl.ok) return NextResponse.json({ error: rl.message }, { status: 429 });

  const body = (await req.json().catch(() => ({}))) as { mode?: "draft" | "send" };
  const mode = body.mode === "send" ? "send" : "draft";

  const sb = supabaseAdmin();
  const { data: email, error: getErr } = await sb.from("emails").select("*").eq("id", ctx.params.id).single();
  if (getErr || !email) return NextResponse.json({ error: "Email not found" }, { status: 404 });

  if (email.status === "sent") {
    return NextResponse.json({ error: "Email already sent" }, { status: 409 });
  }

  // Pre-send validation: block if [Nome] or {{variable}} placeholders are unresolved
  const { hasUnresolvedVariables } = await import("@/lib/email/template-engine");
  const bodyToCheck = (email.body_html ?? "") + (email.body_text ?? "") + (email.subject ?? "");
  const unresolvedPlaceholders = hasUnresolvedVariables(bodyToCheck);
  if (unresolvedPlaceholders.length > 0) {
    return NextResponse.json(
      {
        error: "Email contains unresolved placeholders. Please fix before sending.",
        placeholders: unresolvedPlaceholders,
        hint: "Common fixes: select a sender profile, or ensure the proposal has a linked company with a contact name."
      },
      { status: 400 }
    );
  }

  const eventId = await startWorkflow({
    workflow_name: mode === "send" ? "email.send" : "email.draft",
    entity_type: "email",
    entity_id: email.id,
    metadata: { mode },
  });

  // Resolve Pipedrive IDs from the linked proposal/company
  let pipedriveDealId: number | null = null;
  let pipedriveOrgId: number | null = null;
  let pipedrivePersonId: number | null = null;

  if (email.proposal_id) {
    const ids = await resolveProposalPipedriveIds(sb, email.proposal_id);
    pipedriveDealId = ids.dealId;
    pipedriveOrgId = ids.orgId;

    const { data: proposal } = await sb
      .from("proposals")
      .select("companies(full_intelligence)")
      .eq("id", email.proposal_id)
      .maybeSingle();
    const companyData = (proposal as Record<string, unknown> | null)?.companies as Record<string, unknown> | null;
    const fullIntel = companyData?.full_intelligence as Record<string, unknown> | null;
    pipedrivePersonId = (fullIntel?.pipedrive_person_id as number) ?? null;
  }

  // Log to Pipedrive Activities
  const { activity_id, error: pdError } = await logEmailToPipedrive({
    subject: email.subject,
    bodyHtml: email.body_html ?? email.body_text ?? "",
    pipedrive_deal_id: pipedriveDealId,
    pipedrive_org_id: pipedriveOrgId,
    pipedrive_person_id: pipedrivePersonId,
  });

  const updates: Record<string, unknown> = {
    status: mode === "send" ? "sent" : "approved",
    approved_at: new Date().toISOString(),
    // Store Pipedrive activity ID in metadata field
    metadata: {
      ...(email.metadata as Record<string, unknown> ?? {}),
      pipedrive_activity_id: activity_id,
      pipedrive_error: pdError ?? null,
    },
  };

  if (mode === "send") {
    updates.sent_at = new Date().toISOString();
  }

  const { data: updated, error: updErr } = await sb
    .from("emails")
    .update(updates)
    .eq("id", email.id)
    .select("*")
    .single();

  if (updErr) {
    if (eventId) await failWorkflow(eventId, updErr.message);
    return NextResponse.json({ error: updErr.message }, { status: 500 });
  }

  if (eventId) {
    await completeWorkflow(eventId, { pipedrive_activity_id: activity_id, mode });
  }

  await recordAudit({
    entity_type: "email",
    entity_id: email.id,
    action: mode === "send" ? "email.sent" : "email.draft_created",
    metadata: {
      recipient: email.recipient,
      pipedrive_activity_id: activity_id,
      pipedrive_error: pdError ?? null,
    },
  });

  return NextResponse.json({
    data: updated,
    pipedrive_activity_id: activity_id,
    pipedrive_warning: pdError ? `Pipedrive log failed: ${pdError}` : null,
  });
}
