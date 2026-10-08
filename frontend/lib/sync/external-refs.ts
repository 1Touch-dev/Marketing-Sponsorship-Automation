import type { WriteResult } from "../accounts/store";
import { isMissingMigration } from "../proposals/revision-store";
import { isTombstoned } from "../records/tombstones";

type Sb = any;

const notSetUp = "External references are not set up yet (migration 0069).";

export interface ExternalRef { id: string; entity_type: string; entity_id: string; system: string; external_id: string; created_by: string; created_at: string; unlinked_at: string | null; unlinked_by: string | null; unlink_reason: string | null }
const COLS = "id, entity_type, entity_id, system, external_id, created_by, created_at, unlinked_at, unlinked_by, unlink_reason";

/**
 * Records that a record here is the same thing as an ID in an outside system. Safe to repeat: the same link
 * again changes nothing. A record that is already linked to another ID in that system, or an outside ID that
 * already belongs to another record, is refused rather than quietly re-pointed.
 */
export async function linkExternal(sb: Sb, tenantId: string, i: { entityType: string; entityId: string; system: string; externalId: string; actor: string }): Promise<WriteResult<{ id: string; created: boolean }>> {
  if (!i.actor) return { ok: false, status: 403, error: "A signed-in person or a named service is required." };
  if (!i.entityType.trim() || !i.system.trim() || !i.externalId.trim()) return { ok: false, status: 400, error: "entity_type, system and external_id are required." };
  if (await isTombstoned(sb, tenantId, i.entityType, i.entityId)) return { ok: false, status: 409, error: "That record was deleted. It cannot be linked to an outside ID unless the deletion is undone." };

  const mine = await sb.from("external_refs").select(COLS).eq("tenant_id", tenantId).eq("system", i.system).eq("entity_type", i.entityType).eq("entity_id", i.entityId).is("unlinked_at", null).maybeSingle();
  if (mine.error) return isMissingMigration(mine.error) ? { ok: false, status: 503, error: notSetUp } : { ok: false, status: 500, error: mine.error.message };
  if (mine.data) {
    return mine.data.external_id === i.externalId
      ? { ok: true, value: { id: mine.data.id, created: false } }
      : { ok: false, status: 409, error: `This record is already linked to ${i.system} ID ${mine.data.external_id}. Unlink it first, with a reason.` };
  }
  const theirs = await sb.from("external_refs").select(COLS).eq("tenant_id", tenantId).eq("system", i.system).eq("entity_type", i.entityType).eq("external_id", i.externalId).is("unlinked_at", null).maybeSingle();
  if (theirs.data) return { ok: false, status: 409, error: `${i.system} ID ${i.externalId} already belongs to another ${i.entityType} record.` };

  const ins = await sb.from("external_refs").insert({ tenant_id: tenantId, entity_type: i.entityType, entity_id: i.entityId, system: i.system, external_id: i.externalId, created_by: i.actor }).select("id").single();
  if (ins.error) {
    if (ins.error.code === "23505") return { ok: false, status: 409, error: "Another link to this record or this outside ID was made at the same moment." };
    return { ok: false, status: 500, error: ins.error.message };
  }
  return { ok: true, value: { id: ins.data.id, created: true } };
}

export type Resolved = { entity_id: string; deleted: boolean; link_id: string };

/**
 * What an outside ID points at here. `deleted` is true when that record was deleted and not restored: the
 * sync must not create it again, only report it.
 */
export async function resolveExternal(sb: Sb, tenantId: string, system: string, entityType: string, externalId: string): Promise<WriteResult<Resolved | null>> {
  const { data, error } = await sb.from("external_refs").select(COLS).eq("tenant_id", tenantId).eq("system", system).eq("entity_type", entityType).eq("external_id", externalId).is("unlinked_at", null).maybeSingle();
  if (error) return isMissingMigration(error) ? { ok: false, status: 503, error: notSetUp } : { ok: false, status: 500, error: error.message };
  if (!data) return { ok: true, value: null };
  return { ok: true, value: { entity_id: data.entity_id, link_id: data.id, deleted: await isTombstoned(sb, tenantId, entityType, data.entity_id) } };
}

export async function listExternal(sb: Sb, tenantId: string, entityType: string, entityId: string, includeUnlinked = false): Promise<WriteResult<ExternalRef[]>> {
  let q = sb.from("external_refs").select(COLS).eq("tenant_id", tenantId).eq("entity_type", entityType).eq("entity_id", entityId).order("created_at", { ascending: false });
  if (!includeUnlinked) q = q.is("unlinked_at", null);
  const { data, error } = await q;
  if (error) return isMissingMigration(error) ? { ok: false, status: 503, error: notSetUp } : { ok: false, status: 500, error: error.message };
  return { ok: true, value: (data ?? []) as ExternalRef[] };
}

export async function unlinkExternal(sb: Sb, tenantId: string, id: string, reason: string | null | undefined, actor: string): Promise<WriteResult<{ id: string }>> {
  if (!actor) return { ok: false, status: 403, error: "A signed-in person or a named service is required." };
  if (!reason || reason.trim().length < 5) return { ok: false, status: 400, error: "A reason (5+ characters) is required to unlink." };
  const { data: row } = await sb.from("external_refs").select("id, unlinked_at").eq("id", id).eq("tenant_id", tenantId).maybeSingle();
  if (!row) return { ok: false, status: 404, error: "Link not found" };
  if (row.unlinked_at) return { ok: false, status: 409, error: "That link was already unlinked." };
  const { error } = await sb.from("external_refs").update({ unlinked_at: new Date().toISOString(), unlinked_by: actor, unlink_reason: reason.trim() }).eq("id", id).eq("tenant_id", tenantId);
  return error ? { ok: false, status: 500, error: error.message } : { ok: true, value: { id } };
}
