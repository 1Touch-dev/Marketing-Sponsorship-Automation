import { NextRequest, NextResponse } from "next/server";
import { verifyMagicLinkToken, createSessionToken, PORTAL_COOKIE, SESSION_TTL_MS } from "@/lib/portal/session";
import { recordAudit } from "@/lib/audit/log";

export const runtime = "nodejs";

/**
 * GET /api/portal/verify?token=...
 * Redeems a magic-link token (15 min TTL) for a 30-day portal session
 * cookie, then redirects into the dashboard.
 */
export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token") ?? "";
  const payload = verifyMagicLinkToken(token);
  if (!payload) {
    return NextResponse.redirect(new URL("/portal/login?error=expired", req.url));
  }

  const sessionToken = createSessionToken(payload.companyId, payload.email);
  const res = NextResponse.redirect(new URL("/portal", req.url));
  res.cookies.set(PORTAL_COOKIE, sessionToken, {
    httpOnly: true,
    secure: req.url.startsWith("https://"),
    sameSite: "lax",
    maxAge: SESSION_TTL_MS / 1000,
    path: "/",
  });

  await recordAudit({
    entity_type: "portal_access",
    entity_id: payload.companyId,
    action: "portal.login",
    metadata: { email: payload.email },
  });

  return res;
}
