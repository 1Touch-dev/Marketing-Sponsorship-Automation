/**
 * Phase 4 — multi-tenancy foundation (migration 0047).
 *
 * `club_facts` replaces hardcoded Coritiba facts in AI prompts
 * (lib/bedrock/prompts.ts) — every AI feature that used to reference
 * "Coritiba FC" / "Couto Pereira" / etc. by literal string now reads
 * these fields from the requesting user's tenant instead.
 */
export interface TenantBranding {
  primary_color?: string;
  secondary_color?: string;
  crest_url?: string;
  logo_url?: string;
}

export interface TenantClubFacts {
  club_name: string;
  short_name?: string;
  nickname?: string;
  stadium_name?: string;
  city?: string;
  state?: string;
  country?: string;
  founded_year?: number;
  follower_count?: string;
  market_context?: string;
}

export type TenantPlan = "internal" | "trial" | "starter" | "growth" | "pro";
export type TenantStatus = "active" | "suspended" | "trial";

export interface Tenant {
  id: string;
  slug: string;
  name: string;
  status: TenantStatus;
  branding: TenantBranding;
  club_facts: TenantClubFacts;
  plan: TenantPlan;
  created_at: string;
  updated_at: string;
}

/** Fixed UUID for the original single-tenant Coritiba operation, seeded by
 *  migration 0047. Referenced anywhere that needs a concrete default
 *  before a request's real tenant is resolvable (e.g. one-off scripts). */
export const CORITIBA_TENANT_ID = "00000000-0000-0000-0000-000000000001";
