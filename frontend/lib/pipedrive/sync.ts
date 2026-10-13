import { findLink } from "../sync/external-refs";
import { openAction, logEvent } from "../integrations/log";
import { isPipedriveConfigured } from "./client";
import { SYSTEM, pushDeal, pushOrganization, pushPerson, removeLinks, type PushContext, type PushResult } from "./adapter";

export { isPipedriveConfigured };

/**
 * The entry point the rest of the app uses to say "this record changed, tell Pipedrive". It no longer decides anything
 * itself: every push goes through the adapter (lib/pipedrive/adapter.ts), by stored ID, with someone answerable for it, and
 * the answer it gives is the truth: `synced` only when Pipedrive accepted the call. (Before, a rejected call still came
 * back as "synced", which is how a failed sync and a green banner could be on screen together.)
 */
export interface CrmSyncOpts {
  entity_type: string;
  entity_id: string;
  operation: "create" | "update" | "delete" | "status_change";
  payload?: Record<string, unknown>;
}

export interface CrmSyncResult {
  sync_status: "synced" | "failed" | "skipped" | "queued";
  result: Record<string, unknown>;
}

const TYPES = { proposal: "proposals", company: "companies", contact: "contacts" } as const;

const asNumber = (v: string | undefined) => (v && /^\d+$/.test(v) ? Number(v) : undefined);

/**
 * Pushes one record, or removes its link. Throws when Pipedrive refused or could not be reached (so a retry loop can mark the
 * job failed) and returns what happened otherwise.
 */
export async function dispatchToPipedrive(entityType: string, entityId: string, operation: CrmSyncOpts["operation"], payload: Record<string, unknown>, ctx: PushContext): Promise<Record<string, unknown>> {
  const table = (TYPES as Record<string, "proposals" | "companies" | "contacts" | undefined>)[entityType];
  if (!table) return { skipped: `Nothing is sent to Pipedrive for a "${entityType}".` };

  if (operation === "delete") {
    // the record was deleted here: its link is marked removed, with the reason; nothing is deleted in Pipedrive
    const reason = typeof payload.reason === "string" && payload.reason.trim().length >= 5 ? payload.reason.trim() : "The record was deleted in Coxa.";
    const out = await removeLinks(ctx, table, entityId, reason);
    return { link_removed: out.removed, left_in_pipedrive: true };
  }

  let r: PushResult;
  if (table === "proposals") r = await pushDeal(ctx, entityId, { status: (payload.new_status as string | undefined) ?? undefined });
  else if (table === "companies") r = await pushOrganization(ctx, entityId);
  else r = await pushPerson(ctx, entityId);

  if (r.skipped === "not_found") throw new Error(table === "proposals" ? "Proposal not found" : "Record not found");
  if (r.skipped) return { skipped: r.skipped };
  if (!r.ok) throw new Error(r.error ?? "Pipedrive did not accept the push");
  const id = asNumber(r.external_id);
  return { ...(table === "proposals" ? { pipedrive_deal_id: id } : table === "companies" ? { pipedrive_org_id: id } : { pipedrive_person_id: id }), created: !!r.created };
}

export async function enqueueCrmSync(opts: CrmSyncOpts, ctx: PushContext): Promise<CrmSyncResult> {
  if (!isPipedriveConfigured()) {
    // say so in the log instead of dropping it: someone can see that a change was NOT sent, and why
    const table = (TYPES as Record<string, string | undefined>)[opts.entity_type] ?? opts.entity_type;
    const actionId = await openAction(ctx.sb, ctx.tenantId, SYSTEM, { operation: opts.operation === "delete" ? "remove_link" : "push", entityType: table, entityId: opts.entity_id, auth: ctx.auth });
    await logEvent(ctx.sb, ctx.tenantId, SYSTEM, actionId, { entityType: table, entityId: opts.entity_id, operation: opts.operation === "delete" ? "link_removed" : "update", outcome: "skipped", error: "No Pipedrive API key is set on this server, so this was not sent." });
    return { sync_status: "skipped", result: { reason: "not_configured" } };
  }
  try {
    const result = await dispatchToPipedrive(opts.entity_type, opts.entity_id, opts.operation, opts.payload ?? {}, ctx);
    return { sync_status: "skipped" in result ? "skipped" : "synced", result };
  } catch (e) {
    return { sync_status: "failed", result: { error: e instanceof Error ? e.message : String(e) } };
  }
}

/**
 * The Pipedrive IDs of a proposal's deal and its company's organization, from their stored links. Where no link exists yet it
 * falls back to the IDs that used to be kept in a column or in JSON, so nothing is lost before the links are in place.
 */
export async function resolveProposalPipedriveIds(
  sb: { from: (t: string) => unknown },
  proposalId: string,
): Promise<{ dealId: number | null; orgId: number | null; pipelineId: number | null }> {
  const none = { dealId: null, orgId: null, pipelineId: null };
  try {
    const db = sb as { from: (t: string) => any };
    const { data } = await db.from("proposals").select("*").eq("id", proposalId).maybeSingle();
    if (!data) return none;
    const row = data as Record<string, unknown> & { tenant_id: string; company_id?: string | null };
    const content = (row.content as Record<string, unknown> | null) ?? {};

    const deal = await findLink(db, row.tenant_id, SYSTEM, "proposals", proposalId);
    const org = row.company_id ? await findLink(db, row.tenant_id, SYSTEM, "companies", row.company_id) : null;

    let legacyOrg: number | null = null;
    if (row.company_id) {
      const { data: c } = await db.from("companies").select("*").eq("id", row.company_id).maybeSingle();
      const intel = ((c as Record<string, unknown> | null)?.full_intelligence as Record<string, unknown> | null) ?? {};
      legacyOrg = Number((c as Record<string, unknown> | null)?.pipedrive_org_id ?? intel.pipedrive_org_id) || null;
    }
    return {
      dealId: asNumber(deal.ok ? deal.value?.external_id : undefined) ?? (Number(row.pipedrive_deal_id ?? content.pipedrive_deal_id) || null),
      orgId: asNumber(org?.ok ? org.value?.external_id : undefined) ?? legacyOrg,
      pipelineId: Number(row.pipedrive_pipeline_id ?? content.pipedrive_pipeline_id) || null,
    };
  } catch {
    return none;
  }
}
