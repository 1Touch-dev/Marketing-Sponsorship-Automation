import { NextResponse } from "next/server";

/**
 * Validates that the request carries the correct INTERNAL_API_SECRET.
 * Use this in all /api/internal/* and /api/system/* route handlers.
 *
 * Returns a 401 NextResponse if the secret is missing/wrong, or null if ok.
 *
 * Usage:
 *   const authError = requireInternalAuth(req);
 *   if (authError) return authError;
 */
export function requireInternalAuth(req: Request): NextResponse | null {
  const secret = process.env.INTERNAL_API_SECRET;

  // If no secret configured, block all access in production
  if (!secret) {
    if (process.env.NODE_ENV === "production") {
      return NextResponse.json(
        { error: "Internal API not configured" },
        { status: 503 }
      );
    }
    // Dev: warn but allow
    console.warn("[SECURITY] INTERNAL_API_SECRET not set — internal API is unprotected in dev mode");
    return null;
  }

  const provided =
    req.headers.get("x-internal-secret") ||
    req.headers.get("authorization")?.replace("Bearer ", "");

  if (!provided || provided !== secret) {
    return NextResponse.json(
      { error: "Forbidden: invalid internal secret" },
      { status: 403 }
    );
  }

  return null;
}
