/**
 * Domain resolution fallback chain for company enrichment.
 *
 * Tries each source in priority order and returns the best corporate domain
 * found. All external calls are non-throwing — failures are recorded in steps[].
 */

import { logger } from "@/lib/monitoring/logger";
import { supabaseAdmin } from "@/lib/supabase/server";

// Free-mail / consumer domains to ignore when extracting from contact emails
const FREEMAIL_DOMAINS = new Set([
  "gmail.com", "yahoo.com", "yahoo.com.br", "hotmail.com", "hotmail.com.br",
  "outlook.com", "live.com", "icloud.com", "me.com", "aol.com",
  "protonmail.com", "tutanota.com", "uol.com.br", "bol.com.br",
  "terra.com.br", "ig.com.br", "r7.com", "msn.com", "ymail.com",
]);

// ── Types ──────────────────────────────────────────────────────────────────────

export type DomainSource =
  | "website"
  | "apollo"
  | "hunter"
  | "crm_contact"
  | "email_inference"
  | "discovery"
  | "manual";

export type ResolutionStep = {
  step: "website" | "apollo" | "crm_contact" | "hunter" | "discovery";
  tried: boolean;
  success: boolean;
  domain: string | null;
  error?: string;
};

export type DomainResolutionResult = {
  final_domain: string | null;
  source: DomainSource | null;
  steps: ResolutionStep[];
  elapsed_ms: number;
};

export type CompanyForResolution = {
  id: string;
  company_name: string;
  website?: string | null;
  country?: string | null;
};

// ── Public helpers ─────────────────────────────────────────────────────────────

/**
 * Extract a clean hostname from any website/URL string.
 * Returns null if the input is empty or produces a clearly invalid hostname.
 */
export function extractDomainFromWebsite(website: string | null | undefined): string | null {
  if (!website || !website.trim()) return null;
  try {
    const url = website.startsWith("http") ? website : `https://${website}`;
    const host = new URL(url).hostname.replace(/^www\./, "").toLowerCase();
    if (!host || host.length < 4 || !host.includes(".")) return null;
    return host;
  } catch {
    const cleaned = website
      .replace(/^https?:\/\/(www\.)?/, "")
      .split("/")[0]
      .toLowerCase()
      .trim();
    return cleaned && cleaned.includes(".") ? cleaned : null;
  }
}

/**
 * Extract corporate domain from an email address.
 * Returns null for free-mail/consumer domains and malformed addresses.
 */
export function extractDomainFromEmail(email: string): string | null {
  const parts = (email ?? "").toLowerCase().split("@");
  if (parts.length !== 2) return null;
  const domain = parts[1].trim();
  if (FREEMAIL_DOMAINS.has(domain)) return null;
  if (domain.length < 4 || !domain.includes(".")) return null;
  return domain;
}

/**
 * Given multiple domain candidates (with source labels), return the best one.
 * Preference: .com.br > .com.br variants > .com > .br > others.
 * Ties resolved by source priority (website > apollo > crm_contact > hunter > discovery).
 */
export function pickBestDomain(
  candidates: Array<{ domain: string; source: DomainSource }>
): { domain: string; source: DomainSource } | null {
  if (candidates.length === 0) return null;
  if (candidates.length === 1) return candidates[0];

  const SOURCE_PRIORITY: Record<DomainSource, number> = {
    website: 6, apollo: 5, crm_contact: 4, hunter: 3,
    email_inference: 2, discovery: 1, manual: 7,
  };

  const sorted = [...candidates].sort((a, b) => {
    const tldDiff = domainTldScore(b.domain) - domainTldScore(a.domain);
    if (tldDiff !== 0) return tldDiff;
    return (SOURCE_PRIORITY[b.source] ?? 0) - (SOURCE_PRIORITY[a.source] ?? 0);
  });

  return sorted[0];
}

// ── Main resolution function ───────────────────────────────────────────────────

/**
 * Resolve the best corporate domain for a company using a 5-step fallback chain:
 *   1. Existing website on company record
 *   2. Apollo org search by name
 *   3. CRM/platform contact email domains
 *   4. Hunter domain finder by company name
 *   5. (Discovery — caller-triggered, not attempted here)
 *
 * Returns a structured result with all steps tried so the caller can log/display them.
 */
export async function resolveCompanyDomain(
  company: CompanyForResolution,
  options: {
    skipApollo?: boolean;
    skipHunter?: boolean;
    skipCrmContacts?: boolean;
  } = {}
): Promise<DomainResolutionResult> {
  const start = Date.now();
  const steps: ResolutionStep[] = [];
  const candidates: Array<{ domain: string; source: DomainSource }> = [];

  // ── Step 1: Existing website ───────────────────────────────────────────────
  const websiteDomain = extractDomainFromWebsite(company.website);
  steps.push({ step: "website", tried: true, success: !!websiteDomain, domain: websiteDomain });
  if (websiteDomain) {
    candidates.push({ domain: websiteDomain, source: "website" });
  }

  // ── Step 2: Apollo org search by name ────────────────────────────────────
  if (!options.skipApollo && candidates.length === 0) {
    const apolloStep: ResolutionStep = { step: "apollo", tried: true, success: false, domain: null };
    try {
      const { searchOrganizationByName } = await import("@/lib/intelligence/apollo");
      const apolloOrg = await searchOrganizationByName(company.company_name, company.country ?? undefined);
      const d = apolloOrg?.domain
        ? extractDomainFromWebsite(apolloOrg.domain)
        : apolloOrg?.website_url
          ? extractDomainFromWebsite(apolloOrg.website_url)
          : null;
      apolloStep.success = !!d;
      apolloStep.domain = d;
      if (d) candidates.push({ domain: d, source: "apollo" });
    } catch (err) {
      apolloStep.error = err instanceof Error ? err.message : String(err);
      logger.warn("Domain resolution: Apollo name search failed", {
        company: company.company_name,
        error: apolloStep.error,
      });
    }
    steps.push(apolloStep);
  } else {
    steps.push({ step: "apollo", tried: false, success: false, domain: null });
  }

  // ── Step 3: CRM / saved contact email domains ──────────────────────────────
  if (!options.skipCrmContacts && candidates.length === 0) {
    const crmStep: ResolutionStep = { step: "crm_contact", tried: true, success: false, domain: null };
    try {
      const sb = supabaseAdmin();
      const { data: contacts } = await sb
        .from("contacts")
        .select("email")
        .eq("company_id", company.id)
        .limit(30);

      const domains = (contacts ?? [])
        .map((c: { email: string }) => extractDomainFromEmail(c.email))
        .filter((d): d is string => !!d);

      const best = getMostCommonDomain(domains);
      crmStep.success = !!best;
      crmStep.domain = best;
      if (best) candidates.push({ domain: best, source: "crm_contact" });
    } catch (err) {
      crmStep.error = err instanceof Error ? err.message : String(err);
      logger.warn("Domain resolution: CRM contacts lookup failed", { error: crmStep.error });
    }
    steps.push(crmStep);
  } else {
    steps.push({ step: "crm_contact", tried: false, success: false, domain: null });
  }

  // ── Step 4: Hunter domain finder by company name ───────────────────────────
  if (!options.skipHunter && candidates.length === 0) {
    const hunterStep: ResolutionStep = { step: "hunter", tried: true, success: false, domain: null };
    try {
      const { findDomainByCompanyName } = await import("@/lib/intelligence/hunter");
      const d = await findDomainByCompanyName(company.company_name);
      hunterStep.success = !!d;
      hunterStep.domain = d;
      if (d) candidates.push({ domain: d, source: "hunter" });
    } catch (err) {
      hunterStep.error = err instanceof Error ? err.message : String(err);
      logger.warn("Domain resolution: Hunter domain finder failed", { error: hunterStep.error });
    }
    steps.push(hunterStep);
  } else {
    steps.push({ step: "hunter", tried: false, success: false, domain: null });
  }

  // Step 5: Discovery (caller-triggered — not attempted in resolution module)
  steps.push({ step: "discovery", tried: false, success: false, domain: null });

  const best = pickBestDomain(candidates);

  logger.info("Domain resolution complete", {
    company: company.company_name,
    result: best?.domain ?? "none",
    source: best?.source ?? "none",
    steps_tried: steps.filter((s) => s.tried).map((s) => s.step),
    elapsed_ms: Date.now() - start,
  });

  return {
    final_domain: best?.domain ?? null,
    source: best?.source ?? null,
    steps,
    elapsed_ms: Date.now() - start,
  };
}

// ── Private helpers ────────────────────────────────────────────────────────────

function domainTldScore(domain: string): number {
  if (domain.endsWith(".com.br")) return 10;
  if (domain.endsWith(".com")) return 8;
  if (domain.endsWith(".br")) return 7;
  if (domain.endsWith(".org.br") || domain.endsWith(".net.br")) return 6;
  if (domain.endsWith(".org") || domain.endsWith(".net")) return 5;
  return 3;
}

function getMostCommonDomain(domains: string[]): string | null {
  if (domains.length === 0) return null;
  const counts = new Map<string, number>();
  for (const d of domains) counts.set(d, (counts.get(d) ?? 0) + 1);
  let best: string | null = null;
  let bestCount = 0;
  for (const [d, c] of counts) {
    if (c > bestCount) { best = d; bestCount = c; }
  }
  return best;
}
