import { isMissingMigration } from "../proposals/revision-store";
import { recordAudit, type AuditEntry } from "../audit/log";
import { serviceActor } from "../identity/actor";
import {
  APPROVAL_MESSAGES, campaignChecksum, campaignContent, campaignLines, campaignTotal,
  type CampaignApproval, type CampaignLine, type CampaignSnapshot,
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

export type BoundCampaignRevision = {
  revision_number: number;
  matches: boolean;
  content: Record<string, unknown>;
  lines: CampaignLine[];
};

/**
 * The revision the campaign was bound to, compared with the words and package now.
 * This still answers after the pre-approval flag is cleared. A manual revoke keeps the checksum the same, so matches stays true.
 */
export async function loadBoundCampaignRevisions(sb: Sb, tenantId: string, campaignIds: string[]): Promise<Map<string, BoundCampaignRevision>> {
  const out = new Map<string, BoundCampaignRevision>();
  if (campaignIds.length === 0) return out;
  const { data: rows, error } = await sb.from("campaigns")
    .select("id, title, summary, objective, cta, description, activation, strategy, approved_revision_id")
    .in("id", campaignIds)
    .eq("tenant_id", tenantId);
  if (error || !rows) return out;
  const withRev = (rows as Array<Record<string, unknown>>).filter((r) => r.approved_revision_id);
  if (withRev.length === 0) return out;
  const ids = withRev.map((r) => r.id as string);
  const revIds = withRev.map((r) => r.approved_revision_id as string);
  const { data: items } = await sb.from("campaign_inventory_items")
    .select("campaign_id, inventory_id, name, category, inventory_type, quantity, unit, unit_price, notes, included")
    .in("campaign_id", ids)
    .eq("tenant_id", tenantId);
  const { data: revs, error: revErr } = await sb.from("campaign_revisions")
    .select("id, campaign_id, revision_number, checksum, content, lines")
    .in("id", revIds)
    .eq("tenant_id", tenantId);
  if (revErr || !revs) return out;
  const itemsByCampaign = new Map<string, Array<Record<string, unknown>>>();
  for (const item of (items ?? []) as Array<Record<string, unknown>>) {
    const cid = String(item.campaign_id);
    const list = itemsByCampaign.get(cid) ?? [];
    list.push(item);
    itemsByCampaign.set(cid, list);
  }
  const revById = new Map<string, { id: string; campaign_id: string; revision_number: number; checksum: string; content: Record<string, unknown>; lines: unknown }>();
  for (const rev of revs as Array<{ id: string; campaign_id: string; revision_number: number; checksum: string; content: Record<string, unknown>; lines: unknown }>) {
    revById.set(rev.id, rev);
  }
  for (const row of withRev) {
    const rev = revById.get(row.approved_revision_id as string);
    if (!rev || rev.campaign_id !== row.id) continue;
    const snap = { content: campaignContent(row), lines: campaignLines(itemsByCampaign.get(row.id as string) ?? []) };
    out.set(row.id as string, {
      revision_number: rev.revision_number,
      matches: rev.checksum === campaignChecksum(snap),
      content: rev.content ?? {},
      lines: Array.isArray(rev.lines) ? rev.lines as CampaignLine[] : [],
    });
  }
  return out;
}

export async function loadBoundCampaignRevision(sb: Sb, tenantId: string, campaignId: string): Promise<BoundCampaignRevision | null> {
  const found = await loadBoundCampaignRevisions(sb, tenantId, [campaignId]);
  return found.get(campaignId) ?? null;
}

/**
 * Called after anything that can change a campaign's words or package. If the campaign was pre-approved and no longer
 * matches what was approved, the pre-approval is cleared, so the screen shows it off and the next batch is refused.
 * The check at run time makes the same decision without this; clearing the flag is so people can see it.
 * An approved campaign comes back as draft, which is what the Approvals queue loads. The bound revision stays.
 */
export async function expirePreapprovalIfChanged(sb: Sb, tenantId: string, campaignId: string, by: string | null, audit: (e: AuditEntry) => Promise<unknown> = recordAudit): Promise<{ expired: boolean }> {
  const approval = await campaignApproval(sb, tenantId, campaignId);
  if (!approval || approval.state !== "expired") return { expired: false };
  const { data: current } = await sb.from("campaigns").select("status").eq("id", campaignId).eq("tenant_id", tenantId).maybeSingle();
  const patch: Record<string, unknown> = { is_preapproved: false, preapproved_by: null, preapproved_at: null };
  if ((current as { status?: string } | null)?.status === "approved") patch.status = "draft";
  const { data, error } = await sb.from("campaigns")
    .update(patch)
    .eq("id", campaignId).eq("tenant_id", tenantId).eq("is_preapproved", true).select("id");
  if (error || !data?.length) return { expired: false };
  await audit({
    actor: serviceActor("campaign-revisions", { onBehalfOf: by }), tenant_id: tenantId, entity_type: "campaign", entity_id: campaignId, action: "campaign.preapproval_expired",
    metadata: { revision_number: approval.revision_number, changed_by: by, reason: "the campaign's wording or package changed after it was pre-approved" },
  });
  return { expired: true };
}
