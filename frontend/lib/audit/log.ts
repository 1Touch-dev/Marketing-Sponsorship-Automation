import { supabaseAdmin } from "@/lib/supabase/server";
import { resolveTenantId } from "@/lib/tenants/current";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function toUuidOrNull(value: string | null | undefined): string | null {
  if (!value) return null;
  return UUID_RE.test(value) ? value : null;
}

export interface AuditEntry {
  entity_type: string;
  entity_id?: string | null;
  action: string;
  performed_by?: string | null;
  actor_email?: string | null;
  metadata?: Record<string, unknown>;
  /** Phase 4 — usually omitted; resolved from the current session via
   *  resolveTenantId() when not passed explicitly. Pass it only when
   *  recording on behalf of a different tenant than the current request
   *  (rare — e.g. a background job iterating multiple tenants). */
  tenant_id?: string | null;
}

/**
 * Insert an audit log row. Never throws — failure is logged but does not
 * break the calling business action.
 */
export async function recordAudit(entry: AuditEntry): Promise<void> {
  try {
    const sb = supabaseAdmin();
    const tenantId = await resolveTenantId(entry.tenant_id);
    const { error } = await sb.from("audit_logs").insert({
      tenant_id: tenantId,
      entity_type: entry.entity_type,
      entity_id: toUuidOrNull(entry.entity_id),
      action: entry.action,
      // Guard: performed_by is a UUID column — drop non-UUID session token strings
      performed_by: toUuidOrNull(entry.performed_by),
      actor_email: entry.actor_email ?? null,
      metadata: entry.metadata ?? {},
    });
    if (error) {
      console.error("[audit] insert failed", error.message);
    }
  } catch (err) {
    console.error("[audit] insert threw", err);
  }
}
