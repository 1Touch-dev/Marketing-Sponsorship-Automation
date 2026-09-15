import type { ClubContextInput } from "@/lib/bedrock/prompts";
import { CORITIBA_CLUB_CONTEXT_INPUT } from "@/lib/bedrock/prompts";
import { getTenantById } from "./current";
import { CORITIBA_TENANT_ID } from "./types";
import type { Tenant } from "./types";

/** Maps a `tenants` row onto the shape AI prompt functions expect. Fields
 *  ClubContextInput has but the DB schema doesn't yet (rival_clubs,
 *  typical_attendance, inventory_highlights, brand_rules, typography) are
 *  simply absent for a new tenant — buildClubContext() already handles
 *  those gracefully with generic fallbacks. */
function tenantToClubContext(tenant: Tenant): ClubContextInput {
  return {
    club_facts: { ...tenant.club_facts },
    branding: {
      primary_color: tenant.branding.primary_color,
      secondary_color: tenant.branding.secondary_color,
    },
  };
}

/**
 * Resolves the real club-context facts for a given tenant, for passing into
 * the `tenant` param of any lib/bedrock/prompts.ts function. Falls back to
 * the Coritiba constant for the Coritiba tenant itself (avoids a redundant
 * DB round trip) and for any tenant row that can't be found.
 */
export async function resolveClubContext(tenantId?: string | null): Promise<ClubContextInput> {
  const id = tenantId ?? CORITIBA_TENANT_ID;
  if (id === CORITIBA_TENANT_ID) return CORITIBA_CLUB_CONTEXT_INPUT;
  const tenant = await getTenantById(id);
  if (!tenant) return CORITIBA_CLUB_CONTEXT_INPUT;
  return tenantToClubContext(tenant);
}
