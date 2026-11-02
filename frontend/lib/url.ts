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

/**
 * internalAppUrl — where THIS server reaches itself, for the fire-and-forget calls a route makes to another of its own
 * routes (competitor discovery, enrichment, follow-up drafts, sequence steps).
 *
 * Deliberately NOT the public address: a call to the public domain leaves the machine, crosses DNS, the proxy and HTTPS,
 * and fails whenever any of them is down or not set up yet (for example the days between switching APP_URL and the
 * domain working). Set INTERNAL_APP_URL only if the app does not listen on this machine's port 3000.
 */
export function internalAppUrl(): string {
  const explicit = process.env.INTERNAL_APP_URL?.trim();
  if (explicit) return explicit.replace(/\/$/, "");
  return `http://127.0.0.1:${process.env.PORT?.trim() || "3000"}`;
}
