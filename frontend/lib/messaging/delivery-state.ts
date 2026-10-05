/**
 * What actually happened to an email, derived from independent facts instead
 * of one ambiguous "sent". Each fact is recorded once, by whoever can vouch
 * for it: the platform (approval), the CRM (activity logged), an email
 * provider (accepted, delivered, opened, bounced) or a person (reported).
 */
export type MessageEventType =
  | "draft_created"
  | "content_approved"
  | "crm_activity_recorded"
  | "crm_activity_failed"
  | "send_attempted"
  | "provider_accepted"
  | "delivered"
  | "opened"
  | "clicked"
  | "bounced"
  | "failed"
  | "outcome_unknown"
  | "manually_reported_sent"
  | "reconciled";

export type MessageEventSource = "platform" | "crm" | "provider" | "manual";

export type MessageEvent = {
  event_type: MessageEventType;
  source: MessageEventSource;
  occurred_at: string;
  actor_email?: string | null;
  provider_receipt_id?: string | null;
};

export type DeliveryState =
  | "draft_created"
  | "content_approved"
  | "crm_logging_failed"
  | "crm_activity_recorded"
  | "reported_sent_unverified"
  | "provider_accepted"
  | "delivered"
  | "opened"
  | "bounced"
  | "failed"
  | "outcome_unknown";

export type DeliveryView = {
  state: DeliveryState;
  label: string;
  /** confirmed by something outside this platform's own bookkeeping: an email provider, or the recipient's own mail client (open pixel) */
  verified: boolean;
  canSend: boolean;
  blockedReason: string | null;
  reached: Partial<Record<MessageEventType, string>>;
};

const RESOLVES_UNKNOWN: MessageEventType[] = [
  "provider_accepted", "delivered", "opened", "clicked", "failed", "bounced", "reconciled", "manually_reported_sent",
];

const PROVIDER_LEVEL: Partial<Record<MessageEventType, number>> = {
  provider_accepted: 1,
  delivered: 2,
  opened: 3,
  clicked: 3,
};

/** Facts already on the email row, as events, so older emails get a truthful state too. */
export function baselineEvents(
  email: { created_at: string; approved_at?: string | null; sent_at?: string | null; status?: string | null },
  recorded: MessageEvent[],
): MessageEvent[] {
  const out: MessageEvent[] = [{ event_type: "draft_created", source: "platform", occurred_at: email.created_at }];
  if (email.approved_at) out.push({ event_type: "content_approved", source: "platform", occurred_at: email.approved_at });
  const hasCrmFact = recorded.some((e) => e.event_type === "crm_activity_recorded" || e.event_type === "crm_activity_failed");
  // Before delivery events existed, "sent" only ever meant the CRM activity was logged.
  if (email.status === "sent" && email.sent_at && !hasCrmFact) {
    out.push({ event_type: "crm_activity_recorded", source: "crm", occurred_at: email.sent_at });
  }
  return out;
}

export const STATE_LABELS: Record<DeliveryState, string> = {
  draft_created: "Draft created",
  content_approved: "Content approved",
  crm_logging_failed: "Approved — CRM logging failed",
  crm_activity_recorded: "Logged in the CRM — not sent by this platform",
  reported_sent_unverified: "Reported as sent — not provider-verified",
  provider_accepted: "Accepted by the email provider",
  delivered: "Delivered",
  opened: "Opened",
  bounced: "Bounced",
  failed: "Send failed",
  outcome_unknown: "Outcome unknown — reconciling",
};

export function deriveDeliveryState(input: MessageEvent[]): DeliveryView {
  // Stable sort by time; events can arrive out of order.
  const events = input
    .map((e, i) => ({ e, i }))
    .sort((a, b) => Date.parse(a.e.occurred_at) - Date.parse(b.e.occurred_at) || a.i - b.i)
    .map((x) => x.e);

  const reached: Partial<Record<MessageEventType, string>> = {};
  for (const e of events) if (!reached[e.event_type]) reached[e.event_type] = e.occurred_at;

  const lastIndex = (pred: (e: MessageEvent) => boolean) => {
    for (let i = events.length - 1; i >= 0; i--) if (pred(events[i])) return i;
    return -1;
  };

  const unknownAt = lastIndex((e) => e.event_type === "outcome_unknown");
  const unknownResolved = unknownAt >= 0 && events.slice(unknownAt + 1).some((e) => RESOLVES_UNKNOWN.includes(e.event_type));
  const lastPositive = lastIndex((e) => (PROVIDER_LEVEL[e.event_type] ?? 0) > 0);
  const lastNegative = lastIndex((e) => e.event_type === "bounced" || e.event_type === "failed");
  const providerLevel = events.reduce((m, e) => Math.max(m, PROVIDER_LEVEL[e.event_type] ?? 0), 0);
  const reporter = events.find((e) => e.event_type === "manually_reported_sent");

  let state: DeliveryState;
  if (unknownAt >= 0 && !unknownResolved) state = "outcome_unknown";
  else if (lastNegative > lastPositive) state = events[lastNegative].event_type === "bounced" ? "bounced" : "failed";
  else if (providerLevel >= 3) state = "opened";
  else if (providerLevel === 2) state = "delivered";
  else if (providerLevel === 1) state = "provider_accepted";
  else if (reporter) state = "reported_sent_unverified";
  else if (reached.crm_activity_recorded) state = "crm_activity_recorded";
  else if (reached.crm_activity_failed) state = "crm_logging_failed";
  else if (reached.content_approved) state = "content_approved";
  else state = "draft_created";

  let label: string = STATE_LABELS[state];
  if (state === "reported_sent_unverified" && reporter?.actor_email) {
    label = `Reported as sent by ${reporter.actor_email} — not provider-verified`;
  }

  let blockedReason: string | null = null;
  if (state === "outcome_unknown") {
    blockedReason = "The outcome of the previous send is unknown. Reconcile it first, so the recipient is not contacted twice.";
  } else if (state === "provider_accepted" || state === "delivered" || state === "opened") {
    blockedReason = "The email provider already has this message.";
  } else if (state === "reported_sent_unverified") {
    blockedReason = "Someone reported sending this already.";
  } else if (state === "crm_activity_recorded") {
    blockedReason = "Already logged as sent.";
  }

  return {
    state,
    label,
    verified: state === "provider_accepted" || state === "delivered" || state === "opened",
    canSend: blockedReason === null,
    blockedReason,
    reached,
  };
}
