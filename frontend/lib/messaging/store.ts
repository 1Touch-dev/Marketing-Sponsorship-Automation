import { isMissingMigration } from "../proposals/revision-store";
import { baselineEvents, deriveDeliveryState, type DeliveryView, type MessageEvent, type MessageEventSource, type MessageEventType } from "./delivery-state";

type Sb = any;

/** Which kinds of event each source may record: a person can never forge a provider fact. */
export const SOURCE_EVENT_TYPES: Record<MessageEventSource, MessageEventType[]> = {
  platform: ["content_approved", "send_attempted", "outcome_unknown", "opened", "clicked"],
  crm: ["crm_activity_recorded", "crm_activity_failed"],
  provider: ["provider_accepted", "delivered", "opened", "clicked", "bounced", "failed", "outcome_unknown"],
  manual: ["manually_reported_sent", "reconciled"],
};

export type NewMessageEvent = {
  event_type: MessageEventType;
  source: MessageEventSource;
  provider?: string | null;
  provider_event_id?: string | null;
  provider_receipt_id?: string | null;
  actor_user_id?: string | null;
  actor_email?: string | null;
  occurred_at?: string;
  detail?: Record<string, unknown>;
};

export type RecordResult =
  | { ok: true; duplicate: boolean }
  | { ok: false; skipped: "migration_missing" | "invalid" | "error"; error?: string };

export async function recordMessageEvent(sb: Sb, tenantId: string, emailId: string, ev: NewMessageEvent): Promise<RecordResult> {
  if (!SOURCE_EVENT_TYPES[ev.source]?.includes(ev.event_type)) {
    return { ok: false, skipped: "invalid", error: `A "${ev.source}" source cannot record "${ev.event_type}"` };
  }
  const { error } = await sb.from("message_events").insert({
    tenant_id: tenantId,
    email_id: emailId,
    event_type: ev.event_type,
    source: ev.source,
    provider: ev.provider ?? null,
    provider_event_id: ev.provider_event_id ?? null,
    provider_receipt_id: ev.provider_receipt_id ?? null,
    actor_user_id: ev.actor_user_id ?? null,
    actor_email: ev.actor_email ?? null,
    occurred_at: ev.occurred_at ?? new Date().toISOString(),
    detail: ev.detail ?? {},
  });
  if (!error) return { ok: true, duplicate: false };
  if (error.code === "23505") return { ok: true, duplicate: true };
  return isMissingMigration(error) ? { ok: false, skipped: "migration_missing" } : { ok: false, skipped: "error", error: error.message };
}

/** For call sites where recording a fact must never break the action it describes. */
export async function recordMessageEventSafe(sb: Sb, tenantId: string, emailId: string, ev: NewMessageEvent): Promise<void> {
  try {
    const r = await recordMessageEvent(sb, tenantId, emailId, ev);
    if (!r.ok && r.skipped === "error") console.error("[message_events] could not record", ev.event_type, r.error);
  } catch (err) {
    console.error("[message_events] could not record", ev.event_type, err);
  }
}

export async function loadDelivery(
  sb: Sb,
  tenantId: string | null,
  emailId: string,
): Promise<{ tenantId: string; events: Array<MessageEvent & { id?: string; provider?: string | null; detail?: unknown }>; view: DeliveryView } | null> {
  let q = sb.from("emails").select("id, tenant_id, created_at, approved_at, sent_at, status").eq("id", emailId);
  if (tenantId) q = q.eq("tenant_id", tenantId);
  const { data: email } = await q.maybeSingle();
  if (!email) return null;

  const { data: rows, error } = await sb
    .from("message_events")
    .select("id, event_type, source, provider, provider_receipt_id, actor_email, occurred_at, detail")
    .eq("email_id", emailId)
    .order("occurred_at", { ascending: true });
  const recorded = (error ? [] : rows ?? []) as Array<MessageEvent & { id?: string }>;

  const all = [...baselineEvents(email as never, recorded), ...recorded];
  return { tenantId: (email as { tenant_id: string }).tenant_id, events: recorded, view: deriveDeliveryState(all) };
}
