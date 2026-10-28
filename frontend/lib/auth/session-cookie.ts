/**
 * Flags for staff (and portal) session cookies.
 *
 * @supabase/ssr does not set HttpOnly by default. Behind ngrok / a load
 * balancer, Next often sees http://localhost even when the public URL is
 * HTTPS, so Secure must follow APP_URL / forwarded proto — not req.url.
 */

export type HeaderLike = { get(name: string): string | null };

export type RequestLike = {
  url?: string;
  headers?: HeaderLike;
};

export type SessionCookieOptions = {
  httpOnly: true;
  secure: boolean;
  sameSite: "lax";
  path: "/";
};

export function isSecureRequest(req?: RequestLike): boolean {
  const appUrl =
    process.env.APP_URL?.trim() ||
    process.env.NEXT_PUBLIC_APP_URL?.trim() ||
    "";
  if (appUrl.toLowerCase().startsWith("https://")) return true;

  const proto =
    req?.headers?.get("x-forwarded-proto") ||
    req?.headers?.get("x-forwarded-scheme") ||
    req?.headers?.get("x-forwarded-protocol");
  if (proto) return proto.split(",")[0].trim().toLowerCase() === "https";

  if (req?.url?.toLowerCase().startsWith("https://")) return true;
  return false;
}

export function sessionCookieOptions(req?: RequestLike): SessionCookieOptions {
  return {
    httpOnly: true,
    secure: isSecureRequest(req),
    sameSite: "lax",
    path: "/",
  };
}

/** Overlay HttpOnly / Secure / SameSite / Path on every set and remove (including chunked sb-*-auth-token.0). */
export function withSessionCookieOptions(
  options: Record<string, unknown> = {},
  req?: RequestLike,
): Record<string, unknown> {
  return { ...options, ...sessionCookieOptions(req) };
}
