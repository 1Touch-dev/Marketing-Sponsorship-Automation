import { recordChannelCheck } from "@/lib/contacts/store";
import { NextResponse } from "next/server";
import { z } from "zod";
import { supabaseAdmin } from "@/lib/supabase/server";
import { requirePermissionOrInternal } from "@/lib/auth/server-permission";
import { recordAudit } from "@/lib/audit/log";
import { loadDelivery, recordMessageEvent, SOURCE_EVENT_TYPES } from "@/lib/messaging/store";
import { userOrService } from "@/lib/identity/actor";

export const runtime = "nodejs";

const bodySchema = z.object({
  event_type: z.enum([
    "content_approved", "crm_activity_recorded", "crm_activity_failed", "send_attempted", "provider_accepted",
    "delivered", "opened", "clicked", "bounced", "failed", "outcome_unknown", "manually_reported_sent", "reconciled",
  ]),
  source: z.enum(["platform", "crm", "provider"]).optional(),
  provider: z.string().max(60).optional(),
  provider_event_id: z.string().max(200).optional(),
  provider_receipt_id: z.string().max(200).optional(),
  occurred_at: z.string().datetime().optional(),
  detail: z.record(z.unknown()).optional(),
});

/**
 * Records one fact about an email.
 * - An internal caller (the email provider's callback, a scheduler) records
 *   provider, CRM or platform facts.
 * - A logged-in person can only record that they sent it themselves, or that
 *   they reconciled an unknown outcome. They can never record a provider fact.
 * Provider callbacks are idempotent on (provider, provider_event_id).
 */
export async function POST(req: Request, ctx: { params: { id: string } }) {
  const auth = await requirePermissionOrInternal(req, "send_proposal");
  if ("error" in auth) return auth.error;

  const parsed = bodySchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "Invalid payload", issues: parsed.error.issues }, { status: 400 });
  const body = parsed.data;

  const internal = auth.user === null;
  const source = internal ? body.source ?? "provider" : "manual";
  if (!SOURCE_EVENT_TYPES[source].includes(body.event_type)) {
    return NextResponse.json(
      { error: internal ? `A "${source}" source cannot record "${body.event_type}".` : `A person can only record "manually_reported_sent" or "reconciled", not "${body.event_type}".` },
      { status: 403 },
    );
  }

  // Reconciling must say what happened, otherwise "reconciled" could quietly allow a duplicate send.
  const reconcileOutcome = body.detail?.outcome;
  if (!internal && body.event_type === "reconciled" && reconcileOutcome !== "not_sent" && reconcileOutcome !== "was_sent") {
    return NextResponse.json({ error: 'Reconciling requires detail.outcome: "not_sent" (nothing went out) or "was_sent" (it did).' }, { status: 400 });
  }

  const sb = supabaseAdmin();
  const current = await loadDelivery(sb, internal ? null : auth.user!.tenant_id, ctx.params.id);
  if (!current) return NextResponse.json({ error: "Email not found" }, { status: 404 });

  const result = await recordMessageEvent(sb, current.tenantId, ctx.params.id, {
    event_type: body.event_type,
    source,
    provider: body.provider ?? null,
    provider_event_id: body.provider_event_id ?? null,
    provider_receipt_id: body.provider_receipt_id ?? null,
    actor_user_id: auth.user?.id ?? null,
    actor_email: auth.user?.email ?? null,
    occurred_at: body.occurred_at,
    detail: body.detail,
  });
  if (!result.ok) {
    const status = result.skipped === "migration_missing" ? 503 : result.skipped === "invalid" ? 403 : 500;
    return NextResponse.json({ error: result.error ?? "Could not record event", migration_needed: result.skipped === "migration_missing" || undefined }, { status });
  }

  // "It was sent" is itself a fact worth keeping: record who said so.
  if (!internal && body.event_type === "reconciled" && reconcileOutcome === "was_sent") {
    await recordMessageEvent(sb, current.tenantId, ctx.params.id, {
      event_type: "manually_reported_sent",
      source: "manual",
      actor_user_id: auth.user?.id ?? null,
      actor_email: auth.user?.email ?? null,
      detail: { via: "reconciliation" },
    });
  }

  if (!result.duplicate && body.event_type === "bounced") {
    const { data: bounced } = await sb.from("emails").select("recipient").eq("id", ctx.params.id).eq("tenant_id", current.tenantId).maybeSingle();
    if (bounced?.recipient) {
      await recordChannelCheck(sb, current.tenantId, { channel: "email", value: bounced.recipient as string, outcome: "bounced", method: "delivery_event", checkedBy: body.provider ?? "provider", note: `Bounce reported for email ${ctx.params.id}` });
    }
  }

  if (!result.duplicate) {
    await recordAudit({ actor: userOrService(auth.user, req, body.provider ? `${body.provider} delivery events` : null),
      entity_type: "email",
      entity_id: ctx.params.id,
      action: `email.delivery.${body.event_type}`,
      actor_email: auth.user?.email ?? null,
      tenant_id: current.tenantId,
      metadata: { source, provider: body.provider ?? null, actor_user_id: auth.user?.id ?? null },
    });
  }

  const after = await loadDelivery(sb, current.tenantId, ctx.params.id);
  return NextResponse.json({ recorded: !result.duplicate, duplicate: result.duplicate, delivery: after?.view });
}
