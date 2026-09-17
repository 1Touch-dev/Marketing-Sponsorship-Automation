import crypto from "crypto";

/**
 * Optional NDA/passcode gate per proposal (see migration 0049). The public
 * share page is server-rendered in one shot (force-dynamic), so hiding
 * gated content with CSS/JS alone would still leak it in the initial HTML
 * response — instead, page.tsx checks gate status server-side and only
 * renders the real content once a signed proof-of-passage cookie is
 * present, set by verify-gate/route.ts after a correct passcode or NDA
 * acceptance.
 *
 * Not a high-security secret store (same trust level as the share token
 * itself) — the goal is a lightweight, un-forgeable "this browser already
 * passed the gate for this proposal" signal, not bulletproof access
 * control.
 */
function gateSecret(): string {
  // Reuses the existing internal-API secret rather than introducing a new
  // env var for a single HMAC key — already server-only and configured.
  const secret = process.env.INTERNAL_API_SECRET;
  if (!secret) throw new Error("INTERNAL_API_SECRET not configured — cannot sign access-gate tokens");
  return secret;
}

export function gateCookieName(shareToken: string): string {
  return `msa_gate_${shareToken.slice(0, 12)}`;
}

export function signGateToken(shareToken: string): string {
  return crypto.createHmac("sha256", gateSecret()).update(shareToken).digest("hex");
}

export function verifyGateToken(shareToken: string, providedValue: string | undefined): boolean {
  if (!providedValue) return false;
  const expected = signGateToken(shareToken);
  const a = Buffer.from(providedValue);
  const b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
