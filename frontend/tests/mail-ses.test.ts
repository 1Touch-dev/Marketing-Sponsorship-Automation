import test from "node:test";
import assert from "node:assert/strict";
import { encodeDisplayName, fromFor, replyToFor, clubReplyTo, mailProvider } from "../lib/mail/config";
import { MailError, resetSesClientForTests, sendViaSes } from "../lib/mail/ses";
import { makeUnsubscribeToken, unsubscribeHeaders, unsubscribeUrl, verifyUnsubscribeToken } from "../lib/mail/unsubscribe";
import { buildNewsletterMail, htmlToText, parseSendTime } from "../lib/mail/newsletter";
import { fakeSes } from "./helpers/fake-ses";

const T = "00000000-0000-0000-0000-000000000001";
function env(vars: Record<string, string | undefined>) {
  const prev: Record<string, string | undefined> = {};
  for (const k of Object.keys(vars)) { prev[k] = process.env[k]; if (vars[k] === undefined) delete process.env[k]; else process.env[k] = vars[k]; }
  return () => { for (const k of Object.keys(prev)) { if (prev[k] === undefined) delete process.env[k]; else process.env[k] = prev[k]; } };
}

test("From addresses are always on the verified mail subdomain, with the club's name", () => {
  const undo = env({ MAIL_FROM_DOMAIN: undefined, MAIL_FROM_ADDRESS: undefined, MAIL_SYSTEM_FROM_ADDRESS: undefined, MAIL_FROM_NAME: undefined });
  try {
    assert.equal(fromFor("newsletter").address, "patrocinios@mail.sponsorship.coritiba.com.br");
    assert.equal(fromFor("outreach").address, "patrocinios@mail.sponsorship.coritiba.com.br");
    assert.equal(fromFor("system").address, "nao-responda@mail.sponsorship.coritiba.com.br");
    assert.equal(fromFor("newsletter", "Maria Silva").name, "Maria Silva");
    assert.match(fromFor("newsletter").header, /^=\?UTF-8\?B\?.+\?= <patrocinios@mail\.sponsorship\.coritiba\.com\.br>$/, "the accent in Patrocínios is encoded");
    assert.equal(Buffer.from(fromFor("newsletter").header.match(/\?B\?(.+)\?=/)![1], "base64").toString("utf8"), "Coritiba FC Patrocínios");
  } finally { undo(); }
});

test("a From address outside the verified domain is refused before anything is sent", () => {
  const undo = env({ MAIL_FROM_ADDRESS: "patrocinios@coritiba.com.br" });
  try { assert.throws(() => fromFor("newsletter"), /not on mail\.sponsorship\.coritiba\.com\.br/); } finally { undo(); }
});

test("display names: plain ASCII is quoted and escaped, others are encoded, line breaks cannot inject a header", () => {
  assert.equal(encodeDisplayName('Ana "A" Silva'), '"Ana \\"A\\" Silva"');
  assert.ok(encodeDisplayName("João").startsWith("=?UTF-8?B?"));
  assert.ok(!/[\r\n]/.test(encodeDisplayName("Evil\r\nBcc: x@y.z")));
});

test("reply-to: the person first, then the club mailbox, and never something that is not an address", () => {
  const undo = env({ MAIL_REPLY_TO: "patrocinios@coritiba.com.br" });
  try {
    assert.equal(replyToFor("Rep@Club.com"), "rep@club.com");
    assert.equal(replyToFor(null), "patrocinios@coritiba.com.br");
    assert.equal(clubReplyTo("rep@club.com"), "patrocinios@coritiba.com.br", "a newsletter is answered at the club's mailbox");
    assert.equal(replyToFor("not an address <x>"), "patrocinios@coritiba.com.br");
  } finally { undo(); }
  const undo2 = env({ MAIL_REPLY_TO: undefined });
  try {
    assert.equal(clubReplyTo("rep@club.com"), "rep@club.com", "until the mailbox exists, the sender");
    assert.equal(clubReplyTo(null), undefined);
  } finally { undo2(); }
});

test("MAIL_PROVIDER is ses only when it says so", () => {
  for (const [v, want] of [["ses", "ses"], ["SES", "ses"], [" ses ", "ses"], ["", "gmail"], [undefined, "gmail"], ["gmail", "gmail"], ["sesx", "gmail"]] as const) {
    const undo = env({ MAIL_PROVIDER: v });
    try { assert.equal(mailProvider(), want, String(v)); } finally { undo(); }
  }
});

test("sendViaSes sends the right request: From, Reply-To, both bodies, unsubscribe headers, a tag", async () => {
  const ses = await fakeSes();
  const undo = env({ SES_ENDPOINT: ses.url, MAIL_FROM_DOMAIN: undefined, MAIL_FROM_ADDRESS: undefined, MAIL_FROM_NAME: undefined, MAIL_REPLY_TO: "patrocinios@coritiba.com.br" });
  resetSesClientForTests();
  try {
    const r = await sendViaSes({ to: "alvo@empresa.com", subject: "Olá — newsletter", text: "texto", html: "<p>html</p>", kind: "newsletter", headers: unsubscribeHeaders("https://x.test/u?t=1"), tag: "newsletter" });
    assert.equal(r.messageId, "fake-msg-1");
    assert.equal(ses.seen.length, 1);
    const b = ses.seen[0].body;
    assert.equal(ses.seen[0].path, "/v2/email/outbound-emails");
    assert.deepEqual(b.Destination.ToAddresses, ["alvo@empresa.com"]);
    assert.match(b.FromEmailAddress, /<patrocinios@mail\.sponsorship\.coritiba\.com\.br>$/);
    assert.deepEqual(b.ReplyToAddresses, ["patrocinios@coritiba.com.br"]);
    assert.equal(b.Content.Simple.Subject.Data, "Olá — newsletter");
    assert.equal(b.Content.Simple.Body.Text.Data, "texto");
    assert.equal(b.Content.Simple.Body.Html.Data, "<p>html</p>");
    assert.deepEqual(b.Content.Simple.Headers, [{ Name: "List-Unsubscribe", Value: "<https://x.test/u?t=1>" }, { Name: "List-Unsubscribe-Post", Value: "List-Unsubscribe=One-Click" }]);
    assert.deepEqual(b.EmailTags, [{ Name: "kind", Value: "newsletter" }]);
    assert.equal(b.ConfigurationSetName, undefined, "the identity's default configuration set is used");
  } finally { undo(); resetSesClientForTests(); await ses.close(); }
});

test("SES errors become MailError, with throttling marked as worth retrying and a rejection not", async () => {
  const ses = await fakeSes({ fail: (to) => (to.startsWith("slow") ? { status: 400, name: "TooManyRequestsException", message: "slow down" } : { status: 400, name: "MessageRejected", message: "Email address is not verified." }) });
  const undo = env({ SES_ENDPOINT: ses.url });
  resetSesClientForTests();
  try {
    await assert.rejects(sendViaSes({ to: "slow@x.com", subject: "s", text: "t", kind: "system" }), (e: unknown) => e instanceof MailError && e.transient && e.code === "TooManyRequestsException");
    await assert.rejects(sendViaSes({ to: "no@x.com", subject: "s", text: "t", kind: "system" }), (e: unknown) => e instanceof MailError && !e.transient && e.code === "MessageRejected");
  } finally { undo(); resetSesClientForTests(); await ses.close(); }
});

test("unsubscribe links: signed, tamper-proof, tied to one address in one club", () => {
  const undo = env({ UNSUBSCRIBE_SECRET: "a-test-secret-of-sufficient-length" });
  try {
    const t = makeUnsubscribeToken(T, "Pessoa@Empresa.com");
    assert.deepEqual(verifyUnsubscribeToken(t), { tenantId: T, email: "pessoa@empresa.com" });
    const [p, s] = t.split(".");
    const forged = Buffer.from(`${T}|outra@empresa.com`).toString("base64url");
    assert.equal(verifyUnsubscribeToken(`${forged}.${s}`), null, "another address with this signature");
    assert.equal(verifyUnsubscribeToken(`${p}.${s.slice(0, -2)}AA`), null, "an edited signature");
    assert.equal(verifyUnsubscribeToken(`${p}.`), null);
    assert.equal(verifyUnsubscribeToken("garbage"), null);
    assert.equal(verifyUnsubscribeToken(null), null);
    assert.equal(verifyUnsubscribeToken("x".repeat(700)), null);
  } finally { undo(); }
  const undo2 = env({ UNSUBSCRIBE_SECRET: "a-different-secret-of-enough-length" });
  try { assert.equal(verifyUnsubscribeToken(makeUnsubscribeToken(T, "a@b.co")) !== null, true); } finally { undo2(); }
});

test("a token signed with another secret is refused, and no secret at all throws instead of signing with nothing", () => {
  const a = env({ UNSUBSCRIBE_SECRET: "first-secret-first-secret-first" });
  const token = makeUnsubscribeToken(T, "a@b.co");
  a();
  const b = env({ UNSUBSCRIBE_SECRET: "other-secret-other-secret-other" });
  try { assert.equal(verifyUnsubscribeToken(token), null); } finally { b(); }
  const c = env({ UNSUBSCRIBE_SECRET: undefined, SESSION_SECRET: undefined, INTERNAL_API_SECRET: undefined });
  try { assert.throws(() => makeUnsubscribeToken(T, "a@b.co"), /must be set/); } finally { c(); }
});

test("each recipient's copy carries their own signed link, in the footer and in the headers", () => {
  const undo = env({ UNSUBSCRIBE_SECRET: "a-test-secret-of-sufficient-length" });
  try {
    const m = buildNewsletterMail({ subject: "S", html: "<html><body><p>Oi <a href=\"https://x.test\">link</a></p></body></html>", recipient: "Ana@Empresa.com", tenantId: T, appUrl: "https://sponsorship.coritiba.com.br/", replyTo: "a@b.co" });
    const url = m.headers!["List-Unsubscribe"].slice(1, -1);
    assert.match(url, /^https:\/\/sponsorship\.coritiba\.com\.br\/api\/newsletter\/unsubscribe\?t=/);
    assert.deepEqual(verifyUnsubscribeToken(new URL(url).searchParams.get("t")), { tenantId: T, email: "ana@empresa.com" });
    assert.ok(m.html!.includes(url.replace(/&/g, "&")), "the footer link is the same signed link");
    assert.ok(m.text.includes(url), "and the plain-text part has it too");
    assert.equal(m.headers!["List-Unsubscribe-Post"], "List-Unsubscribe=One-Click");
    assert.equal(m.kind, "newsletter");
    assert.ok(!m.html!.includes("?email="), "never the old unsigned link");
    assert.equal(unsubscribeUrl("https://a.test/", "x y"), "https://a.test/api/newsletter/unsubscribe?t=x%20y");
  } finally { undo(); }
});

test("html to text keeps links and line breaks and drops styles", () => {
  assert.equal(htmlToText('<style>p{}</style><p>Olá <b>mundo</b></p><p><a href="https://x.test/a">Veja</a></p><br>fim &amp; tchau'), "Olá mundo\nVeja (https://x.test/a)\n\nfim & tchau");
});

test("a send time with no zone is Brasília time (UTC-3); a time with a zone is kept; junk is refused", () => {
  assert.equal(parseSendTime("2026-11-10T15:30")!.toISOString(), "2026-11-10T18:30:00.000Z");
  assert.equal(parseSendTime("2026-11-10T15:30:00")!.toISOString(), "2026-11-10T18:30:00.000Z");
  assert.equal(parseSendTime("2026-11-10T15:30:00Z")!.toISOString(), "2026-11-10T15:30:00.000Z");
  assert.equal(parseSendTime("2026-11-10T15:30:00+01:00")!.toISOString(), "2026-11-10T14:30:00.000Z");
  assert.equal(parseSendTime("tomorrow"), null);
  assert.equal(parseSendTime(""), null);
  assert.equal(parseSendTime(undefined), null);
});

test("system mail goes through SES when it is switched on, as a system message, and never touches Gmail", async () => {
  const { sendSystemEmail } = await import("../lib/mail/system");
  const seen: any[] = [];
  const r = await sendSystemEmail({ tenantId: T, to: "p@x.com", subject: "Seu link", bodyText: "texto", bodyHtml: "<p>x</p>", tag: "portal-link" }, { provider: "ses", send: async (m) => { seen.push(m); return { messageId: "m-1" }; } });
  assert.deepEqual(r, { provider: "ses", messageId: "m-1" });
  assert.equal(seen[0].kind, "system");
  assert.equal(seen[0].tag, "portal-link");
  assert.equal(seen[0].to, "p@x.com");
  assert.equal(fromFor("system").address, "nao-responda@mail.sponsorship.coritiba.com.br");
});

test("the unsubscribe page only shows a confirmation on GET and refuses a link that is not ours", async () => {
  const undo = env({ UNSUBSCRIBE_SECRET: "a-test-secret-of-sufficient-length" });
  try {
    const { GET, POST } = await import("../app/api/newsletter/unsubscribe/route");
    const { NextRequest } = await import("next/server");
    const req = (u: string, method = "GET") => new NextRequest(`http://x/api/newsletter/unsubscribe${u}`, { method });
    const ok = await GET(req(`?t=${makeUnsubscribeToken(T, "ana@x.com")}`));
    const html = await ok.text();
    assert.equal(ok.status, 200);
    assert.match(html, /Confirmar descadastro/);
    assert.match(html, /ana@x\.com/);
    assert.match(html, /method="post"/, "the button posts; opening the link changes nothing");
    assert.equal((await GET(req("?email=ana@x.com"))).status, 400, "the old unsigned link no longer works");
    assert.equal((await GET(req("?t=garbage"))).status, 400);
    assert.equal((await POST(req("?t=garbage", "POST"))).status, 400);
    const xss = makeUnsubscribeToken(T, "<script>alert(1)</script>@x.com");
    assert.ok(!(await (await GET(req(`?t=${xss}`))).text()).includes("<script>"), "the address is escaped on the page");
  } finally { undo(); }
});
