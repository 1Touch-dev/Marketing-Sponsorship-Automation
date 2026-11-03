import assert from "node:assert/strict";
import test from "node:test";
import { freshDb } from "./harness";
import { pgClient } from "../helpers/pg-from";
import { fakeSes } from "../helpers/fake-ses";
import { resetSesClientForTests, sendViaSes, MailError } from "../../lib/mail/ses";
import { dispatchNewsletter, dueNewsletterIds, queueNewsletter, STALE_SENDING_MINUTES } from "../../lib/mail/newsletter";
import { applyFeedback, parseSesEvent } from "../../lib/mail/feedback";
import { verifyUnsubscribeToken } from "../../lib/mail/unsubscribe";
import { recordSuppression } from "../../lib/contacts/store";

const T = "00000000-0000-0000-0000-000000000001";
const APP = "https://sponsorship.coritiba.com.br";
import fs from "node:fs";
import path from "node:path";
const standing = fs.readFileSync(path.join(__dirname, "../../../supabase/migrations/0062_contact_standing.sql"), "utf8");
const table = (name: string) => standing.match(new RegExp(`CREATE TABLE IF NOT EXISTS public\\.${name} \\([\\s\\S]*?\\n\\);`))![0];
const seed = `
  ${table("contact_channel_checks")}
  ${table("contact_suppressions")}
  INSERT INTO public.tenants (id, slug, name) VALUES ('${T}', 'coritiba', 'Coritiba') ON CONFLICT DO NOTHING;
  ALTER TABLE public.contacts ADD COLUMN email text, ADD COLUMN department text;

  CREATE TABLE public.newsletters (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), subject text NOT NULL, body_html text, recipient_count integer DEFAULT 0,
    recipient_emails jsonb DEFAULT '[]'::jsonb, status text NOT NULL DEFAULT 'draft', sent_at timestamptz, created_at timestamptz DEFAULT now(),
    tenant_id uuid NOT NULL DEFAULT '${T}' REFERENCES public.tenants(id));
`;
const MIG = ["0077_mail_delivery.sql"];

async function world() {
  process.env.SES_ENDPOINT = "";
  const ses = await fakeSes();
  process.env.SES_ENDPOINT = ses.url;
  process.env.UNSUBSCRIBE_SECRET = "a-test-secret-of-sufficient-length";
  process.env.MAIL_REPLY_TO = "patrocinio@coritiba.com.br";
  resetSesClientForTests();
  let db;
  try { db = await freshDb(MIG, { seed }); } catch (e) { await ses.close(); throw e; } // never leave the stand-in server open: it would keep the test process alive
  // PostgREST hands back timestamps as ISO strings; PGlite hands back Dates. The stores read them as strings.
  const asIso: any = new Proxy(db, { get: (t: any, k) => k === "query" ? async (...a: any[]) => { const r = await t.query(...a); r.rows = r.rows.map((row: any) => Object.fromEntries(Object.entries(row).map(([c, v]) => [c, v instanceof Date ? v.toISOString() : v]))); return r; } : t[k] });
  const sb = pgClient(asIso);
  const q = (allowed: string[], o: Partial<Parameters<typeof queueNewsletter>[1]> = {}) =>
    queueNewsletter(sb, { tenantId: T, subject: "Olá", html: "<p>Oi</p>", allowed, skipped: [], sendAt: null, createdBy: "admin@club.com", replyTo: "rep@club.com", ...o });
  const rows = async (id: string) => ((await db.query("SELECT email, status, provider_message_id, error, attempts, skip_reason FROM public.newsletter_deliveries WHERE newsletter_id = $1 ORDER BY email", [id])).rows as any[]);
  const nl = async (id: string) => (await db.query("SELECT status, sent_at, finished_at, started_at, scheduled_for, reply_to, from_address FROM public.newsletters WHERE id = $1", [id])).rows[0] as any;
  const done = async () => { resetSesClientForTests(); await ses.close(); };
  return { db, sb, ses, q, rows, nl, done };
}
const run = (sb: any, id: string, o: Record<string, unknown> = {}) => dispatchNewsletter(sb, { newsletterId: id, send: sendViaSes, appUrl: APP, retryDelaysMs: [1, 1], ...o });

test("queueing writes the newsletter and one row per person, and sends nothing", async () => {
  const w = await world();
  try {
    const n = await w.q(["a@x.com", "b@x.com"], { skipped: [{ email: "Out@x.com", reason: "asked us to stop" }] });
    assert.equal(w.ses.seen.length, 0);
    assert.equal(n.status, "scheduled");
    assert.deepEqual((await w.rows(n.id)).map((r) => `${r.email}:${r.status}`), ["a@x.com:queued", "b@x.com:queued", "out@x.com:skipped"]);
    const row = await w.nl(n.id);
    assert.equal(row.from_address, "patrocinio@mail.sponsorship.coritiba.com.br");
    assert.equal(row.reply_to, "rep@club.com");
  } finally { await w.done(); }
});

test("dispatch sends each person their own mail, marks it accepted with Amazon's id, and the newsletter sent", async () => {
  const w = await world();
  try {
    const n = await w.q(["a@x.com", "b@x.com", "c@x.com"]);
    const r = await run(w.sb, n.id);
    assert.deepEqual({ claimed: r.claimed, accepted: r.accepted, failed: r.failed, skipped: r.skipped, status: r.status }, { claimed: true, accepted: 3, failed: 0, skipped: 0, status: "sent" });
    const rows = await w.rows(n.id);
    assert.deepEqual(rows.map((x) => x.status), ["accepted", "accepted", "accepted"]);
    assert.deepEqual(rows.map((x) => x.provider_message_id), ["fake-msg-1", "fake-msg-2", "fake-msg-3"]);
    assert.equal(w.ses.seen.length, 3);
    const to = w.ses.seen.map((s) => s.body.Destination.ToAddresses[0]);
    assert.deepEqual(to.sort(), ["a@x.com", "b@x.com", "c@x.com"]);
    for (const s of w.ses.seen) {
      const url = s.body.Content.Simple.Headers.find((h: any) => h.Name === "List-Unsubscribe").Value.slice(1, -1);
      assert.deepEqual(verifyUnsubscribeToken(new URL(url).searchParams.get("t")), { tenantId: T, email: s.body.Destination.ToAddresses[0] }, "each copy has the link for its own address");
      assert.deepEqual(s.body.ReplyToAddresses, ["rep@club.com"]);
    }
    const row = await w.nl(n.id);
    assert.equal(row.status, "sent");
    assert.ok(row.sent_at && row.finished_at);
  } finally { await w.done(); }
});

test("someone who unsubscribed after it was queued is skipped, not mailed", async () => {
  const w = await world();
  try {
    const n = await w.q(["a@x.com", "gone@x.com"]);
    const s = await recordSuppression(w.sb, T, { email: "gone@x.com", decision: "suppressed", reasonCode: "asked_to_stop", note: "unsubscribed", actor: { kind: "system", name: "t" }, source: "t" });
    assert.ok(s.ok);
    const r = await run(w.sb, n.id);
    assert.deepEqual({ accepted: r.accepted, skipped: r.skipped, status: r.status }, { accepted: 1, skipped: 1, status: "sent" });
    assert.deepEqual(w.ses.seen.map((x) => x.body.Destination.ToAddresses[0]), ["a@x.com"]);
    const rows = await w.rows(n.id);
    assert.equal(rows.find((x) => x.email === "gone@x.com")!.status, "skipped");
  } finally { await w.done(); }
});

test("throttling is retried and succeeds; a rejection fails that one person and the newsletter is partial", async () => {
  const w = await world();
  await w.ses.close();
  const ses = await fakeSes({ fail: (to, attempt) => (to === "slow@x.com" && attempt < 3 ? { status: 400, name: "TooManyRequestsException", message: "slow" } : to === "bad@x.com" ? { status: 400, name: "MessageRejected", message: "Email address is not verified." } : null) });
  process.env.SES_ENDPOINT = ses.url; resetSesClientForTests();
  try {
    const n = await w.q(["ok@x.com", "slow@x.com", "bad@x.com"]);
    const r = await run(w.sb, n.id, { send: async (m: any) => { try { return await sendViaSes(m); } catch (e) { throw e; } } });
    assert.deepEqual({ accepted: r.accepted, failed: r.failed, status: r.status }, { accepted: 2, failed: 1, status: "partial" });
    const rows = await w.rows(n.id);
    assert.equal(rows.find((x) => x.email === "bad@x.com")!.status, "failed");
    assert.match(rows.find((x) => x.email === "bad@x.com")!.error, /MessageRejected/);
    assert.equal(rows.find((x) => x.email === "bad@x.com")!.attempts, 1, "a rejection is not retried");
    assert.equal(rows.find((x) => x.email === "slow@x.com")!.status, "accepted");
  } finally { resetSesClientForTests(); await ses.close(); }
});

test("when nothing is accepted the newsletter is failed, never sent", async () => {
  const w = await world();
  try {
    const n = await w.q(["a@x.com", "b@x.com"]);
    const r = await run(w.sb, n.id, { send: async () => { throw new MailError("AccountSuspended", "AccountSuspendedException", false); } });
    assert.deepEqual({ accepted: r.accepted, failed: r.failed, status: r.status }, { accepted: 0, failed: 2, status: "failed" });
    assert.equal((await w.nl(n.id)).sent_at, null);
  } finally { await w.done(); }
});

test("two runs at once send each person once", async () => {
  const w = await world();
  try {
    const n = await w.q(["a@x.com", "b@x.com", "c@x.com", "d@x.com"]);
    const [x, y] = await Promise.all([run(w.sb, n.id), run(w.sb, n.id)]);
    assert.equal([x, y].filter((r) => r.claimed).length, 1);
    assert.equal(w.ses.seen.length, 4);
    const again = await run(w.sb, n.id);
    assert.equal(again.claimed, false, "a finished newsletter is not taken again");
    assert.equal(w.ses.seen.length, 4);
  } finally { await w.done(); }
});

test("a send cut off by a restart is picked up after a few minutes and only the unsent people are mailed", async () => {
  const w = await world();
  try {
    const n = await w.q(["a@x.com", "b@x.com"]);
    const t0 = new Date("2026-11-10T12:00:00Z");
    await w.db.query("UPDATE public.newsletters SET status='sending', started_at=$2 WHERE id=$1", [n.id, t0.toISOString()]);
    await w.db.query("UPDATE public.newsletter_deliveries SET status='accepted', provider_message_id='old-1' WHERE newsletter_id=$1 AND email='a@x.com'", [n.id]);
    const early = await run(w.sb, n.id, { now: new Date(t0.getTime() + (STALE_SENDING_MINUTES - 1) * 60_000) });
    assert.equal(early.claimed, false, "still being worked on");
    const late = await run(w.sb, n.id, { now: new Date(t0.getTime() + (STALE_SENDING_MINUTES + 1) * 60_000) });
    assert.deepEqual({ claimed: late.claimed, accepted: late.accepted, status: late.status }, { claimed: true, accepted: 1, status: "sent" });
    assert.deepEqual(w.ses.seen.map((x) => x.body.Destination.ToAddresses[0]), ["b@x.com"], "a@x.com was not mailed twice");
  } finally { await w.done(); }
});

test("scheduling: a future time waits; once it has come, it is due", async () => {
  const w = await world();
  try {
    const now = new Date("2026-11-10T12:00:00Z");
    const later = await w.q(["a@x.com"], { sendAt: new Date("2026-11-10T15:00:00Z"), now });
    const asap = await w.q(["b@x.com"], { sendAt: new Date("2026-11-09T00:00:00Z"), now });
    assert.deepEqual(await dueNewsletterIds(w.sb, now), [asap.id], "a time in the past means now");
    assert.deepEqual(await dueNewsletterIds(w.sb, new Date("2026-11-10T15:00:01Z")), [asap.id, later.id].sort((a, b) => 0), "both once the time has come");
    assert.equal(new Date((await w.nl(later.id)).scheduled_for).toISOString(), "2026-11-10T15:00:00.000Z");
  } finally { await w.done(); }
});

// ── what Amazon reports back ────────────────────────────────────────────────

const sesBounce = (messageId: string, to: string, type = "Permanent") => JSON.stringify({ eventType: "Bounce", mail: { messageId, destination: [to] }, bounce: { bounceType: type, bouncedRecipients: [{ emailAddress: to }] } });
const sesComplaint = (messageId: string, to: string) => JSON.stringify({ eventType: "Complaint", mail: { messageId, destination: [to] }, complaint: { complainedRecipients: [{ emailAddress: to }], complaintFeedbackType: "abuse" } });
const sesDelivery = (messageId: string, to: string) => JSON.stringify({ eventType: "Delivery", mail: { messageId, destination: [to] }, delivery: { recipients: [to] } });

test("parsing the events SES publishes, in both formats", () => {
  assert.deepEqual(parseSesEvent(sesBounce("m1", "A@X.com")), { kind: "bounce", raw: "Bounce", messageId: "m1", recipients: ["a@x.com"], bounceType: "Permanent" });
  assert.equal(parseSesEvent(sesBounce("m1", "a@x.com", "Transient"))!.kind, "transient_bounce");
  assert.equal(parseSesEvent(sesComplaint("m2", "a@x.com"))!.kind, "complaint");
  assert.equal(parseSesEvent(sesDelivery("m3", "a@x.com"))!.kind, "delivery");
  assert.equal(parseSesEvent(JSON.stringify({ notificationType: "Bounce", mail: { messageId: "m4" }, bounce: { bounceType: "Permanent", bouncedRecipients: [{ emailAddress: "z@x.com" }] } }))!.kind, "bounce", "the older identity-level format");
  assert.equal(parseSesEvent(JSON.stringify({ eventType: "Reject", mail: { messageId: "m5", destination: ["a@x.com"] } }))!.kind, "reject");
  assert.equal(parseSesEvent(JSON.stringify({ eventType: "Send", mail: { messageId: "m6" } }))!.kind, "other");
  assert.equal(parseSesEvent("not json"), null);
  assert.equal(parseSesEvent("null"), null);
});

test("a permanent bounce puts the address on the do-not-contact list and the next newsletter skips it", async () => {
  const w = await world();
  try {
    const n = await w.q(["a@x.com", "b@x.com"]);
    await run(w.sb, n.id);
    const idA = (await w.rows(n.id)).find((r) => r.email === "a@x.com")!.provider_message_id;
    const r = await applyFeedback(w.sb, "sns-1", parseSesEvent(sesBounce(idA, "a@x.com"))!, {});
    assert.deepEqual(r, { duplicate: false, suppressed: 1, updated: 1 });
    assert.equal((await w.rows(n.id)).find((x) => x.email === "a@x.com")!.status, "bounced");
    const sup = (await w.db.query("SELECT reason_code, actor_kind, source FROM public.contact_suppressions WHERE email='a@x.com'")).rows as any[];
    assert.deepEqual(sup, [{ reason_code: "bounce", actor_kind: "system", source: "ses_feedback" }]);

    const second = await w.q(["a@x.com", "b@x.com"]);
    const sent = w.ses.seen.length;
    await dispatchNewsletter(w.sb, { newsletterId: second.id, send: sendViaSes, appUrl: APP });
    assert.deepEqual(w.ses.seen.slice(sent).map((x) => x.body.Destination.ToAddresses[0]), ["b@x.com"], "the bounced address is not mailed again");
  } finally { await w.done(); }
});

test("a complaint suppresses too; the same SNS message twice does nothing the second time", async () => {
  const w = await world();
  try {
    const n = await w.q(["a@x.com"]);
    await run(w.sb, n.id);
    const id = (await w.rows(n.id))[0].provider_message_id;
    const ev = parseSesEvent(sesComplaint(id, "a@x.com"))!;
    assert.deepEqual(await applyFeedback(w.sb, "sns-2", ev, {}), { duplicate: false, suppressed: 1, updated: 1 });
    assert.deepEqual(await applyFeedback(w.sb, "sns-2", ev, {}), { duplicate: true, suppressed: 0, updated: 0 });
    assert.equal((await w.rows(n.id))[0].status, "complained");
    assert.equal(((await w.db.query("SELECT count(*)::int n FROM public.contact_suppressions WHERE email='a@x.com'")).rows[0] as any).n, 1);
  } finally { await w.done(); }
});

test("delivery events mark delivered, but never undo a bounce that arrived first", async () => {
  const w = await world();
  try {
    const n = await w.q(["a@x.com", "b@x.com"]);
    await run(w.sb, n.id);
    const rows = await w.rows(n.id);
    const idA = rows.find((r) => r.email === "a@x.com")!.provider_message_id, idB = rows.find((r) => r.email === "b@x.com")!.provider_message_id;
    await applyFeedback(w.sb, "d-1", parseSesEvent(sesDelivery(idB, "b@x.com"))!, {});
    await applyFeedback(w.sb, "b-1", parseSesEvent(sesBounce(idA, "a@x.com"))!, {});
    await applyFeedback(w.sb, "d-2", parseSesEvent(sesDelivery(idA, "a@x.com"))!, {});
    const after = await w.rows(n.id);
    assert.equal(after.find((r) => r.email === "b@x.com")!.status, "delivered");
    assert.equal(after.find((r) => r.email === "a@x.com")!.status, "bounced");
  } finally { await w.done(); }
});

test("a soft bounce is recorded but suppresses nobody; a bounce for mail we do not track still suppresses the address", async () => {
  const w = await world();
  try {
    assert.deepEqual(await applyFeedback(w.sb, "t-1", parseSesEvent(sesBounce("unknown-1", "soft@x.com", "Transient"))!, {}), { duplicate: false, suppressed: 0, updated: 0 });
    assert.equal(((await w.db.query("SELECT count(*)::int n FROM public.contact_suppressions")).rows[0] as any).n, 0);
    assert.deepEqual(await applyFeedback(w.sb, "p-1", parseSesEvent(sesBounce("portal-link-1", "Old@x.com"))!, {}), { duplicate: false, suppressed: 1, updated: 0 });
    assert.equal(((await w.db.query("SELECT email FROM public.contact_suppressions")).rows[0] as any).email, "old@x.com");
    assert.equal(((await w.db.query("SELECT count(*)::int n FROM public.mail_feedback_events")).rows[0] as any).n, 2);
  } finally { await w.done(); }
});
