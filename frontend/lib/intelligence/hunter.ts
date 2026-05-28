/**
 * Hunter.io Client
 * Domain → decision maker emails, names, job titles, LinkedIn profiles.
 * Docs: https://hunter.io/api-documentation
 */

import { logger } from "@/lib/monitoring/logger";

const HUNTER_BASE = "https://api.hunter.io/v2";

// ── Types ─────────────────────────────────────────────────────────────────────

export type HunterContact = {
  email: string;
  first_name: string | null;
  last_name: string | null;
  full_name: string;
  position: string | null;
  seniority: "junior" | "senior" | "executive" | null;
  department: string | null;
  linkedin: string | null;
  twitter: string | null;
  phone_number: string | null;
  confidence: number; // 0–100
  sources: Array<{ domain: string; extracted_on: string }>;
};

export type HunterDomainResult = {
  domain: string;
  organization: string | null;
  description: string | null;
  twitter: string | null;
  facebook: string | null;
  linkedin: string | null;
  instagram: string | null;
  youtube: string | null;
  employee_count: number | null;
  country: string | null;
  emails: HunterContact[];
  total_emails_found: number;
  decision_makers: HunterContact[]; // filtered senior/exec contacts
  fetched_at: string;
};

export type HunterHealthStatus = {
  configured: boolean;
  healthy: boolean;
  plan?: string;
  requests_remaining?: number;
  error?: string;
};

// ── Domain search ─────────────────────────────────────────────────────────────

/**
 * Find all emails for a domain. Returns up to 10 contacts by default.
 * Filters decision makers automatically (seniority: senior | executive).
 */
export async function searchDomain(
  domain: string,
  limit = 10
): Promise<HunterDomainResult> {
  const apiKey = process.env.HUNTER_API_KEY ?? "";
  if (!apiKey) throw new HunterConfigError("HUNTER_API_KEY is not configured");

  const cleanDomain = domain.replace(/^https?:\/\/(www\.)?/, "").split("/")[0];

  const url = new URL(`${HUNTER_BASE}/domain-search`);
  url.searchParams.set("domain", cleanDomain);
  url.searchParams.set("limit", String(Math.min(limit, 100)));
  url.searchParams.set("api_key", apiKey);

  logger.info("Hunter.io domain search", { domain: cleanDomain });

  const res = await fetch(url.toString(), {
    headers: { "Accept": "application/json" },
    signal: AbortSignal.timeout(15_000),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new HunterApiError(`Hunter.io API error ${res.status}: ${body}`);
  }

  const json = await res.json() as HunterDomainResponse;
  const d = json.data;

  const emails: HunterContact[] = (d.emails ?? []).map(normalizeContact);

  const decisionMakers = emails.filter(
    (e) => e.seniority === "executive" || e.seniority === "senior"
  );

  logger.info("Hunter.io domain search complete", {
    domain: cleanDomain,
    total: d.meta?.total ?? emails.length,
    decision_makers: decisionMakers.length,
  });

  return {
    domain: cleanDomain,
    organization: d.organization ?? null,
    description: d.description ?? null,
    twitter: d.twitter ?? null,
    facebook: d.facebook ?? null,
    linkedin: d.linkedin ?? null,
    instagram: d.instagram ?? null,
    youtube: d.youtube ?? null,
    employee_count: d.employees ?? null,
    country: d.country ?? null,
    emails,
    total_emails_found: d.meta?.total ?? emails.length,
    decision_makers: decisionMakers,
    fetched_at: new Date().toISOString(),
  };
}

/**
 * Verify a single email address via Hunter.io.
 * Returns confidence score 0–100.
 */
export async function verifyEmail(email: string): Promise<{ email: string; status: string; score: number }> {
  const apiKey = process.env.HUNTER_API_KEY ?? "";
  if (!apiKey) throw new HunterConfigError("HUNTER_API_KEY is not configured");

  const url = new URL(`${HUNTER_BASE}/email-verifier`);
  url.searchParams.set("email", email);
  url.searchParams.set("api_key", apiKey);

  const res = await fetch(url.toString(), { signal: AbortSignal.timeout(10_000) });
  if (!res.ok) throw new HunterApiError(`Hunter.io verify error ${res.status}`);

  const json = await res.json() as { data: { email: string; status: string; score: number } };
  return {
    email: json.data.email,
    status: json.data.status, // "valid" | "invalid" | "risky" | "unknown"
    score: json.data.score ?? 0,
  };
}

// ── Health check ──────────────────────────────────────────────────────────────

export async function checkHunterHealth(): Promise<HunterHealthStatus> {
  const apiKey = process.env.HUNTER_API_KEY ?? "";
  if (!apiKey || apiKey.length < 10) {
    return { configured: false, healthy: false, error: "HUNTER_API_KEY not set" };
  }

  try {
    const url = new URL(`${HUNTER_BASE}/account`);
    url.searchParams.set("api_key", apiKey);
    const res = await fetch(url.toString(), { signal: AbortSignal.timeout(8_000) });
    if (!res.ok) return { configured: true, healthy: false, error: `API returned ${res.status}` };

    const json = await res.json() as { data?: { plan_name?: string; requests?: { available?: number } } };
    return {
      configured: true,
      healthy: true,
      plan: json.data?.plan_name ?? "unknown",
      requests_remaining: json.data?.requests?.available ?? undefined,
    };
  } catch (err) {
    return {
      configured: true,
      healthy: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

// ── Normalize ─────────────────────────────────────────────────────────────────

function normalizeContact(raw: RawHunterEmail): HunterContact {
  const firstName = raw.first_name ?? "";
  const lastName = raw.last_name ?? "";
  return {
    email: raw.value ?? raw.email ?? "",
    first_name: firstName || null,
    last_name: lastName || null,
      full_name: ([firstName, lastName].filter(Boolean).join(" ")) || (raw.value ?? ""),
    position: raw.position ?? null,
    seniority: (raw.seniority as HunterContact["seniority"]) ?? null,
    department: raw.department ?? null,
    linkedin: raw.linkedin ?? null,
    twitter: raw.twitter ?? null,
    phone_number: raw.phone_number ?? null,
    confidence: raw.confidence ?? 0,
    sources: (raw.sources ?? []).map((s) => ({ domain: s.domain ?? "", extracted_on: s.extracted_on ?? "" })),
  };
}

// ── Raw API types ─────────────────────────────────────────────────────────────

type RawHunterEmail = {
  value?: string;
  email?: string;
  first_name?: string;
  last_name?: string;
  position?: string;
  seniority?: string;
  department?: string;
  linkedin?: string;
  twitter?: string;
  phone_number?: string;
  confidence?: number;
  sources?: Array<{ domain?: string; extracted_on?: string }>;
};

type HunterDomainResponse = {
  data: {
    domain?: string;
    organization?: string;
    description?: string;
    twitter?: string;
    facebook?: string;
    linkedin?: string;
    instagram?: string;
    youtube?: string;
    employees?: number;
    country?: string;
    emails?: RawHunterEmail[];
    meta?: { total?: number };
  };
};

// ── Errors ────────────────────────────────────────────────────────────────────

export class HunterConfigError extends Error {
  constructor(msg: string) { super(msg); this.name = "HunterConfigError"; }
}
export class HunterApiError extends Error {
  constructor(msg: string) { super(msg); this.name = "HunterApiError"; }
}
