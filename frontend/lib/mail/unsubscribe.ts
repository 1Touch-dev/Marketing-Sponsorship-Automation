import { createHmac, timingSafeEqual } from "node:crypto";
import { normalizeEmail } from "@/lib/contacts/model";

/**
 * The unsubscribe link in a newsletter names ONE address in ONE club and is signed, so nobody can unsubscribe someone else
 * by editing the link. It does not expire: an unsubscribe link must work whenever the email is opened.
 */
function secret(): string {
  const s = process.env.UNSUBSCRIBE_SECRET?.trim() || process.env.SESSION_SECRET?.trim() || process.env.INTERNAL_API_SECRET?.trim();
  if (!s || s.length < 16) throw new Error("UNSUBSCRIBE_SECRET (or SESSION_SECRET) must be set, at least 16 characters.");
  return s;
}
const b64 = (b: Buffer | string) => Buffer.from(b).toString("base64url");
const mac = (payload: string) => createHmac("sha256", secret()).update(`unsubscribe-v1|${payload}`).digest();

export function makeUnsubscribeToken(tenantId: string, email: string): string {
  const payload = `${tenantId}|${normalizeEmail(email)}`;
  return `${b64(payload)}.${b64(mac(payload))}`;
}

export function verifyUnsubscribeToken(token: string | null | undefined): { tenantId: string; email: string } | null {
  if (!token || token.length > 600) return null;
  const [p, s] = token.split(".");
  if (!p || !s) return null;
  let payload: string, given: Buffer;
  try { payload = Buffer.from(p, "base64url").toString("utf8"); given = Buffer.from(s, "base64url"); } catch { return null; }
  const want = mac(payload);
  if (given.length !== want.length || !timingSafeEqual(given, want)) return null;
  const i = payload.indexOf("|");
  const tenantId = payload.slice(0, i), email = payload.slice(i + 1);
  return i > 0 && /^[0-9a-f-]{36}$/i.test(tenantId) && email.includes("@") ? { tenantId, email } : null;
}

export const unsubscribeUrl = (appUrl: string, token: string) => `${appUrl.replace(/\/$/, "")}/api/newsletter/unsubscribe?t=${encodeURIComponent(token)}`;

/** The headers mail programs use to show their own "Unsubscribe" button; the POST form lets them do it in one click (RFC 8058). */
export function unsubscribeHeaders(url: string): Record<string, string> {
  return { "List-Unsubscribe": `<${url}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" };
}
