import { recordAudit } from "@/lib/audit/log";
import { approveRevision, checkProposalDrift } from "./revision-store";

type Sb = any;

export type ActivationGuard = { ok: true } | { ok: false; code: string; message: string };

/**
 * Before a proposal becomes an active contract, its terms must still be the
 * terms that were approved. A proposal approved before revisions existed has
 * no baseline, so one is frozen now (it is what is being signed).
 * A no-op until migration 0052 is applied.
 */
export async function guardActivationTerms(sb: Sb, tenantId: string, proposalId: string, userId?: string | null): Promise<ActivationGuard> {
  const check = await checkProposalDrift(sb, tenantId, proposalId);
  if (!check.ok) return { ok: true };

  if (!check.drift.hasApprovedRevision) {
    await approveRevision(sb, tenantId, proposalId, { reason: "Baseline frozen at contract activation", userId });
    return { ok: true };
  }
  if (check.drift.drifted) {
    return {
      ok: false,
      code: "proposal_changed_after_approval",
      message: "This proposal's terms changed after it was approved. Send it back for review and re-approve before activating the contract.",
    };
  }
  return { ok: true };
}

/**
 * After any edit to an approved proposal: if its commercial terms no longer
 * match the approved revision, the approval is void and the proposal goes
 * back to review.
 */
export async function invalidateIfDrifted(
  sb: Sb,
  tenantId: string,
  proposalId: string,
  actor: { id?: string | null; email?: string | null },
  reason: string,
): Promise<{ invalidated: boolean }> {
  const check = await checkProposalDrift(sb, tenantId, proposalId);
  if (!check.ok || !check.drift.drifted) return { invalidated: false };
  if (check.status !== "approved" && check.status !== "sent") return { invalidated: false };

  await sb
    .from("proposals")
    .update({ status: "under_review", status_reason: "Terms changed after approval — re-approval required" })
    .eq("id", proposalId)
    .eq("tenant_id", tenantId);

  await recordAudit({
    entity_type: "proposal",
    entity_id: proposalId,
    action: "proposal.approval_invalidated",
    actor_email: actor.email ?? null,
    tenant_id: tenantId,
    metadata: {
      reason,
      actor_user_id: actor.id ?? null,
      approved_checksum: check.drift.approvedChecksum,
      current_checksum: check.drift.currentChecksum,
    },
  });
  return { invalidated: true };
}
