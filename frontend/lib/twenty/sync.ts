import { isTwentyConfigured } from "./client";
import { SYSTEM, pushDeal, pushOrganization, pushPerson, removeLinks, type PushContext, type PushResult } from "./adapter";
import { openAction, logEvent } from "../integrations/log";
import type { CrmSyncOpts, CrmSyncResult } from "../crm/types";

export { isTwentyConfigured };
export { SYSTEM };

const TYPES = { proposal: "proposals", company: "companies", contact: "contacts" } as const;

export async function dispatchToTwenty(entityType: string, entityId: string, operation: CrmSyncOpts["operation"], payload: Record<string, unknown>, ctx: PushContext): Promise<Record<string, unknown>> {
  const table = (TYPES as Record<string, "proposals" | "companies" | "contacts" | undefined>)[entityType];
  if (!table) return { skipped: `Nothing is sent to Twenty for a "${entityType}".` };

  if (operation === "delete") {
    const reason = typeof payload.reason === "string" && payload.reason.trim().length >= 5 ? payload.reason.trim() : "The record was deleted in Coxa.";
    const out = await removeLinks(ctx, table, entityId, reason);
    return { link_removed: out.removed, left_in_twenty: true };
  }

  let r: PushResult;
  if (table === "proposals") r = await pushDeal(ctx, entityId, { status: (payload.new_status as string | undefined) ?? undefined });
  else if (table === "companies") r = await pushOrganization(ctx, entityId);
  else r = await pushPerson(ctx, entityId);

  if (r.skipped === "not_found") throw new Error(table === "proposals" ? "Proposal not found" : "Record not found");
  if (r.skipped) return { skipped: r.skipped };
  if (!r.ok) throw new Error(r.error ?? "Twenty did not accept the push");
  return {
    ...(table === "proposals" ? { twenty_opportunity_id: r.external_id } : table === "companies" ? { twenty_company_id: r.external_id } : { twenty_person_id: r.external_id }),
    created: !!r.created,
  };
}

export async function enqueueTwentySync(opts: CrmSyncOpts, ctx: PushContext): Promise<CrmSyncResult> {
  if (!isTwentyConfigured()) {
    const table = (TYPES as Record<string, string | undefined>)[opts.entity_type] ?? opts.entity_type;
    const actionId = await openAction(ctx.sb, ctx.tenantId, SYSTEM, { operation: opts.operation === "delete" ? "remove_link" : "push", entityType: table, entityId: opts.entity_id, auth: ctx.auth });
    await logEvent(ctx.sb, ctx.tenantId, SYSTEM, actionId, { entityType: table, entityId: opts.entity_id, operation: opts.operation === "delete" ? "link_removed" : "update", outcome: "skipped", error: "No Twenty API key is set on this server, so this was not sent." });
    return { sync_status: "skipped", result: { reason: "not_configured" } };
  }
  try {
    const result = await dispatchToTwenty(opts.entity_type, opts.entity_id, opts.operation, opts.payload ?? {}, ctx);
    return { sync_status: "skipped" in result ? "skipped" : "synced", result };
  } catch (e) {
    return { sync_status: "failed", result: { error: e instanceof Error ? e.message : String(e) } };
  }
}
