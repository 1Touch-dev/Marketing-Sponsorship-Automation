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

  // Infrastructure-enforced send gate (mode="send" only — "draft"/"approved"
  // has no external side effect, so it's naturally idempotent). Atomically
  // claim the row by flipping it to a transient "sending" status guarded on
  // it not already being sent/sending, so two concurrent send requests for
  // the same email (double-click, retry, or this route racing the agent's
  // own send path in lib/agents/tools.ts) can't both pass the check and
  // both actually send. Only one request can win this UPDATE's WHERE clause.
  if (mode === "send") {
    const { data: claimed } = await sb
      .from("emails")
      .update({ status: "sending" })
      .eq("id", email.id)
      .neq("status", "sent")
      .neq("status", "sending")
      .select("id")
      .maybeSingle();
    if (!claimed) {
      return NextResponse.json({ error: "Email is already sending or was just sent" }, { status: 409 });
    }
  }

  const eventId = await startWorkflow({
    workflow_name: mode === "send" ? "email.send" : "email.draft",
    entity_type: "email",
    entity_id: email.id,
    metadata: { mode },
  });

  // Everything from here on can fail partway through (Pipedrive call, DB
  // write) — if it does after we've claimed "sending" above, release the
  // claim so the email isn't stranded in an unsendable limbo forever.
  let activity_id: number | null = null;
  let pdError: string | null = null;
  let updated: Record<string, unknown> | null = null;
  try {
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
    const pdResult = await logEmailToPipedrive({
      subject: email.subject,
      bodyHtml: email.body_html ?? email.body_text ?? "",
      pipedrive_deal_id: pipedriveDealId,
      pipedrive_org_id: pipedriveOrgId,
      pipedrive_person_id: pipedrivePersonId,
    });
    activity_id = pdResult.activity_id;
    pdError = pdResult.error ?? null;

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

    const { data: updatedRow, error: updErr } = await sb
      .from("emails")
      .update(updates)
      .eq("id", email.id)
      .select("*")
      .single();

    if (updErr) throw new Error(updErr.message);
    updated = updatedRow;
  } catch (err) {
    if (mode === "send") {
      await sb.from("emails").update({ status: "pending_approval" }).eq("id", email.id).eq("status", "sending");
    }
    const message = err instanceof Error ? err.message : String(err);
    if (eventId) await failWorkflow(eventId, message);
    return NextResponse.json({ error: message }, { status: 500 });
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
