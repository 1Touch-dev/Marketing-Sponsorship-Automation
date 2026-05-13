/**
 * resolveAppUrl — returns the canonical public base URL for the running app.
 *
 * Priority order (first truthy value wins):
 *  1. APP_URL          env var   (set in .env.local — most explicit)
 *  2. NEXT_PUBLIC_APP_URL        (inlined at build time, also in .env.local)
 *  3. x-forwarded-proto + x-forwarded-host  request headers (set by ngrok / load balancers)
 *  4. x-forwarded-proto + host  request headers (fallback proxy headers)
 *  5. http://localhost:3000     (development only fallback)
 *
 * Never derived from req.url directly because Next.js inside a reverse proxy
 * (e.g. ngrok) receives req.url with the internal address (localhost:3000), not
 * the public one — which causes post-OAuth redirects to land on localhost.
 */
export function resolveAppUrl(req?: Request): string {
  // 1. Explicit env vars (most reliable — set in .env.local)
  const appUrl =
    process.env.APP_URL?.trim() ||
    process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (appUrl) return appUrl.replace(/\/$/, "");

  // 2. Proxy headers forwarded by ngrok / nginx / ALB
  if (req) {
    const proto =
      req.headers.get("x-forwarded-proto") ||
      req.headers.get("x-forwarded-scheme");
    const host =
      req.headers.get("x-forwarded-host") ||
      req.headers.get("host");

    if (proto && host) {
      // x-forwarded-proto can be a comma-separated list; take the first
      const scheme = proto.split(",")[0].trim();
      return `${scheme}://${host}`;
    }
  }

  // 3. Local development fallback
  return "http://localhost:3000";
}
