import { findLink, linkExternal, listExternal, unlinkExternal } from "../sync/external-refs";
import { isTombstoned } from "../records/tombstones";
import { openAction, logEvent, type Authorization, type EventOperation, type Operation } from "../integrations/log";
import { recordPushFailure, recordPushOk } from "../integrations/health";
import { pdRequest, type PdOptions, type PdResponse } from "./client";

type Sb = any;

/**
 * Coxa → Pipedrive, one record at a time, by stored ID.
 *
 *   • Every record that has been pushed has a LINK (`external_refs`): the Coxa record, `pipedrive`, the kind of Pipedrive
 *     object, and its ID. The next push uses that ID.
 *   • With no link, the object is created and the ID Pipedrive returns is saved. Pipedrive is never searched by title or
 *     name: two proposals with similar titles can no longer land on the same deal.
 *   • Deleting a record here marks its link removed and records why. Nothing is deleted in Pipedrive.
 *   • A Pipedrive activity is "logged in CRM". It is not a delivered email; that state belongs to the delivery state machine.
 *   • Every push has someone answerable for it (`integration_actions`), every call is recorded (`integration_events`), and
 *     the outcome updates the one health record (`integration_health`).
 *
 * This talks only to Pipedrive. A second CRM would be another adapter with the same shape.
 */
export const SYSTEM = "pipedrive";

export interface PushContext { sb: Sb; tenantId: string; auth: Authorization; http?: PdOptions }
export interface PushResult { ok: boolean; external_id?: string; created?: boolean; skipped?: string; error?: string }

/** What this push is, shared by the calls it makes (an organization, then a person, then the deal). */
interface Session { ctx: PushContext; actionId: string | null; calls: number; failure: { error: string; status: number | null } | null }

// One push per record at a time, so two requests at once cannot both find "no link" and both create a deal.
const locks = new Map<string, Promise<unknown>>();
async function withLock<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const prev = locks.get(key) ?? Promise.resolve();
  const run = prev.catch(() => undefined).then(fn);
  locks.set(key, run);
  try { return await run; } finally { if (locks.get(key) === run) locks.delete(key); }
}

async function begin(ctx: PushContext, operation: Operation, entityType: string, entityId: string): Promise<Session> {
  return { ctx, actionId: await openAction(ctx.sb, ctx.tenantId, SYSTEM, { operation, entityType, entityId, auth: ctx.auth }), calls: 0, failure: null };
}

const idOf = (r: PdResponse): string | null => {
  const id = r.data?.id;
  return typeof id === "number" || typeof id === "string" ? String(id) : null;
};

/** Writes the event for one call. Whether the CONNECTION is healthy is decided once, when the whole push is finished (finish). */
async function record(s: Session, e: { entityType: string; entityId: string; externalType: string; externalId?: string | null; operation: EventOperation; r?: PdResponse; skipped?: string; error?: string; detail?: Record<string, unknown>; health?: boolean }) {
  const failed = !!e.error || (e.r ? !e.r.ok : false);
  await logEvent(s.ctx.sb, s.ctx.tenantId, SYSTEM, s.actionId, {
    entityType: e.entityType, entityId: e.entityId, externalType: e.externalType, externalId: e.externalId ?? null, operation: e.operation,
    outcome: e.skipped ? "skipped" : failed ? "failed" : "succeeded", httpStatus: e.r?.status || null, error: e.error ?? e.r?.error ?? e.skipped ?? null, detail: e.detail, durationMs: e.r?.ms ?? null,
  });
  if (e.health === false || e.skipped) return;
  if (failed) { if (!s.failure) s.failure = { error: `${e.operation === "create" ? "Creating" : "Updating"} the ${e.externalType} failed: ${e.error ?? e.r?.error ?? "unknown error"}`, status: e.r?.status ?? null }; }
  else s.calls++;
}

/**
 * The push is over: ONE answer goes into the health record. If any call in it failed, the push failed (even if a later call
 * worked), so a half-sent push never shows as healthy. A push that sent nothing (all skipped) says nothing about the connection.
 */
async function finish(s: Session): Promise<void> {
  if (s.failure) await recordPushFailure(s.ctx.sb, s.ctx.tenantId, SYSTEM, s.failure.error, s.failure.status);
  else if (s.calls > 0) await recordPushOk(s.ctx.sb, s.ctx.tenantId, SYSTEM);
}

interface Spec {
  entityType: "companies" | "contacts" | "proposals";
  entityId: string;
  externalType: "organization" | "person" | "deal";
  collection: "/organizations" | "/persons" | "/deals";
  /** sent when the object is created */
  create: Record<string, unknown>;
  /** sent when it already exists; only what should change */
  update: Record<string, unknown>;
  /** called with the ID after a create, for follow-ups such as a note */
  afterCreate?: (externalId: string) => Promise<void>;
}

/** Update by stored ID, or create and store the ID. The one rule every kind of object follows. */
async function upsert(s: Session, spec: Spec): Promise<PushResult> {
  const { sb, tenantId, auth, http } = s.ctx;
  const where = { entityType: spec.entityType, entityId: spec.entityId, externalType: spec.externalType };
  if (await isTombstoned(sb, tenantId, spec.entityType, spec.entityId)) {
    await record(s, { ...where, operation: "update", skipped: "This record was deleted, so it is not sent." });
    return { ok: false, skipped: "deleted" };
  }
  return withLock(`${tenantId}:${spec.entityType}:${spec.entityId}`, async () => {
    const link = await findLink(sb, tenantId, SYSTEM, spec.entityType, spec.entityId);
    if (!link.ok && link.status !== 503) {
      await record(s, { ...where, operation: "update", error: `Could not read the link: ${link.error}`, health: false });
      return { ok: false, error: link.error };
    }
    const existing = link.ok ? link.value : null;

    if (existing) {
      const r = await pdRequest("PUT", `${spec.collection}/${existing.external_id}`, spec.update, http);
      const gone = r.status === 404 ? "Pipedrive no longer has this object (was it deleted there?). Unlink it, with a reason, to send it as a new one." : undefined;
      await record(s, { ...where, externalId: existing.external_id, operation: "update", r, error: gone });
      return r.ok ? { ok: true, external_id: existing.external_id, created: false } : { ok: false, external_id: existing.external_id, error: gone ?? r.error };
    }

    const r = await pdRequest("POST", spec.collection, spec.create, http);
    const newId = r.ok ? idOf(r) : null;
    if (!r.ok || !newId) {
      await record(s, { ...where, operation: "create", r, error: r.ok ? "Pipedrive did not return an ID for the new object." : undefined });
      return { ok: false, error: r.error ?? "Pipedrive did not return an ID for the new object." };
    }
    const linked = await linkExternal(sb, tenantId, { entityType: spec.entityType, entityId: spec.entityId, system: SYSTEM, externalId: newId, actor: auth.by, externalType: spec.externalType });
    if (!linked.ok && linked.status !== 503) {
      // the object exists in Pipedrive but could not be linked here: say so loudly, so it is found and linked or removed by a person
      await record(s, { ...where, externalId: newId, operation: "create", r, error: `Created in Pipedrive (ID ${newId}) but the link could not be saved: ${linked.error}`, detail: { needs_attention: true } });
      return { ok: false, external_id: newId, created: true, error: linked.error };
    }
    await record(s, { ...where, externalId: newId, operation: "create", r });
    if (spec.afterCreate) { try { await spec.afterCreate(newId); } catch { /* a follow-up never fails the push */ } }
    return { ok: true, external_id: newId, created: true };
  });
}

// ── organizations, people, deals ────────────────────────────────────────────

async function organizationIn(s: Session, companyId: string): Promise<PushResult> {
  const { data: c } = await s.ctx.sb.from("companies").select("id, company_name").eq("id", companyId).eq("tenant_id", s.ctx.tenantId).maybeSingle();
  if (!c) { await record(s, { entityType: "companies", entityId: companyId, externalType: "organization", operation: "update", skipped: "Company not found." }); return { ok: false, skipped: "not_found" }; }
  const row = c as { company_name: string };
  return upsert(s, { entityType: "companies", entityId: companyId, externalType: "organization", collection: "/organizations", create: { name: row.company_name }, update: { name: row.company_name } });
}

async function personIn(s: Session, contactId: string, orgPdId: string | null): Promise<PushResult> {
  const { data: c } = await s.ctx.sb.from("contacts").select("id, full_name, email, phone").eq("id", contactId).eq("tenant_id", s.ctx.tenantId).maybeSingle();
  if (!c) { await record(s, { entityType: "contacts", entityId: contactId, externalType: "person", operation: "update", skipped: "Contact not found." }); return { ok: false, skipped: "not_found" }; }
  const row = c as { full_name: string; email?: string | null; phone?: string | null };
  const body: Record<string, unknown> = { name: row.full_name, ...(row.email ? { email: [{ value: row.email, primary: true }] } : {}), ...(row.phone ? { phone: [{ value: row.phone, primary: true }] } : {}), ...(orgPdId ? { org_id: Number(orgPdId) } : {}) };
  return upsert(s, { entityType: "contacts", entityId: contactId, externalType: "person", collection: "/persons", create: body, update: body });
}

export async function pushOrganization(ctx: PushContext, companyId: string): Promise<PushResult> {
  const s = await begin(ctx, "push", "companies", companyId);
  const r = await organizationIn(s, companyId);
  await finish(s);
  return r;
}

export async function pushPerson(ctx: PushContext, contactId: string): Promise<PushResult> {
  const s = await begin(ctx, "push", "contacts", contactId);
  const { data: c } = await ctx.sb.from("contacts").select("company_id").eq("id", contactId).eq("tenant_id", ctx.tenantId).maybeSingle();
  const org = (c as { company_id?: string | null } | null)?.company_id ? await findLink(ctx.sb, ctx.tenantId, SYSTEM, "companies", (c as { company_id: string }).company_id) : null;
  const r = await personIn(s, contactId, org?.ok ? (org.value?.external_id ?? null) : null);
  await finish(s);
  return r;
}

const dealStatus = (s?: string | null): "open" | "won" | "lost" | undefined => (!s ? undefined : s === "won" ? "won" : s === "rejected" ? "lost" : "open");

export interface DealOptions {
  /** the proposal's status in Coxa; sent to Pipedrive only when given */
  status?: string | null;
  /** the title for a NEW deal; an existing deal keeps its title */
  title?: string;
  value?: number;
  proposalUrl?: string;
}

/**
 * Pushes a proposal as a deal, with its company as an organization and its first contact as a person, each by stored ID.
 * If the organization or person cannot be sent, the deal still goes; the next push adds them.
 */
export async function pushDeal(ctx: PushContext, proposalId: string, opts: DealOptions = {}): Promise<PushResult> {
  const s = await begin(ctx, "push", "proposals", proposalId);
  const { sb, tenantId } = ctx;
  const { data: p } = await sb.from("proposals").select("id, title, company_id").eq("id", proposalId).eq("tenant_id", tenantId).maybeSingle();
  if (!p) { await record(s, { entityType: "proposals", entityId: proposalId, externalType: "deal", operation: "update", skipped: "Proposal not found." }); return { ok: false, skipped: "not_found" }; }
  const proposal = p as { title: string; company_id?: string | null };

  let orgId: string | null = null;
  let personId: string | null = null;
  let companyName = "";
  let parentError: string | null = null;
  if (proposal.company_id) {
    const org = await organizationIn(s, proposal.company_id);
    orgId = org.external_id ?? null;
    if (!org.ok && !org.skipped) parentError = `the organization could not be sent: ${org.error}`;
    const { data: co } = await sb.from("companies").select("company_name").eq("id", proposal.company_id).eq("tenant_id", tenantId).maybeSingle();
    companyName = (co as { company_name?: string } | null)?.company_name ?? "";
    const { data: contacts } = await sb.from("contacts").select("id").eq("company_id", proposal.company_id).eq("tenant_id", tenantId).not("email", "is", null).order("created_at", { ascending: true }).limit(1);
    const first = (contacts as Array<{ id: string }> | null)?.[0];
    if (first) {
      const pr = await personIn(s, first.id, orgId);
      personId = pr.external_id ?? null;
      if (!pr.ok && !pr.skipped && !parentError) parentError = `the contact could not be sent: ${pr.error}`;
    }
  }

  const status = dealStatus(opts.status);
  const refs = { ...(orgId ? { org_id: Number(orgId) } : {}), ...(personId ? { person_id: Number(personId) } : {}) };
  const result = await upsert(s, {
    entityType: "proposals", entityId: proposalId, externalType: "deal", collection: "/deals",
    create: { title: opts.title ?? (companyName ? `${companyName} — ${proposal.title}` : proposal.title), value: opts.value ?? 0, status: status ?? "open", ...refs },
    update: { ...(status ? { status } : {}), ...(opts.title ? { title: opts.title } : {}), ...(opts.value !== undefined ? { value: opts.value } : {}), ...refs },
    afterCreate: opts.proposalUrl ? async (dealId) => {
      const r = await pdRequest("POST", "/notes", { content: `Proposal sent: ${opts.proposalUrl} (Coxa proposal ${proposalId})`, deal_id: Number(dealId) }, ctx.http);
      await record(s, { entityType: "proposals", entityId: proposalId, externalType: "note", externalId: dealId, operation: "log_activity", r, health: false });
    } : undefined,
  });
  await finish(s);
  // the deal went, but part of what belongs with it did not: that is a failed push, and it says so, so a retry completes it
  if (result.ok && parentError) return { ...result, ok: false, error: `The deal was sent (Pipedrive ID ${result.external_id}), but ${parentError}` };
  return result;
}

/**
 * A record was deleted here: its links are marked removed, with the reason, and an event says so. Nothing is deleted in
 * Pipedrive: the deal stays there, with no link to anything here, for a person to deal with.
 */
export async function removeLinks(ctx: PushContext, entityType: "companies" | "contacts" | "proposals", entityId: string, reason: string): Promise<{ removed: number }> {
  const s = await begin(ctx, "remove_link", entityType, entityId);
  const links = await listExternal(ctx.sb, ctx.tenantId, entityType, entityId, false);
  if (!links.ok) return { removed: 0 };
  let removed = 0;
  for (const l of links.value.filter((x) => x.system === SYSTEM)) {
    const u = await unlinkExternal(ctx.sb, ctx.tenantId, l.id, reason, ctx.auth.by);
    if (u.ok) {
      removed++;
      await logEvent(ctx.sb, ctx.tenantId, SYSTEM, s.actionId, { entityType, entityId, externalId: l.external_id, operation: "link_removed", outcome: "succeeded", detail: { reason, left_in_pipedrive: true } });
    }
  }
  return { removed };
}

/**
 * Logs something that happened as an activity on the proposal's deal, found by its stored link. With no link there is
 * nothing to attach it to, and it is skipped (never matched by title). The activity is labelled as a CRM record.
 */
export const CRM_LOG_LABEL = "Logged in CRM by Coxa — a record of the activity, not proof that anything was delivered.";

export async function logCrmActivity(ctx: PushContext, proposalId: string, a: { subject: string; note: string; type?: "note" | "email" | "call" | "task" }): Promise<PushResult> {
  const s = await begin(ctx, "log_activity", "proposals", proposalId);
  const link = await findLink(ctx.sb, ctx.tenantId, SYSTEM, "proposals", proposalId);
  const dealId = link.ok ? link.value?.external_id : null;
  if (!dealId) { await record(s, { entityType: "proposals", entityId: proposalId, externalType: "activity", operation: "log_activity", skipped: "This proposal has no deal in Pipedrive yet, so there is nothing to attach the activity to." }); return { ok: false, skipped: "no_deal" }; }
  const r = await pdRequest("POST", "/activities", { subject: a.subject, type: a.type ?? "note", note: `${CRM_LOG_LABEL}\n\n${a.note}`, deal_id: Number(dealId), done: 1 }, ctx.http);
  await record(s, { entityType: "proposals", entityId: proposalId, externalType: "activity", externalId: idOf(r), operation: "log_activity", r });
  await finish(s);
  return r.ok ? { ok: true, external_id: idOf(r) ?? undefined, created: true } : { ok: false, error: r.error };
}
