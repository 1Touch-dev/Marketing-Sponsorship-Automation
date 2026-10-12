import type { WriteResult } from "../accounts/store";
import { isMissingMigration } from "../proposals/revision-store";
import { deriveStatus } from "../obligations/model";
import { acceptedProofs } from "./proof";

type Sb = any;

/**
 * A sponsor's acceptance of delivered work.
 *
 * This is its own record. It does NOT stand in for the club's internal acceptance (a second person with
 * `manage_obligations`) and does not change an obligation's status: whether a sponsor's accept should replace the internal
 * one is still James's decision (T16-04). Until then both exist side by side, and a person at the club can see which
 * sponsor contact accepted which proof, and when.
 *
 * What a sponsor accepts is the proof they were shown: the proof the club accepted, as it stands now. If it is replaced or
 * the work is reopened, an earlier acceptance is of proof that is no longer current, and the database refuses a new one
 * on a superseded proof.
 */
export interface SponsorAcceptance { id: string; obligation_id: string; proof_event_id: string; accepted_by: string; note: string | null; accepted_at: string }
const COLUMNS = "id, obligation_id, proof_event_id, accepted_by, note, accepted_at";
const notSetUp = "Sponsor acceptance is not set up yet (migration 0074).";

/** The acceptances of the proof that stands now, keyed by obligation. Acceptances of proof that was since replaced are not returned. */
export async function currentSponsorAcceptances(sb: Sb, tenantId: string, companyId: string, proofs: Map<string, { proof_event_id: string }>): Promise<Map<string, SponsorAcceptance>> {
  const out = new Map<string, SponsorAcceptance>();
  const ids = [...proofs.keys()];
  if (ids.length === 0) return out;
  const { data, error } = await sb.from("obligation_sponsor_acceptances").select(COLUMNS).eq("tenant_id", tenantId).eq("company_id", companyId).in("obligation_id", ids);
  if (error) return out; // not set up yet
  for (const a of (data ?? []) as SponsorAcceptance[]) if (proofs.get(a.obligation_id)?.proof_event_id === a.proof_event_id) out.set(a.obligation_id, a);
  return out;
}

export async function acceptAsSponsor(sb: Sb, i: { tenantId: string; companyId: string; email: string; obligationId: string; note?: string | null }): Promise<WriteResult<{ acceptance: SponsorAcceptance; already: boolean }>> {
  const email = i.email.trim().toLowerCase();
  const { data: o } = await sb.from("obligations").select("id, kind, contract_id").eq("id", i.obligationId).eq("tenant_id", i.tenantId).eq("company_id", i.companyId).maybeSingle();
  // someone else's obligation, one that does not exist, and the club's own onboarding steps all look the same
  if (!o || (o as { kind: string }).kind !== "deliverable") return { ok: false, status: 404, error: "Delivery item not found" };

  const { data: ev } = await sb.from("obligation_events").select("event_type, created_at").eq("obligation_id", i.obligationId);
  if (deriveStatus((ev ?? []) as Array<{ event_type: never; created_at: string }>) !== "accepted") {
    return { ok: false, status: 409, error: "This item has no accepted proof for you to accept yet." };
  }
  const proofs = await acceptedProofs(sb, i.tenantId, [i.obligationId]);
  const proof = proofs.get(i.obligationId);
  if (!proof) return { ok: false, status: 409, error: "This item has no proof to accept." };

  const existing = await sb.from("obligation_sponsor_acceptances").select(COLUMNS).eq("obligation_id", i.obligationId).eq("proof_event_id", proof.proof_event_id).maybeSingle();
  if (existing.error && isMissingMigration(existing.error)) return { ok: false, status: 503, error: notSetUp };
  // accepting twice is accepting once: the first record stands, and says who and when
  if (existing.data) return { ok: true, value: { acceptance: existing.data as SponsorAcceptance, already: true } };

  const note = i.note?.trim() ? i.note.trim().slice(0, 1000) : null;
  const { data, error } = await sb.from("obligation_sponsor_acceptances").insert({
    tenant_id: i.tenantId, obligation_id: i.obligationId, company_id: i.companyId, proof_event_id: proof.proof_event_id, accepted_by: email, note,
  }).select(COLUMNS).single();
  if (error || !data) {
    if (isMissingMigration(error)) return { ok: false, status: 503, error: notSetUp };
    // two accepts at once: the other one won, which is the same answer
    const again = await sb.from("obligation_sponsor_acceptances").select(COLUMNS).eq("obligation_id", i.obligationId).eq("proof_event_id", proof.proof_event_id).maybeSingle();
    if (again.data) return { ok: true, value: { acceptance: again.data as SponsorAcceptance, already: true } };
    return { ok: false, status: /no longer current/.test(error?.message ?? "") ? 409 : 500, error: error?.message ?? "Could not record the acceptance" };
  }
  return { ok: true, value: { acceptance: data as SponsorAcceptance, already: false } };
}
