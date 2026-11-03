import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createSign } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { confirmSnsSubscription, isSnsUrl, stringToSign, verifySnsMessage, type SnsMessage } from "../lib/mail/sns";

const TOPIC = "arn:aws:sns:us-east-1:180536781258:sponsorship-ses-feedback";
const CERT_URL = "https://sns.us-east-1.amazonaws.com/SimpleNotificationService-test.pem";

// A throwaway key and certificate, made here, so the test signs messages the way Amazon does.
const dir = fs.mkdtempSync(path.join(os.tmpdir(), "sns-test-"));
let haveOpenssl = true;
try {
  execFileSync("openssl", ["req", "-x509", "-newkey", "rsa:2048", "-nodes", "-keyout", path.join(dir, "k.pem"), "-out", path.join(dir, "c.pem"), "-subj", "/CN=sns.test", "-days", "2"], { stdio: "ignore" });
} catch { haveOpenssl = false; }
const KEY = haveOpenssl ? fs.readFileSync(path.join(dir, "k.pem"), "utf8") : "";
const CERT = haveOpenssl ? fs.readFileSync(path.join(dir, "c.pem"), "utf8") : "";

function signed(fields: Partial<SnsMessage> = {}, version: "1" | "2" = "2"): SnsMessage {
  const m: SnsMessage = { Type: "Notification", MessageId: "11111111-2222-3333-4444-555555555555", TopicArn: TOPIC, Message: '{"eventType":"Bounce"}', Timestamp: "2026-11-03T10:00:00.000Z", SignatureVersion: version, SigningCertURL: CERT_URL, Signature: "", ...fields };
  const s = createSign(version === "2" ? "RSA-SHA256" : "RSA-SHA1");
  s.update(stringToSign(m)!, "utf8");
  m.Signature = s.sign(KEY, "base64");
  return m;
}
const okCert = async () => CERT;
const opts = { fetchCert: okCert, topicArn: TOPIC };
const t = (name: string, fn: () => Promise<void> | void) => test(name, { skip: haveOpenssl ? false : "openssl not available" }, fn);

t("a message signed by Amazon for our topic is accepted, with either signature version", async () => {
  assert.equal(await verifySnsMessage(signed({}, "2"), opts), true);
  assert.equal(await verifySnsMessage(signed({}, "1"), opts), true);
  assert.equal(await verifySnsMessage(signed({ Subject: "Amazon SES Email Event Notification" }), opts), true, "a subject is part of what is signed");
});

t("an edited message, a wrong signature or a signature from another key is refused", async () => {
  const m = signed();
  assert.equal(await verifySnsMessage({ ...m, Message: '{"eventType":"Complaint"}' }, opts), false);
  assert.equal(await verifySnsMessage({ ...m, MessageId: "99999999-2222-3333-4444-555555555555" }, opts), false);
  assert.equal(await verifySnsMessage({ ...m, Signature: Buffer.from("nope").toString("base64") }, opts), false);
  const other = path.join(dir, "k2.pem"), otherCert = path.join(dir, "c2.pem");
  execFileSync("openssl", ["req", "-x509", "-newkey", "rsa:2048", "-nodes", "-keyout", other, "-out", otherCert, "-subj", "/CN=evil", "-days", "2"], { stdio: "ignore" });
  const forged = { ...m }; const s = createSign("RSA-SHA256"); s.update(stringToSign(m)!, "utf8"); forged.Signature = s.sign(fs.readFileSync(other, "utf8"), "base64");
  assert.equal(await verifySnsMessage(forged, opts), false, "signed with someone else's key");
});

t("a message for another topic is refused even if the signature is perfect", async () => {
  const other = signed({ TopicArn: "arn:aws:sns:us-east-1:999999999999:someone-elses-topic" });
  assert.equal(await verifySnsMessage(other, opts), false);
});

t("the certificate must be an https .pem on Amazon SNS itself", async () => {
  for (const bad of [
    "http://sns.us-east-1.amazonaws.com/x.pem", "https://evil.example/x.pem", "https://sns.us-east-1.amazonaws.com.evil.example/x.pem",
    "https://sns.us-east-1.amazonaws.com:8443/x.pem", "https://user:pw@sns.us-east-1.amazonaws.com/x.pem", "https://sns.us-east-1.amazonaws.com/x.txt",
    "https://s3.us-east-1.amazonaws.com/x.pem", "not a url", "",
  ]) {
    let fetched = false;
    const m = signed({ SigningCertURL: bad || "x" });
    assert.equal(await verifySnsMessage(m, { topicArn: TOPIC, fetchCert: async () => { fetched = true; return CERT; } }), false, bad);
    assert.equal(fetched, false, `${bad}: the certificate must not even be fetched`);
  }
});

t("missing pieces, unknown types and unknown signature versions are refused", async () => {
  const m = signed();
  for (const broken of [{ ...m, Signature: "" }, { ...m, SigningCertURL: "" }, { ...m, SignatureVersion: "3" }, { ...m, Type: "Whatever" }, { ...m, TopicArn: "" }]) {
    assert.equal(await verifySnsMessage(broken as SnsMessage, opts), false);
  }
  assert.equal(await verifySnsMessage(null as unknown as SnsMessage, opts), false);
  assert.equal(await verifySnsMessage({} as SnsMessage, opts), false);
  assert.equal(await verifySnsMessage(signed({}), { topicArn: TOPIC, fetchCert: async () => { throw new Error("network down"); } }), false, "an unreachable certificate is a refusal, not a crash");
  assert.equal(await verifySnsMessage(signed({}), { topicArn: TOPIC, fetchCert: async () => "not a certificate" }), false);
});

t("the subscription confirmation is verified like any message, and only an SNS link is opened", async () => {
  const conf = signed({ Type: "SubscriptionConfirmation", Token: "abc", SubscribeURL: "https://sns.us-east-1.amazonaws.com/?Action=ConfirmSubscription&TopicArn=x&Token=abc", Message: "You have chosen to subscribe" });
  assert.equal(await verifySnsMessage(conf, opts), true);
  let opened = "";
  assert.equal(await confirmSnsSubscription(conf, async (u) => { opened = u; return { ok: true }; }), true);
  assert.equal(opened, conf.SubscribeURL);
  let called = false;
  assert.equal(await confirmSnsSubscription({ ...conf, SubscribeURL: "https://evil.example/confirm" }, async () => { called = true; return { ok: true }; }), false);
  assert.equal(called, false, "a link that is not on Amazon is never opened");
  assert.equal(await confirmSnsSubscription({ ...conf, SubscribeURL: "http://sns.us-east-1.amazonaws.com/?x" }, async () => ({ ok: true })), false);
  assert.equal(await confirmSnsSubscription(conf, async () => ({ ok: false })), false);
});

test("isSnsUrl only accepts https on an sns.<region>.amazonaws.com host", () => {
  assert.equal(isSnsUrl("https://sns.eu-west-1.amazonaws.com/a.pem"), true);
  assert.equal(isSnsUrl("https://sns.cn-north-1.amazonaws.com.cn/a.pem"), true);
  for (const bad of [undefined, "", "https://amazonaws.com/a.pem", "https://sns.amazonaws.com.evil.com/a", "https://xsns.us-east-1.amazonaws.com/a"]) assert.equal(isSnsUrl(bad as string), false, String(bad));
});

test("the route refuses anything unsigned before it touches data", async () => {
  const { POST } = await import("../app/api/ses/events/route");
  const post = (body: string) => POST(new Request("http://x/api/ses/events", { method: "POST", body }));
  assert.equal((await post("not json")).status, 400);
  assert.equal((await post(JSON.stringify({ Type: "Notification", Message: "{}", MessageId: "1", TopicArn: TOPIC }))).status, 403, "no signature");
  assert.equal((await post(JSON.stringify({ Type: "Notification", MessageId: "1", TopicArn: "arn:aws:sns:us-east-1:1:x", Signature: "x", SigningCertURL: CERT_URL, SignatureVersion: "2", Message: "{}" }))).status, 403, "wrong topic");
  assert.equal((await post("x".repeat(300_000))).status, 413);
});
