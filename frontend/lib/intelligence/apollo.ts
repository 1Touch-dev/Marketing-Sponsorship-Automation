/**
 * Apollo.io Client
 * Company intelligence (org enrich, departmental headcount, funding, tech stack).
 * People search / email reveal require a paid Apollo plan (graceful fallback on Free).
 * Docs: https://docs.apollo.io/reference/organization-enrichment
 */

import { logger } from "@/lib/monitoring/logger";

const APOLLO_BASE = "https://api.apollo.io/api/v1";

// Sponsorship-relevant titles for decision-maker search (paid plans)
const SPONSORSHIP_TITLES = [
  "Chief Marketing Officer",
  "CMO",
  "Marketing Director",
  "Head of Marketing",
  "VP Marketing",
  "Sponsorship Manager",
  "Head of Sponsorship",
  "Commercial Director",
  "Brand Manager",
  "Head of Brand",
];

// ── Types ─────────────────────────────────────────────────────────────────────

export type ApolloPerson = {
  id: string | null;
  name: string;
  title: string | null;
  email: string | null;
  linkedin_url: string | null;
  seniority: string | null;
  departments: string[];
  organization_name: string | null;
};

export type ApolloOrganization = {
  id: string | null;
  name: string | null;
  domain: string;
  website_url: string | null;
  linkedin_url: string | null;
  twitter_url: string | null;
  facebook_url: string | null;
  logo_url: string | null;
  industry: string | null;
  estimated_num_employees: number | null;
  founded_year: number | null;
  city: string | null;
  country: string | null;
  annual_revenue_printed: string | null;
  latest_funding_stage: string | null;
  keywords: string[];
  departmental_head_count: Record<string, number>;
  marketing_team_size: number | null;
  technologies: string[];
};

export type ApolloEnrichmentResult = {
  organization: ApolloOrganization | null;
  decision_makers: ApolloPerson[];
  people_search_available: boolean;
  people_search_note: string | null;
  fetched_at: string;
};

export type ApolloHealthStatus = {
  configured: boolean;
  healthy: boolean;
  plan_limitation?: string;
  error?: string;
};

// ── Organization enrich ───────────────────────────────────────────────────────

/**
 * Enrich a company by domain — works on Apollo Free (consumes credits).
 */
export async function enrichOrganization(domain: string): Promise<ApolloOrganization | null> {
  const cleanDomain = cleanDomainInput(domain);
  if (!cleanDomain) return null;

  const json = await apolloGet<{ organization?: RawApolloOrg }>(
    `/organizations/enrich?domain=${encodeURIComponent(cleanDomain)}`
  );

  if (!json.organization) return null;
  return normalizeOrganization(json.organization, cleanDomain);
}

/**
 * Search + enrich company intelligence. Runs org enrich and (if plan allows) people search.
 */
export async function enrichCompanyApollo(
  domain: string,
  companyName?: string
): Promise<ApolloEnrichmentResult> {
  const cleanDomain = cleanDomainInput(domain);

  const [organization, peopleResult] = await Promise.all([
    enrichOrganization(cleanDomain).catch((err) => {
      logger.warn("Apollo org enrich failed", { domain: cleanDomain, error: String(err) });
      return null;
    }),
    searchDecisionMakers(cleanDomain, companyName).catch((err) => {
      logger.warn("Apollo people search failed", { domain: cleanDomain, error: String(err) });
      return { people: [] as ApolloPerson[], available: false, note: String(err) };
    }),
  ]);

  return {
    organization,
    decision_makers: peopleResult.people,
    people_search_available: peopleResult.available,
    people_search_note: peopleResult.note,
    fetched_at: new Date().toISOString(),
  };
}

/**
 * Find decision-makers at a company (titles: CMO, Marketing Director, Sponsorship, etc.).
 * Requires paid Apollo plan — returns empty list with note on Free tier.
 */
export async function searchDecisionMakers(
  domain: string,
  _companyName?: string
): Promise<{ people: ApolloPerson[]; available: boolean; note: string | null }> {
  const cleanDomain = cleanDomainInput(domain);

  try {
    const json = await apolloPost<{ people?: RawApolloPerson[]; pagination?: { total_entries?: number } }>(
      "/mixed_people/search",
      {
        q_organization_domains: cleanDomain,
        person_titles: SPONSORSHIP_TITLES,
        person_seniorities: ["c_suite", "vp", "director", "head"],
        page: 1,
        per_page: 15,
      }
    );

    const people = (json.people ?? []).map(normalizePerson);
    logger.info("Apollo people search complete", { domain: cleanDomain, count: people.length });

    return { people, available: true, note: null };
  } catch (err) {
    if (err instanceof ApolloPlanError) {
      return {
        people: [],
        available: false,
        note: "People search requires Apollo Basic plan or higher. Organization enrichment is still active.",
      };
    }
    throw err;
  }
}

// ── Organization search by name ───────────────────────────────────────────────

/**
 * Find an organization by company name alone (no domain required).
 * Uses Apollo's organization search endpoint — works on Free tier.
 * Returns the best matching org, or null if none found.
 */
export async function searchOrganizationByName(
  companyName: string,
  country?: string
): Promise<ApolloOrganization | null> {
  if (!companyName?.trim()) return null;

  try {
    const body: Record<string, unknown> = {
      q_organization_name: companyName.trim(),
      page: 1,
      per_page: 5,
    };
    if (country) body.organization_locations = [country];

    const json = await apolloPost<{
      organizations?: RawApolloOrg[];
      pagination?: { total_entries?: number };
    }>("/organizations/search", body);

    const orgs = json.organizations ?? [];
    if (orgs.length === 0) return null;

    // Return the first result — closest name match
    const first = orgs[0];
    const domain = first.website_url
      ? first.website_url.replace(/^https?:\/\/(www\.)?/, "").split("/")[0].toLowerCase()
      : companyName.toLowerCase().replace(/\s+/g, "") + ".com";

    logger.info("Apollo org search by name complete", {
      query: companyName,
      found: orgs.length,
      top: first.name ?? "(unnamed)",
      domain,
    });

    return normalizeOrganization(first, domain);
  } catch (err) {
    if (err instanceof ApolloPlanError) {
      logger.warn("Apollo org search not available on this plan", { company: companyName });
      return null;
    }
    logger.warn("Apollo org search by name failed", { company: companyName, error: String(err) });
    return null;
  }
}

// ── Health check ──────────────────────────────────────────────────────────────

export async function checkApolloHealth(): Promise<ApolloHealthStatus> {
  const apiKey = process.env.APOLLO_API_KEY ?? "";
  if (!apiKey || apiKey.length < 8) {
    return { configured: false, healthy: false, error: "APOLLO_API_KEY not set" };
  }

  try {
    const res = await fetch("https://api.apollo.io/v1/auth/health", {
      headers: { "Content-Type": "application/json", "X-Api-Key": apiKey },
      signal: AbortSignal.timeout(8_000),
    });

    if (!res.ok) {
      return { configured: true, healthy: false, error: `Health check returned ${res.status}` };
    }

    const json = await res.json() as { healthy?: boolean; is_logged_in?: boolean };
    if (!json.healthy) {
      return { configured: true, healthy: false, error: "Apollo API key not valid" };
    }

    // Probe people search availability
    let planLimitation: string | undefined;
    try {
      await apolloPost("/mixed_people/search", {
        q_organization_domains: "example.com",
        page: 1,
        per_page: 1,
      });
    } catch (err) {
      if (err instanceof ApolloPlanError) {
        planLimitation = "Free plan: org enrich active; people search needs upgrade";
      }
    }

    return {
      configured: true,
      healthy: true,
      plan_limitation: planLimitation,
    };
  } catch (err) {
    return {
      configured: true,
      healthy: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

// ── HTTP helpers ──────────────────────────────────────────────────────────────

function getApiKey(): string {
  const key = process.env.APOLLO_API_KEY ?? "";
  if (!key) throw new ApolloConfigError("APOLLO_API_KEY is not configured");
  return key;
}

async function apolloGet<T>(path: string): Promise<T> {
  const res = await fetch(`${APOLLO_BASE}${path}`, {
    headers: {
      "Content-Type": "application/json",
      "X-Api-Key": getApiKey(),
      "Cache-Control": "no-cache",
    },
    signal: AbortSignal.timeout(20_000),
  });
  return parseApolloResponse<T>(res);
}

async function apolloPost<T>(path: string, body: Record<string, unknown>): Promise<T> {
  const res = await fetch(`${APOLLO_BASE}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Api-Key": getApiKey(),
      "Cache-Control": "no-cache",
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(20_000),
  });
  return parseApolloResponse<T>(res);
}

async function parseApolloResponse<T>(res: Response): Promise<T> {
  const text = await res.text();
  let json: Record<string, unknown>;
  try {
    json = JSON.parse(text) as Record<string, unknown>;
  } catch {
    throw new ApolloApiError(`Apollo API invalid JSON (${res.status}): ${text.slice(0, 200)}`);
  }

  if (!res.ok || json.error) {
    const errMsg = String(json.error ?? `HTTP ${res.status}`);
    if (json.error_code === "API_INACCESSIBLE" || errMsg.includes("not accessible")) {
      throw new ApolloPlanError(errMsg);
    }
    throw new ApolloApiError(`Apollo API error: ${errMsg}`);
  }

  return json as T;
}

// ── Normalize ─────────────────────────────────────────────────────────────────

function normalizeOrganization(raw: RawApolloOrg, domain: string): ApolloOrganization {
  const deptCounts = raw.departmental_head_count ?? {};
  const marketingSize =
    deptCounts.marketing ??
    deptCounts["media_and_commmunication"] ??
    deptCounts.media_and_communication ??
    null;

  const technologies = (raw.current_technologies ?? [])
    .map((t) => (typeof t === "string" ? t : t?.name))
    .filter((t): t is string => !!t)
    .slice(0, 12);

  return {
    id: raw.id ?? null,
    name: raw.name ?? null,
    domain,
    website_url: raw.website_url ?? null,
    linkedin_url: raw.linkedin_url ?? null,
    twitter_url: raw.twitter_url ?? null,
    facebook_url: raw.facebook_url ?? null,
    logo_url: raw.logo_url ?? null,
    industry: raw.industry ?? raw.industries?.[0] ?? null,
    estimated_num_employees: raw.estimated_num_employees ?? null,
    founded_year: raw.founded_year ?? null,
    city: raw.city ?? null,
    country: raw.country ?? null,
    annual_revenue_printed: raw.annual_revenue_printed ?? null,
    latest_funding_stage: raw.latest_funding_stage ?? null,
    keywords: (raw.keywords ?? []).slice(0, 10),
    departmental_head_count: deptCounts,
    marketing_team_size: marketingSize,
    technologies,
  };
}

function normalizePerson(raw: RawApolloPerson): ApolloPerson {
  const org = raw.organization ?? raw.account ?? {};
  return {
    id: raw.id ?? null,
    name: raw.name ?? ([raw.first_name, raw.last_name].filter(Boolean).join(" ") || "Unknown"),
    title: raw.title ?? null,
    email: raw.email ?? null,
    linkedin_url: raw.linkedin_url ?? null,
    seniority: raw.seniority ?? null,
    departments: raw.departments ?? [],
    organization_name: (org as { name?: string }).name ?? raw.organization_name ?? null,
  };
}

function cleanDomainInput(domain: string): string {
  if (!domain) return "";
  return domain
    .replace(/^https?:\/\/(www\.)?/, "")
    .split("/")[0]
    .toLowerCase();
}

// ── Raw API types ─────────────────────────────────────────────────────────────

type RawApolloOrg = {
  id?: string;
  name?: string;
  website_url?: string;
  linkedin_url?: string;
  twitter_url?: string;
  facebook_url?: string;
  logo_url?: string;
  industry?: string;
  industries?: string[];
  estimated_num_employees?: number;
  founded_year?: number;
  city?: string;
  country?: string;
  annual_revenue_printed?: string;
  latest_funding_stage?: string;
  keywords?: string[];
  departmental_head_count?: Record<string, number>;
  current_technologies?: Array<string | { name?: string }>;
};

type RawApolloPerson = {
  id?: string;
  name?: string;
  first_name?: string;
  last_name?: string;
  title?: string;
  email?: string;
  linkedin_url?: string;
  seniority?: string;
  departments?: string[];
  organization_name?: string;
  organization?: { name?: string };
  account?: { name?: string };
};

// ── Errors ────────────────────────────────────────────────────────────────────

export class ApolloConfigError extends Error {
  constructor(msg: string) { super(msg); this.name = "ApolloConfigError"; }
}
export class ApolloApiError extends Error {
  constructor(msg: string) { super(msg); this.name = "ApolloApiError"; }
}
export class ApolloPlanError extends Error {
  constructor(msg: string) { super(msg); this.name = "ApolloPlanError"; }
}
