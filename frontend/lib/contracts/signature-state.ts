/**
 * Signature progress for a contract, derived per recipient. One person
 * signing a contract that needs several signatures is "partially signed",
 * never "completed".
 */
export type SignerStatus = "pending" | "sent" | "opened" | "signed" | "declined";

export type Signer = {
  email: string;
  required: boolean;
  status: SignerStatus;
};

const RANK: Record<SignerStatus, number> = { pending: 0, sent: 1, opened: 2, signed: 3, declined: 3 };

/** A signer's status only moves forward; signed and declined are final. */
export function advanceSignerStatus(current: SignerStatus, next: SignerStatus): SignerStatus {
  if (current === "signed" || current === "declined") return current;
  return RANK[next] > RANK[current] ? next : current;
}

export type SignatureState = "not_sent" | "awaiting_signatures" | "partially_signed" | "completed" | "declined" | "cancelled";

export type SignatureView = {
  state: SignatureState;
  required: number;
  signed: number;
  declined: number;
  waitingOn: string[];
  /** set when the provider's envelope status and the per-signer facts disagree */
  anomaly: string | null;
};

export type EnvelopeStatus = "DRAFT" | "PENDING" | "COMPLETED" | "REJECTED" | "CANCELLED" | null | undefined;

export function deriveSignatureState(signers: Signer[], envelope?: EnvelopeStatus): SignatureView {
  const required = signers.filter((s) => s.required);
  const signed = required.filter((s) => s.status === "signed").length;
  const declined = required.filter((s) => s.status === "declined").length;
  const waitingOn = required.filter((s) => s.status !== "signed" && s.status !== "declined").map((s) => s.email);
  const base = { required: required.length, signed, declined, waitingOn, anomaly: null as string | null };

  if (envelope === "CANCELLED") return { ...base, state: "cancelled" };

  // The provider's envelope completes only when every recipient has signed.
  if (envelope === "COMPLETED") {
    const anomaly = required.length > 0 && signed < required.length ? "The provider reports the envelope completed, but not every required signer is recorded as signed." : null;
    return { ...base, state: "completed", anomaly };
  }

  if (required.length === 0) {
    if (envelope === "REJECTED") return { ...base, state: "declined" };
    if (envelope === "PENDING") return { ...base, state: "awaiting_signatures" };
    return { ...base, state: "not_sent" };
  }
  if (declined > 0 || envelope === "REJECTED") return { ...base, state: "declined" };
  if (signed === required.length) return { ...base, state: "completed" };
  if (signed > 0) return { ...base, state: "partially_signed" };
  if (required.some((s) => s.status !== "pending")) return { ...base, state: "awaiting_signatures" };
  return { ...base, state: "not_sent" };
}

/** The provider's view of one recipient, as plain strings. */
export type ProviderRecipient = {
  id?: number | string | null;
  email: string;
  name?: string | null;
  role: string;
  readStatus: string;
  signingStatus: string;
  sendStatus: string;
  signedAt?: string | null;
  signingOrder?: number | null;
  rejectionReason?: string | null;
};

const ROLE_MAP: Record<string, "signer" | "approver" | "viewer" | "assistant"> = {
  SIGNER: "signer",
  APPROVER: "approver",
  ASSISTANT: "assistant",
};

/** Turns a provider recipient into the one progress fact we record for it. */
export function signerEventFromRecipient(r: ProviderRecipient) {
  const role = ROLE_MAP[r.role.toUpperCase()] ?? "viewer";
  let status: SignerStatus = "pending";
  if (r.signingStatus === "SIGNED") status = "signed";
  else if (r.signingStatus === "REJECTED") status = "declined";
  else if (r.readStatus === "OPENED") status = "opened";
  else if (r.sendStatus === "SENT") status = "sent";
  return {
    email: r.email,
    name: r.name ?? null,
    role,
    // Viewers and assistants do not have to sign for the contract to be complete.
    required: role === "signer" || role === "approver",
    signing_order: r.signingOrder ?? null,
    status,
    at: r.signedAt ?? undefined,
    reason: r.rejectionReason ?? null,
    provider_recipient_id: r.id === null || r.id === undefined ? null : String(r.id),
  };
}
