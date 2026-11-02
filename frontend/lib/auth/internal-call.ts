import { internalAppUrl } from "@/lib/url";

/**
 * Headers for the app calling one of its OWN routes (see internalAppUrl in lib/url.ts). Those routes are not behind a
 * browser session, so the call proves itself with INTERNAL_API_SECRET and names the club it acts for.
 * Without the secret set, the receiving route refuses the call (401), exactly as for any outsider.
 */
export function internalCallHeaders(tenantId: string, service: string): Record<string, string> {
  return {
    "content-type": "application/json",
    "x-internal-secret": process.env.INTERNAL_API_SECRET ?? "",
    "x-tenant-id": tenantId,
    "x-service-name": service,
  };
}

/**
 * POST to one of this app's own routes (see internalAppUrl): authenticated with the internal secret, acting for the
 * given club, never going through the public address.
 */
export function callOwnRoute(
  path: string,
  opts: { tenantId: string; service: string; body?: unknown; signal?: AbortSignal },
): Promise<Response> {
  return fetch(new URL(path, internalAppUrl()).toString(), {
    method: "POST",
    headers: internalCallHeaders(opts.tenantId, opts.service),
    body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
    signal: opts.signal,
  });
}
