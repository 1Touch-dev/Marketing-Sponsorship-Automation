import { createHash } from "crypto";
import type { WriteResult } from "../accounts/store";
import { listObligations, recordEvent, type ObligationSummary } from "../obligations/store";
import { isMissingMigration } from "../proposals/revision-store";
import { acceptInbound } from "../sync/field-ownership";
import { linkExternal, listExternal, resolveExternal } from "../sync/external-refs";
import type { ExternalChange, TaskPayload, TaskSourceAdapter } from "./adapter";

type Sb = any;

const notSetUp = "The task-source tables are not set up yet (migration 0072).";
const fail = (e: { message: string; code?: string }): { ok: false; status: number; error: string } =>
  isMissingMigration(e) ? { ok: false, status: 503, error: notSetUp } : { ok: false, status: 500, error: e.message };

/** How a platform obligation reads to the outside tool. Pure. */
export function payloadFor(o: Pick<ObligationSummary, "id" | "title" | "description" | "due_date" | "owner_email" | "quantity" | "unit" | "status">, ctx: { contractNumber: string | null; companyName: string | null }): TaskPayload {
  const done = o.status === "delivered" || o.status === "evidenced" || o.status === "accepted";
  return {
    obligationId: o.id, title: o.title, description: o.description ?? null, dueDate: o.due_date, ownerEmail: o.owner_email,
    contractNumber: ctx.contractNumber, companyName: ctx.companyName, quantity: o.quantity ?? null, unit: o.unit ?? null, status: done ? "done" : "open",
  };
}

export const payloadHash = (p: TaskPayload): string => createHash("sha256").update(JSON.stringify([p.title, p.description, p.dueDate, p.ownerEmail, p.contractNumber, p.companyName, p.quantity, p.unit, p.status])).digest("hex");

// ── push: the platform tells the tool ───────────────────────────────────────

export interface PushReport { created: number; updated: number; unchanged: number; skipped: number; failed: Array<{ obligationId: string; error: string }> }

/**
 * Sends in-force obligations to the outside tool. Safe to run again at any time: a task that already exists is found by its
 * stable link (never created twice), a create that timed out is repeated with the same key (the adapter returns the same
 * task), and an obligation that has not changed since it was last sent is not sent again. One failure does not stop the rest.
 */
export async function pushObligations(sb: Sb, adapter: TaskSourceAdapter, tenantId: string, actor: string, opts: { limit?: number } = {}): Promise<WriteResult<PushReport>> {
  const listed = await listObligations(sb, tenantId, {});
  if (!listed.ok) return listed;
  const report: PushReport = { created: 0, updated: 0, unchanged: 0, skipped: 0, failed: [] };

  const contractIds = [...new Set(listed.value.map((o) => o.contract_id))];
  const { data: contracts } = await sb.from("contracts").select("id, contract_number, status, company_id").eq("tenant_id", tenantId).in("id", contractIds.length ? contractIds : ["00000000-0000-0000-0000-000000000000"]);
  const inForce = new Map(((contracts ?? []) as Array<{ id: string; contract_number: string | null; status: string; company_id: string | null }>).filter((c) => ["active", "completed", "expired"].includes(c.status)).map((c) => [c.id, c]));
  const companyIds = [...new Set([...inForce.values()].map((c) => c.company_id).filter(Boolean))] as string[];
  const { data: companies } = await sb.from("companies").select("id, company_name").eq("tenant_id", tenantId).in("id", companyIds.length ? companyIds : ["00000000-0000-0000-0000-000000000000"]);
  const nameOf = new Map(((companies ?? []) as Array<{ id: string; company_name: string }>).map((c) => [c.id, c.company_name]));
  const pushed = await sb.from("task_sync_pushes").select("obligation_id, external_id, payload_hash").eq("tenant_id", tenantId).eq("system", adapter.system);
  if (pushed.error) return fail(pushed.error);
  const last = new Map(((pushed.data ?? []) as Array<{ obligation_id: string; external_id: string; payload_hash: string }>).map((r) => [r.obligation_id, r]));

  let handled = 0;
  for (const o of listed.value) {
    const contract = inForce.get(o.contract_id);
    // only what was sold and signed, and not what was set aside
    if (!contract || o.kind !== "deliverable" || o.status === "waived") { report.skipped++; continue; }
    if (opts.limit && handled >= opts.limit) break;
    handled++;
    const payload = payloadFor(o, { contractNumber: contract.contract_number, companyName: contract.company_id ? nameOf.get(contract.company_id) ?? null : null });
    const hash = payloadHash(payload);
    try {
      const existing = await listExternal(sb, tenantId, "obligation", o.id);
      if (!existing.ok) throw new Error(existing.error);
      let externalId = existing.value.find((r) => r.system === adapter.system)?.external_id ?? last.get(o.id)?.external_id ?? null;
      if (!externalId) {
        const made = await adapter.createTask(payload, `create:${o.id}`);
        externalId = made.externalId;
        const linked = await linkExternal(sb, tenantId, { entityType: "obligation", entityId: o.id, system: adapter.system, externalId, actor });
        if (!linked.ok) throw new Error(linked.error);
        report.created++;
      } else if (last.get(o.id)?.payload_hash === hash) {
        report.unchanged++;
        continue;
      } else {
        await adapter.updateTask(externalId, { title: payload.title, description: payload.description, dueDate: payload.dueDate, ownerEmail: payload.ownerEmail, status: payload.status }, `update:${o.id}:${hash}`);
        report.updated++;
      }
      const rec = await sb.from("task_sync_pushes").upsert({ tenant_id: tenantId, system: adapter.system, obligation_id: o.id, external_id: externalId, payload_hash: hash, pushed_at: new Date().toISOString() }, { onConflict: "tenant_id,system,obligation_id" });
      if (rec.error) throw new Error(rec.error.message);
    } catch (err) {
      report.failed.push({ obligationId: o.id, error: err instanceof Error ? err.message : String(err) });
    }
  }
  return { ok: true, value: report };
}

// ── pull: the tool tells the platform ───────────────────────────────────────

export interface PullReport { received: number; stored: number; duplicates: number; unmapped: number; refused_fields: number; cursor: string | null }

/** What each kind of report means as a request to change a platform field, so the ownership rules can answer it. */
function asPatch(c: ExternalChange): Record<string, unknown> {
  switch (c.kind) {
    case "date_changed": return { due_date: c.detail.dueDate };
    case "renamed": return { title: c.detail.title };
    case "reassigned": return { owner_email: c.detail.ownerEmail };
    case "deleted": return { deleted: true };
    default: return {};
  }
}

/**
 * Reads the tool's changes into the inbox. Nothing here changes an obligation. Each change is stored once (the tool's event
 * id is unique, so a repeated or replayed event adds nothing), tied to the obligation its task is linked to (a task the
 * platform never made is stored as unmapped, and creates nothing), and any attempt to change a field the platform owns is
 * recorded with the reason it is refused. The cursor moves only after everything is stored, so a crash re-reads, never skips.
 */
export async function pullChanges(sb: Sb, adapter: TaskSourceAdapter, tenantId: string): Promise<WriteResult<PullReport>> {
  const cur = await sb.from("task_sync_cursors").select("cursor").eq("tenant_id", tenantId).eq("system", adapter.system).maybeSingle();
  if (cur.error) return fail(cur.error);
  const { changes, cursor } = await adapter.pullChanges((cur.data as { cursor: string | null } | null)?.cursor ?? null);
  const report: PullReport = { received: changes.length, stored: 0, duplicates: 0, unmapped: 0, refused_fields: 0, cursor };

  for (const c of changes) {
    const link = await resolveExternal(sb, tenantId, adapter.system, "obligation", c.externalId);
    if (!link.ok) return link;
    const patch = asPatch(c);
    const verdict = acceptInbound("obligations", adapter.system, patch);
    // every field of an obligation is the platform's: the refusal is the record of that, shown to the person who reads it
    report.refused_fields += verdict.rejected.length;
    const row = {
      tenant_id: tenantId, system: adapter.system, event_id: c.eventId, external_id: c.externalId, obligation_id: link.value && !link.value.deleted ? link.value.entity_id : null,
      kind: c.kind, occurred_at: c.at, reported_by: c.by, detail: c.detail, refused: verdict.rejected,
    };
    const ins = await sb.from("task_sync_inbox").upsert(row, { onConflict: "tenant_id,system,event_id", ignoreDuplicates: true }).select("id");
    if (ins.error) return fail(ins.error);
    if ((ins.data?.length ?? 0) > 0) { report.stored++; if (!row.obligation_id) report.unmapped++; } else report.duplicates++;
  }
  const saved = await sb.from("task_sync_cursors").upsert({ tenant_id: tenantId, system: adapter.system, cursor, updated_at: new Date().toISOString() }, { onConflict: "tenant_id,system" });
  if (saved.error) return fail(saved.error);
  return { ok: true, value: report };
}

// ── the inbox: a person decides ─────────────────────────────────────────────

export interface InboxItem {
  id: string; system: string; event_id: string; external_id: string; obligation_id: string | null; kind: string; occurred_at: string | null; reported_by: string | null;
  detail: Record<string, unknown>; refused: Array<{ field: string; reason: string }>; status: string; received_at: string;
}
const INBOX = "id, system, event_id, external_id, obligation_id, kind, occurred_at, reported_by, detail, refused, status, received_at";

export async function listInbox(sb: Sb, tenantId: string, f: { status?: string | null; limit?: number } = {}): Promise<WriteResult<InboxItem[]>> {
  let q = sb.from("task_sync_inbox").select(INBOX).eq("tenant_id", tenantId).order("received_at", { ascending: false }).limit(Math.min(f.limit ?? 100, 500));
  if (f.status) q = q.eq("status", f.status);
  const { data, error } = await q;
  return error ? fail(error) : { ok: true, value: (data ?? []) as InboxItem[] };
}

async function resolveItem(sb: Sb, tenantId: string, id: string, status: "applied" | "dismissed", by: string, note: string): Promise<WriteResult<{ id: string }>> {
  const { data, error } = await sb.from("task_sync_inbox").update({ status, resolved_by: by, resolved_at: new Date().toISOString(), resolution_note: note }).eq("tenant_id", tenantId).eq("id", id).eq("status", "pending").select("id");
  if (error) return fail(error);
  return (data?.length ?? 0) > 0 ? { ok: true, value: { id } } : { ok: false, status: 409, error: "That item was already dealt with." };
}

export async function dismissInboxItem(sb: Sb, tenantId: string, id: string, by: string, note: string): Promise<WriteResult<{ id: string }>> {
  if (!by) return { ok: false, status: 403, error: "A signed-in person is required." };
  if (note.trim().length < 5) return { ok: false, status: 400, error: "Say why it is being set aside (5+ characters)." };
  return resolveItem(sb, tenantId, id, "dismissed", by, note.trim());
}

/**
 * A person accepts that the work is done. "Reported done in the tool" is not delivery: it becomes a delivered mark by THIS
 * person, through the same rule as any other, so someone else still has to accept it, with proof. Only a completion can be
 * applied this way; a date or name change is made on the platform's own screens, where a reason and the downstream impact are asked for.
 */
export async function applyInboxItem(sb: Sb, tenantId: string, id: string, by: string): Promise<WriteResult<{ id: string; status: string }>> {
  if (!by) return { ok: false, status: 403, error: "A signed-in person is required." };
  const { data, error } = await sb.from("task_sync_inbox").select(INBOX).eq("tenant_id", tenantId).eq("id", id).maybeSingle();
  if (error) return fail(error);
  const item = data as InboxItem | null;
  if (!item) return { ok: false, status: 404, error: "Item not found" };
  if (item.status !== "pending") return { ok: false, status: 409, error: "That item was already dealt with." };
  if (item.kind !== "completed") return { ok: false, status: 400, error: `A "${item.kind.replace("_", " ")}" in the outside tool is not applied automatically. Make the change on the platform if it is right (dates and names ask for a reason and show what depends on them), then dismiss this.` };
  if (!item.obligation_id) return { ok: false, status: 409, error: "This task is not linked to an obligation, so there is nothing to mark." };
  const note = `Reported done in ${item.system}${item.reported_by ? ` by ${item.reported_by}` : ""}; confirmed by ${by}.`;
  const rec = await recordEvent(sb, tenantId, item.obligation_id, { action: "deliver", note }, by);
  if (!rec.ok) return rec;
  const done = await resolveItem(sb, tenantId, id, "applied", by, note);
  return done.ok ? { ok: true, value: { id, status: rec.value.status } } : done;
}
