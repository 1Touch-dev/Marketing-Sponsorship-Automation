import assert from "node:assert/strict";
import test from "node:test";
import { baselineEvents, deriveDeliveryState, type MessageEvent } from "../lib/messaging/delivery-state";
import { advanceSignerStatus, deriveSignatureState } from "../lib/contracts/signature-state";

const ev = (event_type: MessageEvent["event_type"], at: string, extra: Partial<MessageEvent> = {}): MessageEvent => ({
  event_type, source: "platform", occurred_at: `2026-10-05T10:${at}:00Z`, ...extra,
});

test("a draft is just a draft; approval is a separate fact", () => {
  assert.equal(deriveDeliveryState([ev("draft_created", "00")]).state, "draft_created");
  assert.equal(deriveDeliveryState([ev("draft_created", "00"), ev("content_approved", "01")]).state, "content_approved");
});

test("CRM logging is not delivery: it says so and is not provider-verified", () => {
  const v = deriveDeliveryState([ev("draft_created", "00"), ev("content_approved", "01"), ev("crm_activity_recorded", "02", { source: "crm" })]);
  assert.equal(v.state, "crm_activity_recorded");
  assert.equal(v.verified, false);
  assert.match(v.label, /not sent by this platform/i);
});

test("provider facts climb the ladder: accepted, delivered, opened", () => {
  const base = [ev("content_approved", "01"), ev("crm_activity_recorded", "02", { source: "crm" })];
  const at = (t: MessageEvent["event_type"], m: string) => ev(t, m, { source: "provider" });
  assert.equal(deriveDeliveryState([...base, at("provider_accepted", "03")]).state, "provider_accepted");
  assert.equal(deriveDeliveryState([...base, at("provider_accepted", "03"), at("delivered", "04")]).state, "delivered");
  const opened = deriveDeliveryState([...base, at("provider_accepted", "03"), at("delivered", "04"), at("opened", "05")]);
  assert.equal(opened.state, "opened");
  assert.equal(opened.verified, true);
});

test("events that arrive out of order give the same answer", () => {
  const a = ev("provider_accepted", "03", { source: "provider" }), d = ev("delivered", "04", { source: "provider" }), o = ev("opened", "05", { source: "provider" });
  assert.equal(deriveDeliveryState([o, a, d]).state, "opened");
  assert.equal(deriveDeliveryState([d, o, a]).state, "opened");
});

test("a timeout is 'outcome unknown' and blocks a second send until reconciled", () => {
  const events = [ev("content_approved", "01"), ev("send_attempted", "02"), ev("outcome_unknown", "03")];
  const v = deriveDeliveryState(events);
  assert.equal(v.state, "outcome_unknown");
  assert.equal(v.canSend, false);
  assert.match(v.blockedReason ?? "", /twice/);
  const resolved = deriveDeliveryState([...events, ev("provider_accepted", "04", { source: "provider" })]);
  assert.equal(resolved.state, "provider_accepted");
  const reconciledFailed = deriveDeliveryState([...events, ev("reconciled", "04", { source: "manual" }), ev("failed", "05", { source: "provider" })]);
  assert.equal(reconciledFailed.state, "failed");
  assert.equal(reconciledFailed.canSend, true);
});

test("a bounce after delivery wins; a later delivery overrides an earlier bounce", () => {
  const p = (t: MessageEvent["event_type"], m: string) => ev(t, m, { source: "provider" });
  assert.equal(deriveDeliveryState([p("provider_accepted", "01"), p("delivered", "02"), p("bounced", "03")]).state, "bounced");
  assert.equal(deriveDeliveryState([p("provider_accepted", "01"), p("bounced", "02"), p("delivered", "03")]).state, "delivered");
});

test("a person reporting a send is recorded but never counts as provider-verified", () => {
  const v = deriveDeliveryState([ev("content_approved", "01"), ev("manually_reported_sent", "02", { source: "manual", actor_email: "ana@club.com" })]);
  assert.equal(v.state, "reported_sent_unverified");
  assert.equal(v.verified, false);
  assert.match(v.label, /ana@club.com/);
  assert.equal(v.canSend, false);
});

test("older rows marked sent get a truthful CRM-only baseline", () => {
  const events = baselineEvents({ created_at: "2026-05-13T10:00:00Z", approved_at: "2026-05-13T10:05:00Z", sent_at: "2026-05-13T10:06:00Z", status: "sent" }, []);
  assert.equal(deriveDeliveryState(events).state, "crm_activity_recorded");
  const withReal = baselineEvents({ created_at: "2026-05-13T10:00:00Z", sent_at: "2026-05-13T10:06:00Z", status: "sent" }, [ev("crm_activity_failed", "06", { source: "crm" })]);
  assert.equal(withReal.some((e) => e.event_type === "crm_activity_recorded"), false);
});

test("CRM logging failure is its own state and does not block a retry", () => {
  const v = deriveDeliveryState([ev("content_approved", "01"), ev("crm_activity_failed", "02", { source: "crm" })]);
  assert.equal(v.state, "crm_logging_failed");
  assert.equal(v.canSend, true);
});

test("signer status only moves forward and is final once signed or declined", () => {
  assert.equal(advanceSignerStatus("sent", "opened"), "opened");
  assert.equal(advanceSignerStatus("opened", "sent"), "opened");
  assert.equal(advanceSignerStatus("signed", "opened"), "signed");
  assert.equal(advanceSignerStatus("declined", "signed"), "declined");
});

test("one signer signing a two-signer contract is partial, never complete", () => {
  const a = { email: "a@x.com", required: true, status: "signed" as const };
  const b = { email: "b@x.com", required: true, status: "opened" as const };
  const v = deriveSignatureState([a, b], "PENDING");
  assert.equal(v.state, "partially_signed");
  assert.deepEqual([v.signed, v.required, v.waitingOn], [1, 2, ["b@x.com"]]);
  assert.equal(deriveSignatureState([a, { ...b, status: "signed" }], "COMPLETED").state, "completed");
});

test("signature states: not sent, awaiting, declined, cancelled, viewers ignored", () => {
  const s = (email: string, status: "pending" | "sent" | "opened" | "signed" | "declined", required = true) => ({ email, required, status });
  assert.equal(deriveSignatureState([]).state, "not_sent");
  assert.equal(deriveSignatureState([s("a", "pending")]).state, "not_sent");
  assert.equal(deriveSignatureState([s("a", "sent")], "PENDING").state, "awaiting_signatures");
  assert.equal(deriveSignatureState([s("a", "signed"), s("b", "declined")]).state, "declined");
  assert.equal(deriveSignatureState([s("a", "sent")], "CANCELLED").state, "cancelled");
  assert.equal(deriveSignatureState([s("a", "signed"), s("viewer", "sent", false)]).state, "completed");
});

test("a provider that says completed while signers disagree is trusted but flagged", () => {
  const v = deriveSignatureState([{ email: "a", required: true, status: "signed" }, { email: "b", required: true, status: "sent" }], "COMPLETED");
  assert.equal(v.state, "completed");
  assert.match(v.anomaly ?? "", /not every required signer/);
});

import { signerEventFromRecipient } from "../lib/contracts/signature-state";

test("provider recipients map to one progress fact each, with viewers not required", () => {
  const base = { email: "a@x.com", name: "A", role: "SIGNER", readStatus: "NOT_OPENED", signingStatus: "NOT_SIGNED", sendStatus: "NOT_SENT" };
  assert.equal(signerEventFromRecipient(base).status, "pending");
  assert.equal(signerEventFromRecipient({ ...base, sendStatus: "SENT" }).status, "sent");
  assert.equal(signerEventFromRecipient({ ...base, sendStatus: "SENT", readStatus: "OPENED" }).status, "opened");
  const signed = signerEventFromRecipient({ ...base, sendStatus: "SENT", readStatus: "OPENED", signingStatus: "SIGNED", signedAt: "2026-10-05T10:00:00Z", id: 7 });
  assert.deepEqual([signed.status, signed.at, signed.provider_recipient_id, signed.required], ["signed", "2026-10-05T10:00:00Z", "7", true]);
  assert.equal(signerEventFromRecipient({ ...base, signingStatus: "REJECTED", rejectionReason: "wrong terms" }).status, "declined");
  const viewer = signerEventFromRecipient({ ...base, role: "VIEWER", sendStatus: "SENT" });
  assert.deepEqual([viewer.role, viewer.required], ["viewer", false]);
});
