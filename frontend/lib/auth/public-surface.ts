/**
 * Everything that can be reached WITHOUT a staff session, in one place. The middleware lets these through, so each one
 * has to protect itself; this table says how, and tests/public-surface.test.ts reads every route behind each entry and
 * fails if the named guard is not in its code. Adding a public route means adding a line here, with its guard.
 *
 * A sponsor holding the portal cookie gets no more than this list: any other path needs a staff session.
 */

export type PublicGuard =
  | "none"                    // public by design: reads nothing private
  | "portal-session"          // lib/portal: the confirmed sponsor session
  | "portal-entry"            // the portal's own sign-in steps (link request, link redemption, sign-out)
  | "internal-secret"         // INTERNAL_API_SECRET, or a staff session where the route allows it
  | "share-token"             // the proposal's share token
  | "provider-credential"     // a signature or key issued to an outside provider
  | "rate-limited-form";      // an open form: validated and rate-limited

export interface PublicEntry { kind: "exact" | "prefix" | "regex"; match: string; guard: PublicGuard; why: string; marker?: RegExp }

const E = (match: string, guard: PublicGuard, why: string, marker?: RegExp): PublicEntry => ({ kind: "exact", match, guard, why, marker });
const P = (match: string, guard: PublicGuard, why: string, marker?: RegExp): PublicEntry => ({ kind: "prefix", match, guard, why, marker });
const R = (match: RegExp, guard: PublicGuard, why: string, marker?: RegExp): PublicEntry => ({ kind: "regex", match: match.source, guard, why, marker });

const INTERNAL = /requirePermissionOrInternal|INTERNAL_API_SECRET|requireInternalAuth|requirePermission\(/;

export const PUBLIC_SURFACE: PublicEntry[] = [
  // pages
  E("/login", "none", "the sign-in page"),
  E("/sports-clubs", "none", "public marketing page"), E("/nonprofits", "none", "public marketing page"), E("/conferences", "none", "public marketing page"),
  E("/chambers", "none", "public marketing page"), E("/festivals", "none", "public marketing page"),
  P("/proposals/view/", "share-token", "the public proposal page: reached by its share token, and shows only what a sponsor may read (lib/portal/safe-view.ts)"),
  P("/portal", "portal-session", "the sponsor portal pages: each confirms the sponsor session itself (lib/portal/guard.ts)"),
  P("/_next/", "none", "framework files"), P("/favicon", "none", "site icon"), P("/images/", "none", "static files"), P("/icons/", "none", "static files"),
  P("/mockups/", "none", "static files"), P("/demo-logos/", "none", "static files"), P("/brand/", "none", "club crest and logo files"),

  // api
  E("/api/auth/login", "none", "signs a person in with their credentials", /signInWithPassword|checkRateLimit/),
  E("/api/auth/session", "none", "reports the caller's own session, nothing else"),
  E("/api/health", "none", "liveness only"),
  P("/api/internal/", "internal-secret", "called by schedulers and operators with the shared secret", INTERNAL),
  P("/api/portal/", "portal-session", "the sponsor portal API: every route confirms the sponsor session (portalGet), except its three entry steps", /portalGet\(|requirePortalSession|checkRateLimit|verifyMagicLinkToken|PORTAL_COOKIE/),
  E("/api/documenso/webhook", "provider-credential", "called by the e-signature provider", /signature|secret|timingSafeEqual|verify/i),
  E("/api/mcp/public", "provider-credential", "read-only public MCP server with its own bearer key", /MCP_PUBLIC_API_KEY/),
  // Operator endpoints the schedulers call with the shared secret. The system's health and status pages are NOT here: they
  // describe the whole deployment (integrations, configuration, counts of the club's records), so they need a staff session.
  E("/api/system/maintenance", "internal-secret", "scheduled maintenance", INTERNAL),
  E("/api/system/migrate-26june", "internal-secret", "operator migration", INTERNAL),
  E("/api/system/migrate-contracts", "internal-secret", "operator migration", INTERNAL),
  E("/api/system/pipedrive-sync", "internal-secret", "scheduled CRM sync", INTERNAL),
  E("/api/system/weekly-validation", "internal-secret", "scheduled validation", INTERNAL),
  R(/^\/api\/proposals\/[^/]+\/track-view$/, "share-token", "a sponsor opening the share link", /sharedProposalFor/),
  R(/^\/api\/proposals\/[^/]+\/interest$/, "share-token", "the lead form on the share page", /sharedProposalFor/),
  R(/^\/api\/proposals\/view\/[^/]+\/verify-gate$/, "share-token", "the access-gate passcode or NDA on the share page", /share_token|gate|token/),
  R(/^\/api\/proposals\/detect-cold$/, "internal-secret", "scheduler endpoint", INTERNAL),
  R(/^\/api\/email-sequences\/advance$/, "internal-secret", "scheduler endpoint", INTERNAL),
  R(/^\/api\/gmail\/sync-threads$/, "internal-secret", "scheduler endpoint", INTERNAL),
  R(/^\/api\/emails\/[^/]+\/events$/, "internal-secret", "delivery events from the email provider", INTERNAL),
  R(/^\/api\/contracts\/[^/]+\/signers$/, "provider-credential", "signature callbacks; reads check the session in the route", /requirePermission|INTERNAL_API_SECRET|getCurrentPlatformUser|timingSafeEqual/),
  R(/^\/api\/leads$/, "rate-limited-form", "the lead form on the public niche pages", /checkRateLimit/),
];

export function isPublicPath(pathname: string): PublicEntry | null {
  for (const e of PUBLIC_SURFACE) {
    if (e.kind === "exact" && pathname === e.match) return e;
    if (e.kind === "prefix" && pathname.startsWith(e.match)) return e;
    if (e.kind === "regex" && new RegExp(e.match).test(pathname)) return e;
  }
  return null;
}
