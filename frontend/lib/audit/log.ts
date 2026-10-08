import { supabaseAdmin } from "@/lib/supabase/server";
import { resolveTenantId } from "@/lib/tenants/current";
import { actorProblems, finalizeActor, type Actor } from "@/lib/identity/actor";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function toUuidOrNull(value: string | null | undefined): string | null {
  if (!value) return null;
  return UUID_RE.test(value) ? value : null;
}

export interface AuditEntry {
  entity_type: string;
  entity_id?: string | null;
  action: string;
  /** Who did it. Required: an entry nobody can be held to is not an audit entry. */
  actor: Actor;
  metadata?: Record<string, unknown>;
  /** Phase 4 — usually omitted; resolved from the current session via
   *  resolveTenantId() when not passed explicitly. Pass it only when
   *  recording on behalf of a different tenant than the current request
   *  (rare — e.g. a background job iterating multiple tenants). */
  tenant_id?: string | null;
  /** Correlates the entries written while handling one request or one agent run. */
  request_id?: string | null;
  /** Still accepted from older call sites; the actor is what is recorded. */
  performed_by?: string | null;
  actor_email?: string | null;
}

type Sb = { from: (t: string) => any };

/** Builds the row as it is stored, with the actor spelled out. */
export function auditRow(entry: AuditEntry, tenantId: string) {
  const actor = finalizeActor(entry.actor, entry.action);
  return {
    tenant_id: tenantId,
    entity_type: entry.entity_type,
    entity_id: toUuidOrNull(entry.entity_id),
    action: entry.action,
    actor_kind: actor.kind,
    actor_id: actor.id,
    actor_label: actor.label,
    actor_role: actor.role ?? null,
    on_behalf_of: actor.onBehalfOf ?? null,
    request_id: entry.request_id ?? null,
    // Always null: this column points at the legacy public.users table, not at platform users, so writing a
    // platform user id here fails the foreign key and loses the whole entry. The person is in actor_id/actor_email.
    performed_by: null,
    actor_email: actor.email ?? null,
    metadata: entry.metadata ?? {},
  };
}

/** The columns added by migration 0069; their absence means the migration is not applied yet. */
const NEW_COLUMNS = ["actor_kind", "actor_id", "actor_label", "actor_role", "on_behalf_of", "request_id"] as const;
const isMissingColumn = (e: { code?: string; message?: string } | null) =>
  !!e && (e.code === "42703" || e.code === "PGRST204" || /column .* (does not exist|of 'audit_logs')/i.test(e.message ?? ""));

/**
 * Writes one entry. Returns false when it could not be stored. Before migration 0069 is applied the new
 * columns do not exist: the entry is then stored the old way with the actor folded into its metadata, so
 * nothing is lost while the migration is pending.
 */
export async function insertAudit(sb: Sb, tenantId: string, entry: AuditEntry): Promise<{ ok: boolean; degraded?: boolean; error?: string }> {
  const problems = actorProblems(entry.actor);
  if (problems.length > 0) return { ok: false, error: `invalid actor: ${problems.join("; ")}` };
  const row = auditRow(entry, tenantId);
  const { error } = await sb.from("audit_logs").insert(row);
  if (!error) return { ok: true };
  if (!isMissingColumn(error)) return { ok: false, error: error.message };
  const legacy: Record<string, unknown> = { ...row };
  for (const c of NEW_COLUMNS) delete legacy[c];
  legacy.metadata = { ...(row.metadata as object), actor: { kind: row.actor_kind, id: row.actor_id, label: row.actor_label, role: row.actor_role, on_behalf_of: row.on_behalf_of }, request_id: row.request_id };
  const second = await sb.from("audit_logs").insert(legacy);
  return second.error ? { ok: false, error: second.error.message } : { ok: true, degraded: true };
}

/**
 * Insert an audit log row. Never throws — failure is logged but does not
 * break the calling business action.
 */
export async function recordAudit(entry: AuditEntry): Promise<void> {
  try {
    const tenantId = await resolveTenantId(entry.tenant_id);
    const res = await insertAudit(supabaseAdmin(), tenantId, entry);
    if (!res.ok) console.error("[audit] insert failed", res.error);
  } catch (err) {
    console.error("[audit] insert threw", err);
  }
}
