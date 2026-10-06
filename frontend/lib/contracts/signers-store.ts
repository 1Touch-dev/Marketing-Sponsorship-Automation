import { isMissingMigration } from "../proposals/revision-store";
import { recordEvidenceSafe } from "./evidence-store";
import { advanceSignerStatus, deriveSignatureState, type EnvelopeStatus, type SignatureView, type SignerStatus } from "./signature-state";

type Sb = any;

export type SignerRow = {
  id?: string;
  email: string;
  name: string | null;
  role: string;
  signing_order: number | null;
  required: boolean;
  status: SignerStatus;
  sent_at: string | null;
  opened_at: string | null;
  signed_at: string | null;
  declined_at: string | null;
  decline_reason: string | null;
};

const ENVELOPE_FROM_LOCAL: Record<string, EnvelopeStatus> = { pending: "PENDING", completed: "COMPLETED", rejected: "REJECTED", cancelled: "CANCELLED", draft: "DRAFT" };

export type SignerEvent = {
  email: string;
  status: SignerStatus;
  at?: string;
  name?: string | null;
  role?: "signer" | "approver" | "viewer" | "assistant";
  required?: boolean;
  signing_order?: number | null;
  reason?: string | null;
  provider_recipient_id?: string | null;
};

/** Records one recipient's progress. Moves forward only and creates the row if the recipient is new. */
export async function applySignerEvent(sb: Sb, tenantId: string, contractId: string, ev: SignerEvent): Promise<{ ok: true; status: SignerStatus } | { ok: false; skipped: "migration_missing" | "error"; error?: string }> {
  const email = ev.email.trim().toLowerCase();
  const at = ev.at ?? new Date().toISOString();

  // A person is identified by email. The role only decides how a new person is
  // created, so a later event that omits it (a plain "opened") reaches the same
  // row instead of silently creating a second one as a required signer.
  const { data: found, error: readErr } = await sb
    .from("contract_signers")
    .select("id, status, role")
    .eq("contract_id", contractId)
    .eq("email", email);
  if (readErr) return isMissingMigration(readErr) ? { ok: false, skipped: "migration_missing" } : { ok: false, skipped: "error", error: readErr.message };
  const rows = (found ?? []) as Array<{ id: string; status: SignerStatus; role: string }>;
  const existing = (ev.role ? rows.find((r) => r.role === ev.role) : rows[0]) ?? null;
  const role = ev.role ?? existing?.role ?? "signer";

  const current = ((existing as { status?: SignerStatus } | null)?.status ?? "pending") as SignerStatus;
  const next = advanceSignerStatus(current, ev.status);

  const stamps: Record<string, unknown> = {};
  if (next === "sent" || (next !== "pending" && !existing)) stamps.sent_at = at;
  if (next === "opened") stamps.opened_at = at;
  if (next === "signed") stamps.signed_at = at;
  if (next === "declined") { stamps.declined_at = at; stamps.decline_reason = ev.reason ?? null; }

  if (existing) {
    const { error } = await sb
      .from("contract_signers")
      .update({ status: next, last_event_at: at, ...(next !== current ? stamps : {}), ...(ev.provider_recipient_id ? { provider_recipient_id: ev.provider_recipient_id } : {}) })
      .eq("id", (existing as { id: string }).id);
    if (!error && next !== current) await recordSignerEvidence(sb, tenantId, contractId, email, next, at, ev.reason);
    return error ? { ok: false, skipped: "error", error: error.message } : { ok: true, status: next };
  }
  const { error } = await sb.from("contract_signers").insert({
    tenant_id: tenantId,
    contract_id: contractId,
    email,
    name: ev.name ?? null,
    role,
    signing_order: ev.signing_order ?? null,
    required: ev.required ?? (role === "signer" || role === "approver"),
    status: next,
    last_event_at: at,
    provider_recipient_id: ev.provider_recipient_id ?? null,
    ...stamps,
  });
  if (!error && next !== "pending") await recordSignerEvidence(sb, tenantId, contractId, email, next, at, ev.reason);
  return error ? { ok: false, skipped: "error", error: error.message } : { ok: true, status: next };
}

const SIGNER_EVIDENCE: Partial<Record<SignerStatus, "signer_sent" | "signer_opened" | "signer_signed" | "signer_declined">> = {
  sent: "signer_sent",
  opened: "signer_opened",
  signed: "signer_signed",
  declined: "signer_declined",
};

/** Each real change in a signer's progress is kept as evidence, once, even if the provider repeats it. */
async function recordSignerEvidence(sb: Sb, tenantId: string, contractId: string, email: string, status: SignerStatus, at: string, reason?: string | null) {
  const type = SIGNER_EVIDENCE[status];
  if (!type) return;
  await recordEvidenceSafe(sb, tenantId, contractId, {
    evidence_type: type,
    source: "provider",
    signer_email: email,
    provider: "documenso",
    provider_event_id: `${email}:${status}`,
    occurred_at: at,
    detail: reason ? { reason } : {},
  });
}

export async function loadSignatureView(sb: Sb, tenantId: string, contractId: string): Promise<{ signers: SignerRow[]; view: SignatureView; envelope: EnvelopeStatus } | null> {
  const { data: contract } = await sb.from("contracts").select("id, signature_status").eq("id", contractId).eq("tenant_id", tenantId).maybeSingle();
  if (!contract) return null;
  const { data: rows, error } = await sb
    .from("contract_signers")
    .select("id, email, name, role, signing_order, required, status, sent_at, opened_at, signed_at, declined_at, decline_reason")
    .eq("contract_id", contractId)
    .order("signing_order", { ascending: true, nullsFirst: false });
  const signers = (error ? [] : rows ?? []) as SignerRow[];
  const envelope = ENVELOPE_FROM_LOCAL[(contract as { signature_status: string }).signature_status] ?? null;
  return { signers, envelope, view: deriveSignatureState(signers, envelope) };
}

/**
 * When every required signer has signed (or one has declined), the contract
 * itself reflects that. Moves forward only: a completed contract is not reopened.
 */
export async function settleContractSignature(sb: Sb, tenantId: string, contractId: string): Promise<{ changedTo: string | null }> {
  const loaded = await loadSignatureView(sb, tenantId, contractId);
  if (!loaded) return { changedTo: null };
  const { data: contract } = await sb.from("contracts").select("signature_status").eq("id", contractId).maybeSingle();
  const current = (contract as { signature_status?: string } | null)?.signature_status;
  if (current === "completed" || current === "cancelled") return { changedTo: null };

  if (loaded.view.state === "completed" && loaded.signers.length > 0) {
    await sb.from("contracts").update({ signature_status: "completed", signature_completed_at: new Date().toISOString() }).eq("id", contractId).eq("tenant_id", tenantId);
    await recordEvidenceSafe(sb, tenantId, contractId, { evidence_type: "envelope_completed", source: "provider", provider: "documenso", provider_event_id: "envelope_completed" });
    return { changedTo: "completed" };
  }
  if (loaded.view.state === "declined" && current !== "rejected") {
    await sb.from("contracts").update({ signature_status: "rejected" }).eq("id", contractId).eq("tenant_id", tenantId);
    return { changedTo: "rejected" };
  }
  return { changedTo: null };
}
