import type { Metadata } from "next";

/** Meta robots for sensitive public surfaces (login, portal, share, lead pages). */
export const NOINDEX_METADATA = {
  robots: { index: false, follow: false },
} as const satisfies Metadata;

const LEAD_PAGES = ["/sports-clubs", "/nonprofits", "/conferences", "/chambers", "/festivals"] as const;

/** Paths that must send X-Robots-Tag: noindex, nofollow. */
export function pathNeedsNoIndexHeader(pathname: string): boolean {
  if (pathname === "/login") return true;
  if (pathname.startsWith("/portal")) return true;
  if (pathname.startsWith("/proposals/view/")) return true;
  return (LEAD_PAGES as readonly string[]).includes(pathname);
}
