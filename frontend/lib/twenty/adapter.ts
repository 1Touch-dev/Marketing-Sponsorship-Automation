import { findLink, linkExternal, listExternal, unlinkExternal } from "../sync/external-refs";
import { isTombstoned } from "../records/tombstones";
import { openAction, logEvent, type EventOperation, type Operation } from "../integrations/log";
import { recordPushFailure, recordPushOk } from "../integrations/health";
import type { PushContext as PipedrivePushContext, PushResult } from "../pipedrive/adapter";
import { idOf, twRequest, type TwOptions, type TwResponse } from "./client";

type Sb = any;

/**
 * Coxa → Twenty, one record at a time, by stored ID. Same shape as the Pipedrive adapter; a different system name, so the
 * two CRMs never share an outside ID. Nothing is deleted in Twenty when a Coxa record is removed: the link is marked
 * removed, with a reason.
 */
export const SYSTEM = "twenty";

export type PushContext = PipedrivePushContext & { twentyHttp?: TwOptions };
export type { PushResult };

interface Session { ctx: PushContext; actionId: string | null; calls: number; failure: { error: string; status: number | null } | null }

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

const http = (ctx: PushContext): TwOptions | undefined => ctx.twentyHttp;

async function record(s: Session, e: { entityType: string; entityId: string; externalType: string; externalId?: string | null; operation: EventOperation; r?: TwResponse; skipped?: string; error?: string; detail?: Record<string, unknown>; health?: boolean }) {
  const failed = !!e.error || (e.r ? !e.r.ok : false);
  await logEvent(s.ctx.sb, s.ctx.tenantId, SYSTEM, s.actionId, {
    entityType: e.entityType, entityId: e.entityId, externalType: e.externalType, externalId: e.externalId ?? null, operation: e.operation,
    outcome: e.skipped ? "skipped" : failed ? "failed" : "succeeded", httpStatus: e.r?.status || null, error: e.error ?? e.r?.error ?? e.skipped ?? null, detail: e.detail, durationMs: e.r?.ms ?? null,
  });
  if (e.health === false || e.skipped) return;
  if (failed) { if (!s.failure) s.failure = { error: `${e.operation === "create" ? "Creating" : "Updating"} the ${e.externalType} failed: ${e.error ?? e.r?.error ?? "unknown error"}`, status: e.r?.status ?? null }; }
  else s.calls++;
}

async function finish(s: Session): Promise<void> {
  if (s.failure) await recordPushFailure(s.ctx.sb, s.ctx.tenantId, SYSTEM, s.failure.error, s.failure.status);
  else if (s.calls > 0) await recordPushOk(s.ctx.sb, s.ctx.tenantId, SYSTEM);
}

interface Spec {
  entityType: "companies" | "contacts" | "proposals";
  entityId: string;
  externalType: "company" | "person" | "opportunity";
  collection: "/rest/companies" | "/rest/people" | "/rest/opportunities";
  create: Record<string, unknown>;
  update: Record<string, unknown>;
}

async function upsert(s: Session, spec: Spec): Promise<PushResult> {
  const { sb, tenantId, auth } = s.ctx;
  const where = { entityType: spec.entityType, entityId: spec.entityId, externalType: spec.externalType };
  if (await isTombstoned(sb, tenantId, spec.entityType, spec.entityId)) {
    await record(s, { ...where, operation: "update", skipped: "This record was deleted, so it is not sent." });
    return { ok: false, skipped: "deleted" };
  }
  return withLock(`${tenantId}:twenty:${spec.entityType}:${spec.entityId}`, async () => {
    const link = await findLink(sb, tenantId, SYSTEM, spec.entityType, spec.entityId);
    if (!link.ok && link.status !== 503) {
      await record(s, { ...where, operation: "update", error: `Could not read the link: ${link.error}`, health: false });
      return { ok: false, error: link.error };
    }
    const existing = link.ok ? link.value : null;

    if (existing) {
      const r = await twRequest("PATCH", `${spec.collection}/${existing.external_id}`, spec.update, http(s.ctx));
      const gone = r.status === 404 ? "Twenty no longer has this object (was it deleted there?). Unlink it, with a reason, to send it as a new one." : undefined;
      await record(s, { ...where, externalId: existing.external_id, operation: "update", r, error: gone });
      return r.ok ? { ok: true, external_id: existing.external_id, created: false } : { ok: false, external_id: existing.external_id, error: gone ?? r.error };
    }

    const r = await twRequest("POST", spec.collection, spec.create, http(s.ctx));
    const newId = r.ok ? idOf(r.data) : null;
    if (!r.ok || !newId) {
      await record(s, { ...where, operation: "create", r, error: r.ok ? "Twenty did not return an ID for the new object." : undefined });
      return { ok: false, error: r.error ?? "Twenty did not return an ID for the new object." };
    }
    const linked = await linkExternal(sb, tenantId, { entityType: spec.entityType, entityId: spec.entityId, system: SYSTEM, externalId: newId, actor: auth.by, externalType: spec.externalType });
    if (!linked.ok && linked.status !== 503) {
      await record(s, { ...where, externalId: newId, operation: "create", r, error: `Created in Twenty (ID ${newId}) but the link could not be saved: ${linked.error}`, detail: { needs_attention: true } });
      return { ok: false, external_id: newId, created: true, error: linked.error };
    }
    await record(s, { ...where, externalId: newId, operation: "create", r });
    return { ok: true, external_id: newId, created: true };
  });
}

function splitName(full: string): { firstName: string; lastName: string } {
  const t = full.trim() || "Unknown";
  const i = t.indexOf(" ");
  if (i <= 0) return { firstName: t, lastName: "" };
  return { firstName: t.slice(0, i), lastName: t.slice(i + 1) };
}

function opportunityStage(s?: string | null): string {
  const v = (s ?? "").toLowerCase();
  if (v === "rejected") return "SCREENING";
  if (v === "approved" || v === "sent" || v === "viewed") return "PROPOSAL";
  if (v === "won" || v === "active_contract") return "CUSTOMER";
  return "NEW";
}

function asWebsite(website: unknown): string | null {
  if (typeof website !== "string") return null;
  const t = website.trim();
  if (!t) return null;
  return /^https?:\/\//i.test(t) ? t : `https://${t}`;
}

async function companyIn(s: Session, companyId: string): Promise<PushResult> {
  const { data: c } = await s.ctx.sb.from("companies").select("*").eq("id", companyId).eq("tenant_id", s.ctx.tenantId).maybeSingle();
  if (!c) { await record(s, { entityType: "companies", entityId: companyId, externalType: "company", operation: "update", skipped: "Company not found." }); return { ok: false, skipped: "not_found" }; }
  const row = c as { company_name: string; website?: string | null };
  const site = asWebsite(row.website);
  const body: Record<string, unknown> = { name: row.company_name, ...(site ? { domainName: { primaryLinkUrl: site } } : {}) };
  return upsert(s, { entityType: "companies", entityId: companyId, externalType: "company", collection: "/rest/companies", create: body, update: body });
}

async function personIn(s: Session, contactId: string, companyTwId: string | null): Promise<PushResult> {
  const { data: c } = await s.ctx.sb.from("contacts").select("*").eq("id", contactId).eq("tenant_id", s.ctx.tenantId).maybeSingle();
  if (!c) { await record(s, { entityType: "contacts", entityId: contactId, externalType: "person", operation: "update", skipped: "Contact not found." }); return { ok: false, skipped: "not_found" }; }
  const row = c as { full_name: string; email?: string | null };
  const body: Record<string, unknown> = {
    name: splitName(row.full_name ?? ""),
    ...(row.email ? { emails: { primaryEmail: row.email, additionalEmails: [] } } : {}),
    ...(companyTwId ? { companyId: companyTwId } : {}),
  };
  return upsert(s, { entityType: "contacts", entityId: contactId, externalType: "person", collection: "/rest/people", create: body, update: body });
}

export async function pushOrganization(ctx: PushContext, companyId: string): Promise<PushResult> {
  const s = await begin(ctx, "push", "companies", companyId);
  const r = await companyIn(s, companyId);
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

export interface DealOptions {
  status?: string | null;
  title?: string;
  value?: number;
  proposalUrl?: string;
}

/**
 * Pushes a proposal as a Twenty opportunity, with its company (and first contact) each by stored Twenty ID.
 * If the company or person cannot be sent, the opportunity still goes; the next push adds them.
 */
export async function pushDeal(ctx: PushContext, proposalId: string, opts: DealOptions = {}): Promise<PushResult> {
  const s = await begin(ctx, "push", "proposals", proposalId);
  const { sb, tenantId } = ctx;
  const { data: p } = await sb.from("proposals").select("id, title, company_id").eq("id", proposalId).eq("tenant_id", tenantId).maybeSingle();
  if (!p) { await record(s, { entityType: "proposals", entityId: proposalId, externalType: "opportunity", operation: "update", skipped: "Proposal not found." }); return { ok: false, skipped: "not_found" }; }
  const proposal = p as { title: string; company_id?: string | null };

  let companyTwId: string | null = null;
  let companyName = "";
  let parentError: string | null = null;
  if (proposal.company_id) {
    const org = await companyIn(s, proposal.company_id);
    companyTwId = org.external_id ?? null;
    if (!org.ok && !org.skipped) parentError = `the company could not be sent: ${org.error}`;
    const { data: co } = await sb.from("companies").select("company_name").eq("id", proposal.company_id).eq("tenant_id", tenantId).maybeSingle();
    companyName = (co as { company_name?: string } | null)?.company_name ?? "";
    const { data: contacts } = await sb.from("contacts").select("id").eq("company_id", proposal.company_id).eq("tenant_id", tenantId).not("email", "is", null).order("created_at", { ascending: true }).limit(1);
    const first = (contacts as Array<{ id: string }> | null)?.[0];
    if (first) {
      const pr = await personIn(s, first.id, companyTwId);
      if (!pr.ok && !pr.skipped && !parentError) parentError = `the contact could not be sent: ${pr.error}`;
    }
  }

  const stage = opportunityStage(opts.status);
  const name = opts.title ?? (companyName ? `${companyName} — ${proposal.title}` : proposal.title);
  const refs = { ...(companyTwId ? { companyId: companyTwId } : {}) };
  const result = await upsert(s, {
    entityType: "proposals", entityId: proposalId, externalType: "opportunity", collection: "/rest/opportunities",
    create: { name, stage, ...refs },
    update: { ...(opts.status != null ? { stage } : {}), ...(opts.title ? { name: opts.title } : {}), ...refs },
  });
  await finish(s);
  if (result.ok && parentError) return { ...result, ok: false, error: `The opportunity was sent (Twenty ID ${result.external_id}), but ${parentError}` };
  return result;
}

export async function removeLinks(ctx: PushContext, entityType: "companies" | "contacts" | "proposals", entityId: string, reason: string): Promise<{ removed: number }> {
  const s = await begin(ctx, "remove_link", entityType, entityId);
  const links = await listExternal(ctx.sb, ctx.tenantId, entityType, entityId, false);
  if (!links.ok) return { removed: 0 };
  let removed = 0;
  for (const l of links.value.filter((x) => x.system === SYSTEM)) {
    const u = await unlinkExternal(ctx.sb, ctx.tenantId, l.id, reason, ctx.auth.by);
    if (u.ok) {
      removed++;
      await logEvent(ctx.sb, ctx.tenantId, SYSTEM, s.actionId, { entityType, entityId, externalId: l.external_id, operation: "link_removed", outcome: "succeeded", detail: { reason, left_in_twenty: true } });
    }
  }
  return { removed };
}

export const CRM_LOG_LABEL = "Logged in CRM by Coxa — a record of the activity, not proof that anything was delivered.";

export async function logCrmActivity(ctx: PushContext, proposalId: string, a: { subject: string; note: string; type?: "note" | "email" | "call" | "task" }): Promise<PushResult> {
  const s = await begin(ctx, "log_activity", "proposals", proposalId);
  const link = await findLink(ctx.sb, ctx.tenantId, SYSTEM, "proposals", proposalId);
  const opportunityId = link.ok ? link.value?.external_id : null;
  if (!opportunityId) { await record(s, { entityType: "proposals", entityId: proposalId, externalType: "note", operation: "log_activity", skipped: "This proposal has no opportunity in Twenty yet, so there is nothing to attach the activity to." }); return { ok: false, skipped: "no_deal" }; }
  const r = await twRequest("POST", "/rest/notes", { title: a.subject, bodyV2: { markdown: `${CRM_LOG_LABEL}\n\n${a.note}` }, opportunityId }, http(ctx));
  await record(s, { entityType: "proposals", entityId: proposalId, externalType: "note", externalId: idOf(r.data), operation: "log_activity", r });
  await finish(s);
  return r.ok ? { ok: true, external_id: idOf(r.data) ?? undefined, created: true } : { ok: false, error: r.error };
}
