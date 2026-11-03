import { createVerify } from "node:crypto";
import { snsTopicArn } from "./config";

/** An Amazon SNS message as it arrives: string fields only. */
export type SnsMessage = Record<string, string>;

const HOST = /^sns\.[a-z0-9-]+\.amazonaws\.com(\.cn)?$/;

/** Only an https address on Amazon SNS itself: the signing certificate and the subscribe link both come from the message. */
export function isSnsUrl(raw: string | undefined): raw is string {
  if (!raw) return false;
  try {
    const u = new URL(raw);
    return u.protocol === "https:" && HOST.test(u.hostname) && !u.username && !u.password && (u.port === "" || u.port === "443");
  } catch { return false; }
}

const FIELDS: Record<string, string[]> = {
  Notification: ["Message", "MessageId", "Subject", "Timestamp", "TopicArn", "Type"],
  SubscriptionConfirmation: ["Message", "MessageId", "SubscribeURL", "Timestamp", "Token", "TopicArn", "Type"],
  UnsubscribeConfirmation: ["Message", "MessageId", "SubscribeURL", "Timestamp", "Token", "TopicArn", "Type"],
};

export function stringToSign(m: SnsMessage): string | null {
  const fields = FIELDS[m.Type];
  if (!fields) return null;
  return fields.filter((k) => m[k] !== undefined).map((k) => `${k}\n${m[k]}\n`).join("");
}

const certs = new Map<string, string>();
async function fetchCert(url: string): Promise<string> {
  const hit = certs.get(url);
  if (hit) return hit;
  const res = await fetch(url, { signal: AbortSignal.timeout(5000), redirect: "error" });
  if (!res.ok) throw new Error(`certificate fetch failed: ${res.status}`);
  const pem = await res.text();
  if (!pem.includes("BEGIN CERTIFICATE") || pem.length > 20_000) throw new Error("not a certificate");
  certs.set(url, pem);
  return pem;
}

/**
 * True only when this message really comes from Amazon SNS for OUR topic: the certificate lives on an SNS host, the signature
 * matches the message text, and the topic is the one we expect. Anything else is refused, because this route has no login.
 */
export async function verifySnsMessage(m: SnsMessage, opts: { fetchCert?: (url: string) => Promise<string>; topicArn?: string } = {}): Promise<boolean> {
  try {
    if (!m || typeof m !== "object" || !m.Signature || !m.SigningCertURL) return false;
    if (m.SignatureVersion !== "1" && m.SignatureVersion !== "2") return false;
    if (!isSnsUrl(m.SigningCertURL) || !new URL(m.SigningCertURL).pathname.endsWith(".pem")) return false;
    if (m.TopicArn !== (opts.topicArn ?? snsTopicArn())) return false;
    const text = stringToSign(m);
    if (!text) return false;
    const pem = await (opts.fetchCert ?? fetchCert)(m.SigningCertURL);
    const v = createVerify(m.SignatureVersion === "2" ? "RSA-SHA256" : "RSA-SHA1");
    v.update(text, "utf8");
    return v.verify(pem, Buffer.from(m.Signature, "base64"));
  } catch {
    return false;
  }
}

/** Confirms the subscription by opening the link Amazon sent. Refuses any link that is not on Amazon SNS. */
export async function confirmSnsSubscription(m: SnsMessage, get: (url: string) => Promise<{ ok: boolean }> = (u) => fetch(u, { signal: AbortSignal.timeout(5000), redirect: "error" })): Promise<boolean> {
  if (!isSnsUrl(m.SubscribeURL)) return false;
  return (await get(m.SubscribeURL)).ok;
}
