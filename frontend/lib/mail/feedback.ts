import { recordSuppression } from "@/lib/contacts/store";
import { CORITIBA_TENANT_ID } from "@/lib/tenants/types";

type Sb = any;

export type FeedbackKind = "bounce" | "transient_bounce" | "complaint" | "delivery" | "reject" | "delay" | "other";
export interface FeedbackEvent { kind: FeedbackKind; raw: string; messageId: string | null; recipients: string[]; bounceType: string | null }

const lower = (v: unknown) => (typeof v === "string" ? v.trim().toLowerCase() : "");
const emailsOf = (list: unknown, key: string) => (Array.isArray(list) ? list.map((r) => lower((r as Record<string, unknown>)?.[key])).filter((e) => e.includes("@")) : []);

/** Reads an Amazon SES event as published to SNS: the event-publishing format (eventType) and the older one (notificationType). */
export function parseSesEvent(message: string): FeedbackEvent | null {
  let j: any;
  try { j = JSON.parse(message); } catch { return null; }
  if (!j || typeof j !== "object") return null;
  const type = String(j.eventType ?? j.notificationType ?? "");
  const messageId = typeof j.mail?.messageId === "string" ? j.mail.messageId : null;
  const dest = Array.isArray(j.mail?.destination) ? j.mail.destination.map(lower).filter((e: string) => e.includes("@")) : [];
  switch (type) {
    case "Bounce": {
      const permanent = j.bounce?.bounceType === "Permanent";
      return { kind: permanent ? "bounce" : "transient_bounce", raw: type, messageId, recipients: emailsOf(j.bounce?.bouncedRecipients, "emailAddress"), bounceType: j.bounce?.bounceType ?? null };
    }
    case "Complaint":
      return { kind: "complaint", raw: type, messageId, recipients: emailsOf(j.complaint?.complainedRecipients, "emailAddress"), bounceType: j.complaint?.complaintFeedbackType ?? null };
    case "Delivery":
      return { kind: "delivery", raw: type, messageId, recipients: Array.isArray(j.delivery?.recipients) ? j.delivery.recipients.map(lower) : dest, bounceType: null };
    case "Reject":
      return { kind: "reject", raw: type, messageId, recipients: dest, bounceType: null };
    case "DeliveryDelay":
      return { kind: "delay", raw: type, messageId, recipients: emailsOf(j.deliveryDelay?.delayedRecipients, "emailAddress").length ? emailsOf(j.deliveryDelay?.delayedRecipients, "emailAddress") : dest, bounceType: j.deliveryDelay?.delayType ?? null };
    default:
      return { kind: "other", raw: type || "unknown", messageId, recipients: dest, bounceType: null };
  }
}

export interface FeedbackResult { duplicate: boolean; suppressed: number; updated: number }

/**
 * Records one provider event and acts on it: a permanent bounce or a complaint puts the address on the do-not-contact list
 * (so no newsletter, outreach or sequence mails it again), and the recipient's delivery row shows what happened.
 * The provider's message id is stored first, so a message SNS sends twice does nothing the second time.
 */
export async function applyFeedback(sb: Sb, snsMessageId: string, ev: FeedbackEvent, payload: unknown): Promise<FeedbackResult> {
  const out: FeedbackResult = { duplicate: false, suppressed: 0, updated: 0 };

  // Which club does this belong to? The delivery row knows; anything else (a portal login mail) is the default club.
  let tenantId = CORITIBA_TENANT_ID;
  if (ev.messageId) {
    const { data: d } = await sb.from("newsletter_deliveries").select("tenant_id").eq("provider_message_id", ev.messageId).limit(1);
    if (d?.[0]?.tenant_id) tenantId = d[0].tenant_id;
  }

  const { error } = await sb.from("mail_feedback_events").insert({
    tenant_id: tenantId, sns_message_id: snsMessageId, event_type: ev.raw, recipient: ev.recipients[0] ?? null,
    provider_message_id: ev.messageId, bounce_type: ev.bounceType, payload: payload ?? {},
  });
  if (error) {
    if (error.code === "23505") return { ...out, duplicate: true };
    throw new Error(`could not record the event: ${error.message}`);
  }

  const now = new Date().toISOString();
  const touch = async (recipient: string, patch: Record<string, unknown>, onlyFrom?: string[]) => {
    if (!ev.messageId) return;
    let q = sb.from("newsletter_deliveries").update({ ...patch, last_event_at: now }).eq("provider_message_id", ev.messageId).eq("email", recipient);
    if (onlyFrom) q = q.in("status", onlyFrom);
    const { data } = await q.select("id");
    out.updated += data?.length ?? 0;
  };

  for (const email of ev.recipients) {
    if (ev.kind === "bounce" || ev.kind === "complaint") {
      const r = await recordSuppression(sb, tenantId, {
        email, decision: "suppressed", reasonCode: ev.kind === "bounce" ? "bounce" : "complaint",
        note: ev.kind === "bounce" ? "Permanent bounce reported by Amazon SES" : "Spam complaint reported by Amazon SES",
        actor: { kind: "system", name: "amazon-ses" }, source: "ses_feedback",
      });
      if (r.ok && !r.value.already) out.suppressed++;
      await touch(email, { status: ev.kind === "bounce" ? "bounced" : "complained", error: ev.kind === "bounce" ? "Permanent bounce" : "Complaint" });
    } else if (ev.kind === "delivery") {
      // Never move a recipient back from bounced/complained to delivered when events arrive out of order.
      await touch(email, { status: "delivered", delivered_at: now }, ["accepted"]);
    } else if (ev.kind === "reject") {
      await touch(email, { status: "failed", error: "Rejected by Amazon SES" }, ["queued", "accepted"]);
    } else {
      await touch(email, {});
    }
  }
  return out;
}
