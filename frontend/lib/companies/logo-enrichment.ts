/**
 * Shared logo enrichment — single source of truth for "find a company logo".
 *
 * Used by:
 *  - POST /api/companies/logo        (manual "Re-fetch Logo" button, single company)
 *  - POST /api/companies/enrich      (legacy alias, kept for the new-company form)
 *  - POST /api/companies              (auto-scrape on company create, fire-and-forget)
 *  - POST /api/companies/bulk-logo-fetch (bulk action across many companies)
 *  - Product Discovery auto-save     (auto-scrape newly discovered sellers)
 *
 * Strategy (in order, first valid hit wins):
 *   1. logo.dev  @ 512px  — best quality, free tier, needs a valid publishable
 *      token (`LOGO_DEV_TOKEN` env var). NOTE: as of this writing the
 *      previously hardcoded token has expired ("invalid api token") — a
 *      fresh free key from https://logo.dev/signup must be set as
 *      LOGO_DEV_TOKEN for this tier to work. Falls through gracefully if not.
 *   2. Apollo.io org enrichment logo_url — if APOLLO_API_KEY is configured
 *      (already used elsewhere in this codebase for company intelligence).
 *      Only accepted if Apollo's returned org name plausibly matches the
 *      company name we asked about — Apollo's domain matching can return an
 *      unrelated organization for a placeholder/generic domain (seen live:
 *      example.com resolved to an org called "AI Sales", whose logo then got
 *      silently composited onto that company's every jersey/stadium mockup).
 *   3. Google favicon @ 256px — always resolves, lowest quality (last resort).
 *
 * Clearbit's public Logo API (logo.clearbit.com) was permanently shut down
 * on Dec 8, 2025 — it is intentionally NOT in this fallback chain (the
 * domain no longer resolves at all, so keeping it would just waste ~5s of
 * timeout per company for a guaranteed miss).
 *
 * A candidate is only accepted if the HEAD/GET response is a real image
 * (or an untyped-but-substantial binary, which is how Apollo serves its
 * S3-hosted logos) and not logo.dev's known 1x1 placeholder (68 bytes) for
 * unknown domains.
 */

import { supabaseAdmin } from "@/lib/supabase/server";

export type LogoSource = "logo_dev" | "apollo" | "favicon";

export interface LogoFetchResult {
  logoUrl: string | null;
  source: LogoSource | null;
  domain: string | null;
}

const LOGO_DEV_TOKEN = process.env.LOGO_DEV_TOKEN ?? "pk_X-1ZO13GSgeOoUrIuJ6BeA";
const HEAD_TIMEOUT_MS = 5_000;
/** logo.dev's placeholder for an unresolvable domain is a tiny 1x1 PNG. */
const LOGO_DEV_PLACEHOLDER_BYTES = "68";
/** Below this, treat the response as a broken/placeholder image, not a real logo. */
const MIN_PLAUSIBLE_LOGO_BYTES = 200;

/** Lowercases, strips accents/legal suffixes/punctuation for name comparison. */
function normalizeForMatch(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\b(ltda|ltd|inc|s\/?a|llc|corp|co|group|grupo)\b/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * True if two company names plausibly refer to the same company — exact
 * match, one containing the other (handles legal suffixes / location notes
 * like "(operação PR)"), or at least one shared significant word. Missing
 * input on either side returns true (nothing to compare, don't block).
 */
export function namesLikelyMatch(a?: string | null, b?: string | null): boolean {
  const na = normalizeForMatch(a ?? "");
  const nb = normalizeForMatch(b ?? "");
  if (!na || !nb) return true;
  if (na === nb || na.includes(nb) || nb.includes(na)) return true;
  const tokensA = new Set(na.split(" ").filter((t) => t.length > 2));
  const tokensB = new Set(nb.split(" ").filter((t) => t.length > 2));
  if (tokensA.size === 0 || tokensB.size === 0) return true;
  for (const t of tokensA) if (tokensB.has(t)) return true;
  return false;
}

export function extractDomain(input?: string | null): string {
  if (!input) return "";
  try {
    if (input.includes(".")) {
      const url = input.startsWith("http") ? input : `https://${input}`;
      return new URL(url).hostname.replace(/^www\./, "").toLowerCase();
    }
  } catch {
    /* fallthrough */
  }
  return input.replace(/^(https?:\/\/)?(www\.)?/, "").split("/")[0].toLowerCase();
}

/**
 * Accepts a candidate logo URL if it resolves to a real, substantial image.
 * Some hosts (e.g. Apollo's S3 bucket) omit content-type but still return a
 * real binary image — in that case we fall back to a content-length check.
 */
async function headIsImage(url: string): Promise<boolean> {
  try {
    const res = await fetch(url, { method: "HEAD", signal: AbortSignal.timeout(HEAD_TIMEOUT_MS) });
    if (!res.ok) return false;
    const contentType = res.headers.get("content-type") ?? "";
    const contentLength = res.headers.get("content-length");
    if (contentLength === LOGO_DEV_PLACEHOLDER_BYTES) return false;

    if (contentType.includes("image")) return true;
    // No/unknown content-type but a substantial body — likely a real image
    // served without proper headers (seen with Apollo's S3-hosted logos).
    if (!contentType && contentLength && Number(contentLength) > MIN_PLAUSIBLE_LOGO_BYTES) return true;
    return false;
  } catch {
    return false;
  }
}

/**
 * Resolve the best available logo for a domain/company name.
 * Does NOT touch the database — pure lookup. Use `fetchAndStoreCompanyLogo`
 * to also persist the result.
 */
export async function resolveCompanyLogo(opts: {
  website?: string | null;
  companyName?: string | null;
  domain?: string | null;
  sizePx?: number;
}): Promise<LogoFetchResult> {
  const domain = (opts.domain && opts.domain.trim()) || extractDomain(opts.website ?? opts.companyName);
  if (!domain || !domain.includes(".")) {
    return { logoUrl: null, source: null, domain: domain || null };
  }

  const size = opts.sizePx ?? 512;

  // 1. logo.dev — highest quality when the token is valid
  const logoDevUrl = `https://img.logo.dev/${domain}?token=${LOGO_DEV_TOKEN}&size=${size}&format=png`;
  if (await headIsImage(logoDevUrl)) {
    return { logoUrl: logoDevUrl, source: "logo_dev", domain };
  }

  // 2. Apollo org enrichment (only if configured — consumes a credit)
  if (process.env.APOLLO_API_KEY) {
    try {
      const { enrichOrganization } = await import("@/lib/intelligence/apollo");
      const org = await enrichOrganization(domain);
      if (
        org?.logo_url &&
        namesLikelyMatch(org.name, opts.companyName) &&
        (await headIsImage(org.logo_url))
      ) {
        return { logoUrl: org.logo_url, source: "apollo", domain };
      }
    } catch {
      /* Apollo optional — ignore failures */
    }
  }

  // 3. Favicon fallback — always resolves, lowest quality
  const faviconUrl = `https://www.google.com/s2/favicons?domain=${domain}&sz=256`;
  return { logoUrl: faviconUrl, source: "favicon", domain };
}

/**
 * Resolve + persist a company's logo. Skips the fetch if a logo already
 * exists and `forceRefresh` is false. Best-effort: never throws.
 */
export async function fetchAndStoreCompanyLogo(opts: {
  companyId: string;
  website?: string | null;
  companyName?: string | null;
  domain?: string | null;
  forceRefresh?: boolean;
  sizePx?: number;
}): Promise<LogoFetchResult & { skipped?: boolean }> {
  const sb = supabaseAdmin();

  try {
    const { data: company } = await sb
      .from("companies")
      .select("id, company_name, website, logo_url, logo_fetched_at")
      .eq("id", opts.companyId)
      .maybeSingle();

    if (!company) return { logoUrl: null, source: null, domain: null };

    if (company.logo_url && company.logo_fetched_at && !opts.forceRefresh) {
      return { logoUrl: company.logo_url, source: null, domain: null, skipped: true };
    }

    const result = await resolveCompanyLogo({
      website: opts.website ?? company.website,
      companyName: opts.companyName ?? company.company_name,
      domain: opts.domain,
      sizePx: opts.sizePx,
    });

    if (result.logoUrl) {
      await sb
        .from("companies")
        .update({
          logo_url: result.logoUrl,
          logo_source: result.source,
          logo_fetched_at: new Date().toISOString(),
        })
        .eq("id", opts.companyId);

      try {
        await sb.from("company_logos" as "companies").insert({
          company_id: opts.companyId,
          source: result.source,
          original_url: result.logoUrl,
          stored_url: result.logoUrl,
          format: "png",
          is_primary: true,
          fetch_status: "fetched",
        } as unknown as Record<string, unknown>);
      } catch {
        /* company_logos table may not exist yet — non-fatal */
      }
    }

    return result;
  } catch {
    return { logoUrl: null, source: null, domain: null };
  }
}
