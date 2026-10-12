import JSZip from "jszip";
import { listObligations } from "../obligations/store";
import { loadMatches } from "./match";
import { MAX_PACK_BYTES, acceptedProofs, downloadProofFile, listProofFiles, safeFileName } from "./proof";
import { currentSponsorAcceptances } from "./sponsor-accept";

type Sb = any;

/**
 * A proof pack for one contract: every item the club has accepted, each with the proof that was accepted (the words, the
 * address, or the stored file itself), in one zip with an index. It is assembled from the same accepted proof a sponsor is
 * shown, so the pack can never hold more than the sponsor was shown: nothing about who recorded it, no notes, no cost.
 *
 * Bounded: a pack stops adding files at 100 MB and says so in its index, rather than building something too big to send.
 */
export interface PackResult { zip: Buffer; items: number; files_included: number; files_skipped: number; truncated: boolean }

export async function buildProofPack(sb: Sb, i: { tenantId: string; contractId: string; companyId?: string | null; contractLabel: string }): Promise<PackResult | { error: string; status: number }> {
  const res = await listObligations(sb, i.tenantId, { contractId: i.contractId, companyId: i.companyId ?? null });
  if (!res.ok) return { error: res.error, status: res.status };
  const accepted = res.value.filter((o) => o.kind === "deliverable" && o.status === "accepted" && (!i.companyId || o.company_id === i.companyId));
  const proofs = await acceptedProofs(sb, i.tenantId, accepted.map((o) => o.id));
  const companyId = i.companyId ?? accepted[0]?.company_id ?? "";
  const acceptances = companyId ? await currentSponsorAcceptances(sb, i.tenantId, companyId, proofs) : new Map();
  const matches = await loadMatches(sb, accepted.map((o) => o.match_id).filter((m): m is string => !!m));
  const allFiles = await listProofFiles(sb, i.tenantId, accepted.map((o) => o.id));

  const zip = new JSZip();
  let bytes = 0;
  let included = 0;
  let skipped = 0;
  const items: Array<Record<string, unknown>> = [];
  let n = 0;
  for (const o of accepted) {
    const proof = proofs.get(o.id);
    if (!proof) continue;
    n++;
    const entry: Record<string, unknown> = {
      title: o.title, quantity: o.quantity, unit: o.unit, due_date: o.due_date,
      match: o.match_id && matches.get(o.match_id) ? { opponent: matches.get(o.match_id)!.opponent, match_date: matches.get(o.match_id)!.match_date } : null,
      proof: { kind: proof.kind, recorded_at: proof.recorded_at, ...(proof.link ? { link: proof.link } : {}), ...(proof.statement ? { statement: proof.statement } : {}) },
      sponsor_acceptance: acceptances.get(o.id) ? { accepted_at: acceptances.get(o.id).accepted_at, accepted_by: acceptances.get(o.id).accepted_by } : null,
    };
    if (proof.kind === "file" && proof.file) {
      const stored = (allFiles.get(o.id) ?? []).find((f) => f.id === proof.file!.id);
      const path = `files/${String(n).padStart(2, "0")}-${safeFileName(proof.file.name.replace(/\.[^.]*$/, ""), proof.file.name.split(".").pop() || "bin")}`;
      let placed = false;
      if (stored && bytes + Number(stored.size_bytes) <= MAX_PACK_BYTES) {
        const buf = await downloadProofFile(sb, stored);
        if (buf) { zip.file(path, buf); bytes += buf.length; included++; placed = true; }
      }
      if (!placed) skipped++;
      (entry.proof as Record<string, unknown>).file = { name: proof.file.name, size_bytes: proof.file.size_bytes, sha256: proof.file.sha256, path: placed ? path : null, included: placed };
    }
    items.push(entry);
  }
  const truncated = skipped > 0;
  zip.file("index.json", JSON.stringify({ contract: i.contractLabel, generated_at: new Date().toISOString(), items, files_included: included, files_not_included: skipped, note: truncated ? "Some files are not in this pack (too large to include together, or not found). Their name and checksum are listed." : undefined }, null, 2));
  return { zip: await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" }), items: items.length, files_included: included, files_skipped: skipped, truncated };
}
