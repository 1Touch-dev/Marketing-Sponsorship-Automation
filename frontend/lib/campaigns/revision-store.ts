import { isMissingMigration } from "../proposals/revision-store";
import { recordAudit, type AuditEntry } from "../audit/log";
import { serviceActor } from "../identity/actor";
import {
  APPROVAL_MESSAGES, campaignChecksum, campaignContent, campaignLines, campaignTotal,
  type CampaignApproval, type CampaignSnapshot,
} from "./revisions";

type Sb = any;

const TEXT_COLUMNS = "id, tenant_id, title, summary, objective, cta, description, activation, strategy, is_preapproved";

/** The campaign's words and package as they are now. Null when there is no such campaign in this club. */
export async function loadCampaignSnapshot(sb: Sb, tenantId: string, campaignId: string): Promise<(CampaignSnapshot & { is_preapproved: boolean }) | null> {
  const { data: row } = await sb.from("campaigns").select(TEXT_COLUMNS).eq("id", campaignId).eq("tenant_id", tenantId).maybeSingle();
  if (!row) return null;
  const { data: items } = await sb.from("campaign_inventory_items").select("inventory_id, name, category, inventory_type, quantity, unit, unit_price, notes, included").eq("campaign_id", campaignId).eq("tenant_id", tenantId);
  return { content: campaignContent(row as Record<string, unknown>), lines: campaignLines((items ?? []) as Array<Record<string, unknown>>), is_preapproved: !!(row as { is_preapproved?: boolean }).is_preapproved };
}

export type FrozenCampaignRevision = { id: string; revision_number: number; checksum: string; created: boolean };
export type FreezeResult = { ok: true; revision: FrozenCampaignRevision } | { ok: false; skipped: "migration_missing" | "not_found" | "error"; error?: string };

/** Freezes the campaign as it is now. If the newest revision already has the same checksum, that one is returned. */
export async function freezeCampaignRevision(sb: Sb, tenantId: string, campaignId: string, opts: { reason: string; by?: string | null }): Promise<FreezeResult> {
  const snap = await loadCampaignSnapshot(sb, tenantId, campaignId);
  if (!snap) return { ok: false, skipped: "not_found" };
  const checksum = campaignChecksum(snap);
  const { data: latest, error: latestErr } = await sb.from("campaign_revisions").select("id, revision_number, checksum").eq("campaign_id", campaignId).order("revision_number", { ascending: false }).limit(1).maybeSingle();
  if (latestErr) return isMissingMigration(latestErr) ? { ok: false, skipped: "migration_missing" } : { ok: false, skipped: "error", error: latestErr.message };
  const l = latest as { id: string; revision_number: number; checksum: string } | null;
  if (l && l.checksum === checksum) return { ok: true, revision: { id: l.id, revision_number: l.revision_number, checksum, created: false } };
  const { data: inserted, error } = await sb.from("campaign_revisions").insert({
    tenant_id: tenantId, campaign_id: campaignId, revision_number: (l?.revision_number ?? 0) + 1,
    content: snap.content, lines: snap.lines, total_brl: campaignTotal(snap.lines), checksum, reason: opts.reason, created_by: opts.by ?? null,
  }).select("id, revision_number").single();
  if (error || !inserted) return isMissingMigration(error) ? { ok: false, skipped: "migration_missing" } : { ok: false, skipped: "error", error: error?.message };
  return { ok: true, revision: { id: inserted.id, revision_number: inserted.revision_number, checksum, created: true } };
}

/** Freezes the campaign and binds its pre-approval to that revision. */
export async function approveCampaignRevision(sb: Sb, tenantId: string, campaignId: string, opts: { reason: string; by?: string | null }): Promise<FreezeResult> {
  const frozen = await freezeCampaignRevision(sb, tenantId, campaignId, opts);
  if (!frozen.ok) return frozen;
  const { error } = await sb.from("campaigns").update({ approved_revision_id: frozen.revision.id }).eq("id", campaignId).eq("tenant_id", tenantId);
  if (error) return isMissingMigration(error) ? { ok: false, skipped: "migration_missing" } : { ok: false, skipped: "error", error: error.message };
  return frozen;
}

/**
 * Whether the campaign may be run unattended RIGHT NOW: it is pre-approved, and what it says and contains is still what was
 * approved. This is the check the batch runner relies on; the flag alone is not enough, because the wording can change
 * after the flag is set.
 */
export async function campaignApproval(sb: Sb, tenantId: string, campaignId: string): Promise<CampaignApproval | null> {
  const snap = await loadCampaignSnapshot(sb, tenantId, campaignId);
  if (!snap) return null;
  if (!snap.is_preapproved) return { state: "not_preapproved", valid: false, message: APPROVAL_MESSAGES.not_preapproved };
  const { data: prop, error } = await sb.from("campaigns").select("approved_revision_id").eq("id", campaignId).eq("tenant_id", tenantId).maybeSingle();
  if (error) return isMissingMigration(error) ? { state: "legacy", valid: true, message: APPROVAL_MESSAGES.legacy } : { state: "unfrozen", valid: false, message: APPROVAL_MESSAGES.unfrozen };
  const revisionId = (prop as { approved_revision_id: string | null } | null)?.approved_revision_id ?? null;
  if (!revisionId) return { state: "unfrozen", valid: false, message: APPROVAL_MESSAGES.unfrozen };
  const { data: rev } = await sb.from("campaign_revisions").select("revision_number, checksum").eq("id", revisionId).eq("campaign_id", campaignId).eq("tenant_id", tenantId).maybeSingle();
  const r = rev as { revision_number: number; checksum: string } | null;
  // a pointer to a revision that cannot be found says nothing about what was approved
  if (!r) return { state: "unfrozen", valid: false, message: APPROVAL_MESSAGES.unfrozen };
  if (r.checksum !== campaignChecksum(snap)) return { state: "expired", valid: false, revision_number: r.revision_number, message: APPROVAL_MESSAGES.expired };
  return { state: "valid", valid: true, revision_number: r.revision_number, message: APPROVAL_MESSAGES.valid };
}

/**
 * Called after anything that can change a campaign's words or package. If the campaign was pre-approved and no longer
 * matches what was approved, the pre-approval is cleared, so the screen shows it off and the next batch is refused.
 * The check at run time makes the same decision without this; clearing the flag is so people can see it.
 */
export async function expirePreapprovalIfChanged(sb: Sb, tenantId: string, campaignId: string, by: string | null, audit: (e: AuditEntry) => Promise<unknown> = recordAudit): Promise<{ expired: boolean }> {
  const approval = await campaignApproval(sb, tenantId, campaignId);
  if (!approval || approval.state !== "expired") return { expired: false };
  const { data, error } = await sb.from("campaigns")
    .update({ is_preapproved: false, preapproved_by: null, preapproved_at: null })
    .eq("id", campaignId).eq("tenant_id", tenantId).eq("is_preapproved", true).select("id");
  if (error || !data?.length) return { expired: false };
  await audit({
    actor: serviceActor("campaign-revisions", { onBehalfOf: by }), tenant_id: tenantId, entity_type: "campaign", entity_id: campaignId, action: "campaign.preapproval_expired",
    metadata: { revision_number: approval.revision_number, changed_by: by, reason: "the campaign's wording or package changed after it was pre-approved" },
  });
  return { expired: true };
}
