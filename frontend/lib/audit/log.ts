import { supabaseAdmin } from "@/lib/supabase/server";

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
}

/**
 * Insert an audit log row. Never throws — failure is logged but does not
 * break the calling business action.
 */
export async function recordAudit(entry: AuditEntry): Promise<void> {
  try {
    const sb = supabaseAdmin();
    const { error } = await sb.from("audit_logs").insert({
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
