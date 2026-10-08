import { revisionChecksum, type QuoteLine } from "../proposals/revisions";

/**
 * What a contract can actually prove, derived from recorded evidence instead of
 * a status somebody set. "Marked active" is a claim; a provider's record that
 * every signer signed, or a second person's verification of a signed document,
 * is proof.
 */
export type EvidenceType =
  | "revision_bound"
  | "signer_sent"
  | "signer_opened"
  | "signer_signed"
  | "signer_declined"
  | "envelope_completed"
  | "signed_document"
  | "activation_claimed"
  | "manual_signature_claim"
  | "manual_verification"
  | "manual_rejection";

export type Evidence = {
  id?: string;
  evidence_type: EvidenceType;
  source: "provider" | "platform" | "manual";
  signer_email?: string | null;
  revision_id?: string | null;
  revision_checksum?: string | null;
  document_sha256?: string | null;
  references_evidence_id?: string | null;
  actor_user_id?: string | null;
  actor_email?: string | null;
  occurred_at: string;
};

export type ContractStage =
  | "no_evidence"
  | "terms_frozen"
  | "sent_for_signature"
  | "partially_signed"
  | "activated_unverified"
  | "signature_claimed"
  | "signed"
  | "declined"
  | "cancelled";

export type EvidenceLevel = "none" | "claimed" | "provider_verified" | "manually_verified";

export type ProofView = {
  stage: ContractStage;
  label: string;
  evidenceLevel: EvidenceLevel;
  /** the signature is proven (by the provider, or by a second person), not just claimed */
  verified: boolean;
  signedBy: string[];
  requiredSigners: string[];
  gaps: string[];
};

export const STAGE_LABELS: Record<ContractStage, string> = {
  no_evidence: "No evidence recorded",
  terms_frozen: "Terms frozen — not sent for signature",
  sent_for_signature: "Sent for signature",
  partially_signed: "Partially signed",
  activated_unverified: "Marked active — no signature evidence",
  signature_claimed: "Signature claimed — awaiting verification",
  signed: "Signed",
  declined: "Declined",
  cancelled: "Cancelled",
};

/** A claim only counts once a different person has verified it. */
export function canVerifyClaim(claim: { actor_user_id?: string | null }, verifierUserId: string | null | undefined): boolean {
  return !!claim.actor_user_id && !!verifierUserId && claim.actor_user_id !== verifierUserId;
}

export function deriveProof(input: { evidence: Evidence[]; requiredSigners: string[]; contractStatus?: string | null }): ProofView {
  const evidence = input.evidence
    .map((e, i) => ({ e, i }))
    .sort((a, b) => Date.parse(a.e.occurred_at) - Date.parse(b.e.occurred_at) || a.i - b.i)
    .map((x) => x.e);
  const of = (t: EvidenceType) => evidence.filter((e) => e.evidence_type === t);
  const required = input.requiredSigners.map((s) => s.toLowerCase());
  const gaps: string[] = [];

  const signedBy = [...new Set(of("signer_signed").filter((e) => e.source === "provider").map((e) => (e.signer_email ?? "").toLowerCase()).filter(Boolean))];
  const result = (stage: ContractStage, evidenceLevel: EvidenceLevel): ProofView => ({
    stage,
    label: STAGE_LABELS[stage],
    evidenceLevel,
    verified: evidenceLevel === "provider_verified" || evidenceLevel === "manually_verified",
    signedBy,
    requiredSigners: required,
    gaps,
  });

  if (!of("revision_bound").length && evidence.length > 0) gaps.push("The contract is not bound to a frozen revision of the terms.");

  if (input.contractStatus === "cancelled") return result("cancelled", "none");

  // Provider proof: the e-signature provider records each signature and the completed envelope.
  const envelopeDone = of("envelope_completed").length > 0;
  if (envelopeDone) {
    if (required.length > 0 && !required.every((r) => signedBy.includes(r))) {
      gaps.push("The provider reports the envelope completed, but not every required signer has a recorded signature.");
    }
    if (required.length === 0) gaps.push("The list of required signers was not recorded.");
    if (!of("signed_document").length) gaps.push("The signed document was not stored, so its hash cannot be checked.");
    return result("signed", "provider_verified");
  }

  // Manual proof: a person recorded a signed document, a different person verified it.
  const rejected = new Set(of("manual_rejection").map((e) => e.references_evidence_id));
  const claims = of("manual_signature_claim").filter((c) => !rejected.has(c.id ?? null));
  const verifications = of("manual_verification");
  for (const claim of claims) {
    const valid = verifications.find((v) => v.references_evidence_id === (claim.id ?? null) && canVerifyClaim(claim, v.actor_user_id));
    if (valid && claim.document_sha256) return result("signed", "manually_verified");
    const selfVerified = verifications.some((v) => v.references_evidence_id === (claim.id ?? null) && !canVerifyClaim(claim, v.actor_user_id));
    if (selfVerified) gaps.push("A verification by the same person who recorded the claim does not count; a different person must verify.");
  }
  if (claims.length > 0) {
    if (claims.some((c) => !c.document_sha256)) gaps.push("The claim has no signed document attached.");
    else gaps.push("Waiting for a second person to verify the signed document.");
    return result("signature_claimed", "claimed");
  }

  if (of("signer_declined").length > 0) return result("declined", "none");

  if (signedBy.length > 0) return result("partially_signed", "none");
  if (of("signer_sent").length > 0 || of("signer_opened").length > 0) return result("sent_for_signature", "none");

  if (of("activation_claimed").length > 0) {
    gaps.push("It was marked active, but no signature evidence is recorded.");
    return result("activated_unverified", "claimed");
  }
  if (of("revision_bound").length > 0) return result("terms_frozen", "none");

  gaps.push("No evidence is recorded for this contract.");
  return result("no_evidence", "none");
}

export type StoredRevision = {
  revision_number: number;
  title: string | null;
  content: Record<string, unknown>;
  lines: QuoteLine[];
  checksum: string;
};

export type RevisionIntegrity = {
  revision_number: number;
  stored_checksum: string;
  recomputed_checksum: string | null;
  /** null when the revision predates storing the title and cannot be recomputed */
  intact: boolean | null;
};

/** Recomputes every revision's checksum from what is stored, so tampering shows. */
export function verifyRevisions(rows: StoredRevision[]): RevisionIntegrity[] {
  return rows.map((r) => {
    if (r.title === null || r.title === undefined) {
      return { revision_number: r.revision_number, stored_checksum: r.checksum, recomputed_checksum: null, intact: null };
    }
    const recomputed = revisionChecksum({ title: r.title, content: r.content, lines: r.lines });
    return { revision_number: r.revision_number, stored_checksum: r.checksum, recomputed_checksum: recomputed, intact: recomputed === r.checksum };
  });
}
