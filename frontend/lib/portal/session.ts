import crypto from "crypto";

/**
 * Persistent sponsor self-serve portal (Task 12) — passwordless magic-link
 * auth scoped to a company, reusing the same signed-cookie approach as the
 * proposal access gate (Task 6, lib/proposals/access-gate.ts) rather than
 * standing up a second full auth system (Supabase Auth is for internal
 * platform_users only). A sponsor never gets a password; a magic link
 * proves control of an email address already on file as a company contact.
 */
const PORTAL_COOKIE = "msa_portal_session";
const MAGIC_LINK_TTL_MS = 15 * 60 * 1000; // 15 minutes to click the link
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days signed in

function secret(): string {
  const s = process.env.INTERNAL_API_SECRET;
  if (!s) throw new Error("INTERNAL_API_SECRET not configured — cannot sign portal tokens");
  return s;
}

function sign(payload: string): string {
  return crypto.createHmac("sha256", secret()).update(payload).digest("hex");
}

export interface MagicLinkPayload {
  companyId: string;
  email: string;
  expiresAt: number;
}

export function createMagicLinkToken(companyId: string, email: string): string {
  const payload: MagicLinkPayload = { companyId, email, expiresAt: Date.now() + MAGIC_LINK_TTL_MS };
  const json = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${json}.${sign(json)}`;
}

export function verifyMagicLinkToken(token: string): MagicLinkPayload | null {
  const [json, sig] = token.split(".");
  if (!json || !sig) return null;
  const a = Buffer.from(sig);
  const b = Buffer.from(sign(json));
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const payload = JSON.parse(Buffer.from(json, "base64url").toString("utf-8")) as MagicLinkPayload;
    if (payload.expiresAt < Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}

export interface PortalSession {
  companyId: string;
  email: string;
  expiresAt: number;
}

export function createSessionToken(companyId: string, email: string): string {
  const payload: PortalSession = { companyId, email, expiresAt: Date.now() + SESSION_TTL_MS };
  const json = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${json}.${sign(json)}`;
}

export function verifySessionToken(token: string | undefined): PortalSession | null {
  if (!token) return null;
  const [json, sig] = token.split(".");
  if (!json || !sig) return null;
  const a = Buffer.from(sig);
  const b = Buffer.from(sign(json));
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const payload = JSON.parse(Buffer.from(json, "base64url").toString("utf-8")) as PortalSession;
    if (payload.expiresAt < Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}

export { PORTAL_COOKIE, SESSION_TTL_MS };
