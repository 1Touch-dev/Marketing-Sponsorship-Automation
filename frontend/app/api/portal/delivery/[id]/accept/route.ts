import { portalPost } from "@/lib/portal/route";
import { recordAudit } from "@/lib/audit/log";
import { externalActor } from "@/lib/identity/actor";
import { acceptAsSponsor } from "@/lib/delivery/sponsor-accept";

export const runtime = "nodejs";

/**
 * POST /api/portal/delivery/<id>/accept   { note? }
 * The sponsor accepts the proof the club accepted for one of its delivery items. Recorded under the sponsor contact's name.
 * It does not change the item's status or replace the club's own acceptance (T16-04 is still James's decision).
 */
export const POST = portalPost(async (sb, ctx, params, body) => {
  const res = await acceptAsSponsor(sb, { tenantId: ctx.tenantId, companyId: ctx.companyId, email: ctx.email, obligationId: params.id, note: typeof body.note === "string" ? body.note : null });
  if (!res.ok) return res;
  if (!res.value.already) {
    await recordAudit({
      actor: externalActor(`sponsor portal: ${ctx.email}`, `portal:${ctx.email}`), tenant_id: ctx.tenantId, entity_type: "obligation", entity_id: params.id,
      action: "obligation.sponsor_accepted", metadata: { company_id: ctx.companyId, proof_event_id: res.value.acceptance.proof_event_id },
    });
  }
  return { ok: true as const, value: { accepted_at: res.value.acceptance.accepted_at, accepted_by: res.value.acceptance.accepted_by, already: res.value.already } };
});
