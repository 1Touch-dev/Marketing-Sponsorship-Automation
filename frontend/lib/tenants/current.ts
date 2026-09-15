import { supabaseAdmin } from "@/lib/supabase/server";
import { getCurrentPlatformUser } from "@/lib/auth/server-permission";
import type { Tenant } from "./types";
import { CORITIBA_TENANT_ID } from "./types";

/**
 * Phase 4 — multi-tenancy foundation. No subdomain/custom-domain routing
 * exists yet (that's later Phase 4/9 work — white-label theming per
 * tenant), so a request's tenant is resolved from the logged-in user's
 * own `platform_users.tenant_id` — the same identity resolution
 * `getCurrentPlatformUser()` already does for RBAC.
 */
export async function getCurrentTenant(): Promise<Tenant | null> {
  const user = await getCurrentPlatformUser();
  if (!user) return null;
  return getTenantById(user.tenant_id);
}

export async function getTenantById(tenantId: string): Promise<Tenant | null> {
  const sb = supabaseAdmin();
  const { data } = await sb
    .from("tenants" as "companies")
    .select("*")
    .eq("id" as "id", tenantId)
    .maybeSingle();
  return (data as unknown as Tenant | null) ?? null;
}

/** Convenience for code paths that need a tenant ID but can't await a
 *  full user lookup (e.g. a background job) — falls back to the
 *  original Coritiba tenant rather than throwing, since every table's
 *  tenant_id is NOT NULL. */
export async function resolveTenantId(explicit?: string | null): Promise<string> {
  if (explicit) return explicit;
  const user = await getCurrentPlatformUser();
  return user?.tenant_id ?? CORITIBA_TENANT_ID;
}
