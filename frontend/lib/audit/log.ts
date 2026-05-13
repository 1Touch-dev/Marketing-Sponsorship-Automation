import { supabaseAdmin } from "@/lib/supabase/server";

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
      entity_id: entry.entity_id ?? null,
      action: entry.action,
      performed_by: entry.performed_by ?? null,
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
