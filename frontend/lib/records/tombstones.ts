import type { WriteResult } from "../accounts/store";
import type { Actor } from "../identity/actor";
import { isMissingMigration } from "../proposals/revision-store";

type Sb = any;

/** The core tables a person can delete. The database also keeps a tombstone for every table a delete cascades into (migration 0071). */
export const TOMBSTONED_TABLES = [
  "companies", "contacts", "proposals", "campaigns", "matches", "team_members", "contracts", "opportunities", "projects",
  "obligations", "value_lines", "inventory_items", "email_templates", "warmup_sequences", "barter_items", "pipeline_leads",
] as const;
export type TombstonedTable = (typeof TOMBSTONED_TABLES)[number];

const notSetUp = "Tombstones are not set up yet (migration 0069).";

// ── what a delete would take with it ────────────────────────────────────────

export interface Preview { dependents: Record<string, number>; blockers: string[] }

const count = async (q: PromiseLike<{ count: number | null; error: unknown }>): Promise<number> => {
  const r = await q;
  return r.error ? 0 : r.count ?? 0;
};

/**
 * Live commitments that make a delete a decision, not a tidy-up: money or work that depends on the record.
 * Deleting such a record needs an explicit confirmation and a written reason.
 */
export async function liveCommitments(sb: Sb, tenantId: string, table: string, id: string): Promise<string[]> {
  const out: string[] = [];
  const head = (t: string) => sb.from(t).select("id", { count: "exact", head: true }).eq("tenant_id", tenantId);
  if (table === "companies") {
    const inForce = await count(head("contracts").eq("company_id", id).in("status", ["active", "completed", "expired"]));
    if (inForce > 0) out.push(`${inForce} contract${inForce === 1 ? " is" : "s are"} in force`);
    const obs = await count(head("obligations").eq("company_id", id));
    if (obs > 0) out.push(`${obs} delivery obligation${obs === 1 ? "" : "s"} (with their proof) depend on it`);
    const lines = await count(head("value_lines").eq("company_id", id));
    if (lines > 0) out.push(`${lines} cash or barter line${lines === 1 ? "" : "s"} would be removed`);
    const recaps = await count(head("sponsor_recaps").eq("company_id", id));
    if (recaps > 0) out.push(`${recaps} issued recap${recaps === 1 ? "" : "s"} would be removed`);
  }
  if (table === "proposals") {
    const contracts = await count(head("contracts").eq("proposal_id", id));
    if (contracts > 0) out.push(`${contracts} contract${contracts === 1 ? " was" : "s were"} made from it`);
  }
  if (table === "contracts") {
    const obs = await count(head("obligations").eq("contract_id", id));
    if (obs > 0) out.push(`${obs} delivery obligation${obs === 1 ? "" : "s"} depend on it`);
  }
  return out;
}

export async function previewDeletion(sb: Sb, tenantId: string, table: string, id: string): Promise<WriteResult<Preview>> {
  if (!(TOMBSTONED_TABLES as readonly string[]).includes(table)) return { ok: false, status: 400, error: `Unknown record type "${table}".` };
  const { data: row } = await sb.from(table).select("id").eq("id", id).eq("tenant_id", tenantId).maybeSingle();
  if (!row) return { ok: false, status: 404, error: "Record not found" };
  const dep = await sb.rpc("tombstone_dependents", { p_table: table, p_id: id });
  const dependents: Record<string, number> = dep.error ? {} : { ...((dep.data as Record<string, number>) ?? {}) };
  // records that would be unlinked, not removed (before migration 0071 this is simply unavailable)
  const det = await sb.rpc("tombstone_detached", { p_table: table, p_id: id });
  if (!det.error) {
    for (const [key, ids] of Object.entries((det.data ?? {}) as Record<string, string[]>)) dependents[`${key} (unlinked)`] = ids.length;
  }
  return { ok: true, value: { dependents, blockers: await liveCommitments(sb, tenantId, table, id) } };
}

// ── deleting ────────────────────────────────────────────────────────────────

export interface DeleteInput { table: string; id: string; tenantId: string; actor: Actor; reason?: string | null; confirm?: boolean }
export type DeleteResult = { ok: true; dependents: Record<string, number>; attributed: boolean } | { ok: false; status: number; error: string; blockers?: string[]; dependents?: Record<string, number> };

/**
 * Deletes a record the way every delete should go: the person says it first (so the tombstone names them and
 * why), the database keeps the snapshot, and a record other things depend on needs a confirmation and a reason.
 */
export async function deleteRecord(sb: Sb, i: DeleteInput): Promise<DeleteResult> {
  const preview = await previewDeletion(sb, i.tenantId, i.table, i.id);
  if (!preview.ok) return preview;
  const reason = i.reason?.trim() || null;
  if (preview.value.blockers.length > 0) {
    if (!i.confirm) {
      return { ok: false, status: 409, error: `Deleting this removes work and records that depend on it: ${preview.value.blockers.join("; ")}. Send confirm=true with a reason (10+ characters) to proceed. It can be undone from the tombstone.`, blockers: preview.value.blockers, dependents: preview.value.dependents };
    }
    if (!reason || reason.length < 10) return { ok: false, status: 400, error: "A reason (10+ characters) is required to delete a record that other work depends on.", blockers: preview.value.blockers, dependents: preview.value.dependents };
  }
  const intent = await sb.from("tombstone_intents").insert({ tenant_id: i.tenantId, record_type: i.table, record_id: i.id, actor_kind: i.actor.kind === "approver" ? "human" : i.actor.kind, actor_id: i.actor.email ?? i.actor.id, reason });
  const attributed = !intent.error;
  const { error } = await sb.from(i.table).delete().eq("id", i.id).eq("tenant_id", i.tenantId);
  if (error) {
    if (error.code === "23503") return { ok: false, status: 409, error: "Other records still point at this one and cannot be removed with it.", dependents: preview.value.dependents };
    return { ok: false, status: 500, error: error.message };
  }
  return { ok: true, dependents: preview.value.dependents, attributed };
}

/** The reason and confirmation a caller sent, from the query string or a JSON body. */
export async function readDeleteOptions(req: Request): Promise<{ reason: string | null; confirm: boolean }> {
  const u = new URL(req.url).searchParams;
  let body: { reason?: unknown; confirm?: unknown } = {};
  try { body = await req.clone().json(); } catch { /* a delete usually has no body */ }
  const reason = (u.get("reason") ?? (typeof body.reason === "string" ? body.reason : null))?.slice(0, 500) ?? null;
  return { reason, confirm: u.get("confirm") === "true" || body.confirm === true };
}

// ── reading and undoing ─────────────────────────────────────────────────────

export interface TombstoneRow {
  id: string; seq: number; record_type: string; record_id: string; dependents: Record<string, number>; deleted_by_kind: string; deleted_by: string;
  attributed: boolean; reason: string | null; group_id: string; deleted_at: string; restored_at: string | null; restored_by: string | null; restore_note: string | null;
}
const COLS = "id, seq, record_type, record_id, dependents, deleted_by_kind, deleted_by, attributed, reason, group_id, deleted_at, restored_at, restored_by, restore_note";

export async function listTombstones(sb: Sb, tenantId: string, f: { type?: string | null; recordId?: string | null; includeRestored?: boolean; limit?: number } = {}): Promise<WriteResult<TombstoneRow[]>> {
  let q = sb.from("record_tombstones").select(COLS).eq("tenant_id", tenantId).order("seq", { ascending: false }).limit(Math.min(f.limit ?? 100, 500));
  if (f.type) q = q.eq("record_type", f.type);
  if (f.recordId) q = q.eq("record_id", f.recordId);
  if (!f.includeRestored) q = q.is("restored_at", null);
  const { data, error } = await q;
  if (error) return isMissingMigration(error) ? { ok: false, status: 503, error: notSetUp } : { ok: false, status: 500, error: error.message };
  return { ok: true, value: (data ?? []) as TombstoneRow[] };
}

export async function getTombstone(sb: Sb, tenantId: string, id: string): Promise<WriteResult<TombstoneRow & { snapshot: Record<string, unknown>; same_deletion: Array<{ id: string; record_type: string; record_id: string; restored_at: string | null }> }>> {
  const { data, error } = await sb.from("record_tombstones").select(`${COLS}, snapshot`).eq("id", id).eq("tenant_id", tenantId).maybeSingle();
  if (error) return isMissingMigration(error) ? { ok: false, status: 503, error: notSetUp } : { ok: false, status: 500, error: error.message };
  if (!data) return { ok: false, status: 404, error: "Tombstone not found" };
  const { data: group } = await sb.from("record_tombstones").select("id, record_type, record_id, restored_at").eq("tenant_id", tenantId).eq("group_id", data.group_id).order("seq", { ascending: true });
  return { ok: true, value: { ...(data as TombstoneRow & { snapshot: Record<string, unknown> }), same_deletion: group ?? [] } };
}

/** Undo a deletion: everything that one delete removed comes back, with the same IDs. */
export async function restoreTombstone(sb: Sb, tenantId: string, id: string, actorEmail: string, note?: string | null): Promise<WriteResult<{ restored: Array<{ record_type: string; record_id: string }>; relinked: Record<string, number> }>> {
  const t = await sb.from("record_tombstones").select("id").eq("id", id).eq("tenant_id", tenantId).maybeSingle();
  if (!t.data) return { ok: false, status: 404, error: "Tombstone not found" };
  const { data, error } = await sb.rpc("restore_tombstone_group", { p_tombstone: id, p_actor: actorEmail, p_note: note?.trim() || null });
  if (error) {
    if (isMissingMigration(error)) return { ok: false, status: 503, error: notSetUp };
    const conflict = /already undone|cannot be undone|duplicate key|already exists|violates/i.test(error.message);
    return { ok: false, status: conflict ? 409 : 500, error: /duplicate key/i.test(error.message) ? "A record with the same ID exists again, so this deletion cannot be undone as it was." : error.message };
  }
  // migration 0069 returned a list of restored records; 0071 returns { restored, relinked }
  if (Array.isArray(data)) return { ok: true, value: { restored: data as Array<{ record_type: string; record_id: string }>, relinked: {} } };
  return { ok: true, value: { restored: (data?.restored ?? []) as Array<{ record_type: string; record_id: string }>, relinked: (data?.relinked ?? {}) as Record<string, number> } };
}

/** True when this record was deleted and not restored: an outside system must not recreate it. */
export async function isTombstoned(sb: Sb, tenantId: string, recordType: string, recordId: string): Promise<boolean> {
  const { data, error } = await sb.from("record_tombstones").select("id").eq("tenant_id", tenantId).eq("record_type", recordType).eq("record_id", recordId).is("restored_at", null).limit(1);
  return !error && (data?.length ?? 0) > 0;
}

/** Says, for a batch of records about to be deleted by a script or job, who is deleting them and why. */
export async function declareDeletes(sb: Sb, table: string, rows: Array<{ id: string; tenant_id: string }>, actor: Actor, reason: string): Promise<void> {
  if (rows.length === 0) return;
  await sb.from("tombstone_intents").insert(rows.map((r) => ({ tenant_id: r.tenant_id, record_type: table, record_id: r.id, actor_kind: actor.kind === "approver" ? "human" : actor.kind, actor_id: actor.email ?? actor.id, reason })));
}
