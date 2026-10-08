import { createHash } from "crypto";
import { isMissingMigration } from "../proposals/revision-store";
import { deriveProof, verifyRevisions, type Evidence, type EvidenceType, type ProofView, type RevisionIntegrity, type StoredRevision } from "./proof";

type Sb = any;

export const EVIDENCE_BUCKET = "proposal-assets";

export type NewEvidence = {
  evidence_type: EvidenceType;
  source: "provider" | "platform" | "manual";
  signer_email?: string | null;
  revision_id?: string | null;
  revision_checksum?: string | null;
  document_sha256?: string | null;
  document_path?: string | null;
  document_url?: string | null;
  references_evidence_id?: string | null;
  actor_user_id?: string | null;
  actor_email?: string | null;
  provider?: string | null;
  provider_event_id?: string | null;
  occurred_at?: string;
  detail?: Record<string, unknown>;
};

export type RecordEvidenceResult =
  | { ok: true; id: string | null; duplicate: boolean }
  | { ok: false; skipped: "migration_missing" | "error"; error?: string };

export function sha256Hex(data: Buffer | Uint8Array | string): string {
  return createHash("sha256").update(data).digest("hex");
}

export async function recordEvidence(sb: Sb, tenantId: string, contractId: string, ev: NewEvidence): Promise<RecordEvidenceResult> {
  const { data, error } = await sb
    .from("contract_evidence")
    .insert({
      tenant_id: tenantId,
      contract_id: contractId,
      evidence_type: ev.evidence_type,
      source: ev.source,
      signer_email: ev.signer_email?.toLowerCase() ?? null,
      revision_id: ev.revision_id ?? null,
      revision_checksum: ev.revision_checksum ?? null,
      document_sha256: ev.document_sha256 ?? null,
      document_path: ev.document_path ?? null,
      document_url: ev.document_url ?? null,
      references_evidence_id: ev.references_evidence_id ?? null,
      actor_user_id: ev.actor_user_id ?? null,
      actor_email: ev.actor_email ?? null,
      provider: ev.provider ?? null,
      provider_event_id: ev.provider_event_id ?? null,
      occurred_at: ev.occurred_at ?? new Date().toISOString(),
      detail: ev.detail ?? {},
    })
    .select("id")
    .single();
  if (!error) return { ok: true, id: (data as { id: string }).id, duplicate: false };
  if (error.code === "23505") return { ok: true, id: null, duplicate: true };
  return isMissingMigration(error) ? { ok: false, skipped: "migration_missing" } : { ok: false, skipped: "error", error: error.message };
}

/** For call sites where keeping the record must never break the action it describes. */
export async function recordEvidenceSafe(sb: Sb, tenantId: string, contractId: string, ev: NewEvidence): Promise<void> {
  try {
    const r = await recordEvidence(sb, tenantId, contractId, ev);
    if (!r.ok && r.skipped === "error") console.error("[contract_evidence] could not record", ev.evidence_type, r.error);
  } catch (err) {
    console.error("[contract_evidence] could not record", ev.evidence_type, err);
  }
}

export type DocumentIntegrity = { evidence_id: string; path: string; stored_sha256: string; recomputed_sha256: string | null; intact: boolean | null };

export type LoadedProof = {
  contract: { id: string; tenant_id: string; contract_number: string; title: string; signature_status: string; revision_id: string | null; proposal_id: string | null };
  proof: ProofView;
  evidence: Array<Evidence & { document_path?: string | null; document_url?: string | null; detail?: unknown }>;
  revisions: RevisionIntegrity[];
  boundRevision: { revision_number: number; checksum: string; intact: boolean | null; isProposalsCurrentApproved: boolean | null } | null;
  documents: DocumentIntegrity[];
};

export async function loadProof(sb: Sb, tenantId: string, contractId: string): Promise<LoadedProof | null> {
  const { data: contract } = await sb
    .from("contracts")
    .select("id, tenant_id, contract_number, title, signature_status, revision_id, proposal_id")
    .eq("id", contractId)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (!contract) return null;
  const c = contract as LoadedProof["contract"];

  const { data: ev, error: evErr } = await sb
    .from("contract_evidence")
    .select("id, evidence_type, source, signer_email, revision_id, revision_checksum, document_sha256, document_path, document_url, references_evidence_id, actor_user_id, actor_email, occurred_at, detail")
    .eq("contract_id", contractId)
    .order("occurred_at", { ascending: true });
  const evidence = (evErr ? [] : ev ?? []) as LoadedProof["evidence"];

  const { data: signerRows } = await sb.from("contract_signers").select("email, required").eq("contract_id", contractId);
  const requiredSigners = ((signerRows ?? []) as Array<{ email: string; required: boolean }>).filter((s) => s.required).map((s) => s.email);

  const proof = deriveProof({ evidence, requiredSigners, contractStatus: c.signature_status });

  let revisions: RevisionIntegrity[] = [];
  let boundRevision: LoadedProof["boundRevision"] = null;
  if (c.proposal_id) {
    const { data: revRows } = await sb
      .from("proposal_revisions")
      .select("id, revision_number, title, content, lines, checksum")
      .eq("proposal_id", c.proposal_id)
      .order("revision_number", { ascending: true });
    const rows = (revRows ?? []) as Array<StoredRevision & { id: string }>;
    revisions = verifyRevisions(rows);
    if (c.revision_id) {
      const idx = rows.findIndex((r) => r.id === c.revision_id);
      if (idx >= 0) {
        const { data: prop } = await sb.from("proposals").select("approved_revision_id").eq("id", c.proposal_id).maybeSingle();
        boundRevision = {
          revision_number: rows[idx].revision_number,
          checksum: rows[idx].checksum,
          intact: revisions[idx].intact,
          isProposalsCurrentApproved: ((prop as { approved_revision_id?: string | null } | null)?.approved_revision_id ?? null) === c.revision_id,
        };
      }
    }
  }

  const documents: DocumentIntegrity[] = [];
  for (const e of evidence) {
    if (!e.document_path || !e.document_sha256 || !e.id) continue;
    let recomputed: string | null = null;
    try {
      const { data: blob, error } = await sb.storage.from(EVIDENCE_BUCKET).download(e.document_path);
      if (!error && blob) recomputed = sha256Hex(Buffer.from(await (blob as Blob).arrayBuffer()));
    } catch {
      recomputed = null;
    }
    documents.push({ evidence_id: e.id, path: e.document_path, stored_sha256: e.document_sha256, recomputed_sha256: recomputed, intact: recomputed === null ? null : recomputed === e.document_sha256 });
  }

  return { contract: c, proof, evidence, revisions, boundRevision, documents };
}

/** Everything a third party needs to check the proof without trusting this platform. */
export async function buildProofBundle(sb: Sb, tenantId: string, contractId: string) {
  const loaded = await loadProof(sb, tenantId, contractId);
  if (!loaded) return null;
  const { data: revRows } = loaded.contract.proposal_id
    ? await sb.from("proposal_revisions").select("revision_number, title, content, lines, checksum, created_at").eq("proposal_id", loaded.contract.proposal_id).order("revision_number")
    : { data: [] };
  return {
    generated_at: new Date().toISOString(),
    how_to_verify: [
      "Revisions: for each revision, sha256 of the canonical JSON of { content: <commercial fields of content plus title>, lines: <lines without name and line_total, sorted> } must equal its checksum.",
      "Documents: sha256 of the stored file must equal document_sha256 of its evidence row.",
      "Evidence rows are append-only in the database; a manual signature counts only when a different person verified it.",
    ],
    contract: loaded.contract,
    proof: loaded.proof,
    revisions: revRows ?? [],
    revision_integrity: loaded.revisions,
    evidence: loaded.evidence,
    documents: loaded.documents,
  };
}
