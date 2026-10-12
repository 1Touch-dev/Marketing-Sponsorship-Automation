import crypto from "crypto";
import type { WriteResult } from "../accounts/store";
import { isMissingMigration } from "../proposals/revision-store";
import { deriveStatus, type EventRow } from "../obligations/model";

type Sb = any;
type Rec = Record<string, unknown>;

/**
 * Proof of delivery that is really stored. A "file" proof used to be a free-text reference to something that might not
 * exist; now it is the id of a file uploaded for that obligation (migration 0074), kept in a private bucket with its
 * checksum, so what a sponsor is shown, and what goes into a pack, is the file that was accepted.
 */
export const PROOF_BUCKET = "obligation-proof";
export const MAX_PROOF_BYTES = 15 * 1024 * 1024;
export const MAX_PACK_BYTES = 100 * 1024 * 1024;
const notSetUp = "Proof files are not set up yet (migration 0074).";

export interface ProofFile {
  id: string; obligation_id: string; company_id: string; storage_bucket: string; storage_path: string;
  file_name: string; content_type: string | null; size_bytes: number; sha256: string; uploaded_by: string; created_at: string;
}
const FILE_COLUMNS = "id, obligation_id, company_id, storage_bucket, storage_path, file_name, content_type, size_bytes, sha256, uploaded_by, created_at";

/** What the bytes are, from the bytes themselves: a client's claim about its own file is not trusted. */
export function sniffContentType(b: Buffer): { type: string; ext: string } | null {
  if (b.length < 12) return null;
  if (b.subarray(0, 4).toString("latin1") === "%PDF") return { type: "application/pdf", ext: "pdf" };
  if (b[0] === 0x89 && b.subarray(1, 4).toString("latin1") === "PNG") return { type: "image/png", ext: "png" };
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return { type: "image/jpeg", ext: "jpg" };
  if (b.subarray(0, 4).toString("latin1") === "GIF8") return { type: "image/gif", ext: "gif" };
  if (b.subarray(0, 4).toString("latin1") === "RIFF" && b.subarray(8, 12).toString("latin1") === "WEBP") return { type: "image/webp", ext: "webp" };
  if (b.subarray(4, 8).toString("latin1") === "ftyp") return { type: "video/mp4", ext: "mp4" };
  return null;
}

export function safeFileName(name: string, ext: string): string {
  const base = name.replace(/^.*[\\/]/, "").replace(/\.[^.]*$/, "").normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[^A-Za-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 100);
  return `${base || "proof"}.${ext}`;
}

/** Stores a file as proof for an obligation. The caller has already checked the obligation belongs to the caller's club. */
export async function saveProofFile(sb: Sb, tenantId: string, obligation: { id: string; company_id: string }, input: { bytes: Buffer; fileName: string; uploadedBy: string }): Promise<WriteResult<ProofFile>> {
  if (input.bytes.length === 0 || input.bytes.length > MAX_PROOF_BYTES) return { ok: false, status: 400, error: "The file must be between 1 byte and 15 MB." };
  const kind = sniffContentType(input.bytes);
  if (!kind) return { ok: false, status: 400, error: "That kind of file cannot be used as proof. Use a PDF, an image (PNG, JPEG, WebP, GIF) or an MP4 video." };
  const sha256 = crypto.createHash("sha256").update(input.bytes).digest("hex");
  const name = safeFileName(input.fileName, kind.ext);
  const path = `${tenantId}/${obligation.id}/${crypto.randomUUID()}-${name}`;
  const up = await sb.storage.from(PROOF_BUCKET).upload(path, input.bytes, { contentType: kind.type, upsert: false });
  if (up.error) return { ok: false, status: 500, error: `Could not store the file: ${up.error.message}` };
  const { data, error } = await sb.from("obligation_proof_files").insert({
    tenant_id: tenantId, obligation_id: obligation.id, company_id: obligation.company_id, storage_bucket: PROOF_BUCKET, storage_path: path,
    file_name: name, content_type: kind.type, size_bytes: input.bytes.length, sha256, uploaded_by: input.uploadedBy,
  }).select(FILE_COLUMNS).single();
  if (error || !data) {
    await sb.storage.from(PROOF_BUCKET).remove([path]); // nothing is left behind that no record points at
    return isMissingMigration(error) ? { ok: false, status: 503, error: notSetUp } : { ok: false, status: 500, error: error?.message ?? "Could not record the file" };
  }
  return { ok: true, value: data as ProofFile };
}

export async function listProofFiles(sb: Sb, tenantId: string, obligationIds: string[]): Promise<Map<string, ProofFile[]>> {
  const out = new Map<string, ProofFile[]>();
  if (obligationIds.length === 0) return out;
  const { data, error } = await sb.from("obligation_proof_files").select(FILE_COLUMNS).eq("tenant_id", tenantId).in("obligation_id", obligationIds).order("created_at", { ascending: true });
  if (error) return out; // not set up yet
  for (const f of (data ?? []) as ProofFile[]) out.set(f.obligation_id, [...(out.get(f.obligation_id) ?? []), f]);
  return out;
}

/** A short-lived address for one stored file. */
export async function proofFileUrl(sb: Sb, file: Pick<ProofFile, "storage_bucket" | "storage_path" | "file_name">, seconds = 300): Promise<string | null> {
  const { data, error } = await sb.storage.from(file.storage_bucket).createSignedUrl(file.storage_path, seconds, { download: file.file_name });
  return error ? null : ((data as { signedUrl?: string } | null)?.signedUrl ?? null);
}

export async function downloadProofFile(sb: Sb, file: Pick<ProofFile, "storage_bucket" | "storage_path">): Promise<Buffer | null> {
  const { data, error } = await sb.storage.from(file.storage_bucket).download(file.storage_path);
  if (error || !data) return null;
  return Buffer.from(await (data as Blob).arrayBuffer());
}

// ── what a sponsor is shown ─────────────────────────────────────────────────

/** The proof as a sponsor reads it: the words, the address, or the file's name and checksum. Never who inside the club recorded it. */
export interface SponsorProof {
  proof_event_id: string;
  kind: "link" | "file" | "statement";
  link?: string;
  statement?: string;
  file?: { id: string; name: string; size_bytes: number; content_type: string | null; sha256: string };
  recorded_at: string;
}

interface ProofEventRow extends EventRow { id: string; obligation_id: string; evidence_kind: string | null; evidence_ref: string | null }

/** The proof that stands now: the last one recorded, if the work has not been reopened since. */
export function currentProofEvent(events: ProofEventRow[]): ProofEventRow | null {
  const ordered = [...events].sort((a, b) => Date.parse(a.created_at) - Date.parse(b.created_at));
  let current: ProofEventRow | null = null;
  for (const e of ordered) {
    if (e.event_type === "evidenced") current = e;
    else if (e.event_type === "reopened") current = null;
  }
  return current;
}

const isWebAddress = (v: string) => /^https?:\/\/\S+$/i.test(v);

export function sponsorProofFrom(event: ProofEventRow, files: ProofFile[]): SponsorProof | null {
  const ref = (event.evidence_ref ?? "").trim();
  const base = { proof_event_id: event.id, recorded_at: event.created_at };
  if (event.evidence_kind === "statement" && ref) return { ...base, kind: "statement", statement: ref };
  // only a web address is ever handed to a sponsor as a link
  if (event.evidence_kind === "link" && isWebAddress(ref)) return { ...base, kind: "link", link: ref };
  if (event.evidence_kind === "file") {
    const f = files.find((x) => x.id === ref);
    if (f) return { ...base, kind: "file", file: { id: f.id, name: f.file_name, size_bytes: Number(f.size_bytes), content_type: f.content_type, sha256: f.sha256 } };
  }
  return null;
}

/**
 * For each obligation the club has accepted: the proof that was accepted. Obligations not yet accepted are absent, so a
 * sponsor sees proof only once the club's own second person has accepted it.
 */
export async function acceptedProofs(sb: Sb, tenantId: string, obligationIds: string[]): Promise<Map<string, SponsorProof>> {
  const out = new Map<string, SponsorProof>();
  if (obligationIds.length === 0) return out;
  const { data } = await sb.from("obligation_events").select("id, obligation_id, event_type, evidence_kind, evidence_ref, created_at").eq("tenant_id", tenantId).in("obligation_id", obligationIds).order("created_at", { ascending: true });
  const byObligation = new Map<string, ProofEventRow[]>();
  for (const e of (data ?? []) as ProofEventRow[]) byObligation.set(e.obligation_id, [...(byObligation.get(e.obligation_id) ?? []), e]);
  const files = await listProofFiles(sb, tenantId, obligationIds);
  for (const [id, events] of byObligation) {
    if (deriveStatus(events) !== "accepted") continue;
    const proof = currentProofEvent(events);
    const shown = proof ? sponsorProofFrom(proof, files.get(id) ?? []) : null;
    if (shown) out.set(id, shown);
  }
  return out;
}

