import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { requirePermission } from "@/lib/auth/server-permission";
import { recordAudit } from "@/lib/audit/log";
import { EVIDENCE_BUCKET, recordEvidence, sha256Hex } from "@/lib/contracts/evidence-store";

export const runtime = "nodejs";
export const maxDuration = 30;

const MAX_BYTES = 10 * 1024 * 1024;

/**
 * Records that a contract was signed outside the e-signature provider (on
 * paper, or in another system), together with the signed document. The
 * document is stored and hashed. This is a claim: it counts as proof only
 * after a different person verifies it (see ../verify).
 * multipart/form-data: file (PDF), signers (JSON array of names or emails), signed_at, note.
 */
export async function POST(req: Request, ctx: { params: { id: string } }) {
  const auth = await requirePermission("edit_proposal");
  if ("error" in auth) return auth.error;

  const sb = supabaseAdmin();
  const { data: contract } = await sb.from("contracts").select("id").eq("id", ctx.params.id).eq("tenant_id", auth.user.tenant_id).maybeSingle();
  if (!contract) return NextResponse.json({ error: "Contract not found" }, { status: 404 });

  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!form || !(file instanceof File)) return NextResponse.json({ error: "A signed PDF is required (field: file)." }, { status: 400 });
  if (file.size === 0 || file.size > MAX_BYTES) return NextResponse.json({ error: "The file must be between 1 byte and 10 MB." }, { status: 400 });

  const bytes = Buffer.from(await file.arrayBuffer());
  if (bytes.subarray(0, 4).toString("latin1") !== "%PDF") return NextResponse.json({ error: "The file is not a PDF." }, { status: 400 });

  let signers: string[] = [];
  try {
    const raw = JSON.parse(String(form.get("signers") ?? "[]"));
    if (Array.isArray(raw)) signers = raw.map((s) => String(s).slice(0, 200)).filter(Boolean).slice(0, 20);
  } catch {
    return NextResponse.json({ error: "signers must be a JSON array." }, { status: 400 });
  }
  if (signers.length === 0) return NextResponse.json({ error: "List who signed (signers)." }, { status: 400 });
  const signedAt = String(form.get("signed_at") ?? "");
  if (!signedAt || Number.isNaN(Date.parse(signedAt))) return NextResponse.json({ error: "signed_at must be a valid date." }, { status: 400 });

  const sha = sha256Hex(bytes);
  const path = `contracts/${ctx.params.id}/manual_${Date.now()}.pdf`;
  const { error: upErr } = await (sb as any).storage.from(EVIDENCE_BUCKET).upload(path, bytes, { contentType: "application/pdf", upsert: false });
  if (upErr) return NextResponse.json({ error: `Could not store the document: ${upErr.message}` }, { status: 500 });
  const url = (sb as any).storage.from(EVIDENCE_BUCKET).getPublicUrl(path)?.data?.publicUrl ?? null;

  const r = await recordEvidence(sb, auth.user.tenant_id, ctx.params.id, {
    evidence_type: "manual_signature_claim",
    source: "manual",
    document_sha256: sha,
    document_path: path,
    document_url: url,
    actor_user_id: auth.user.id,
    actor_email: auth.user.email,
    occurred_at: new Date(signedAt).toISOString(),
    detail: { signers, note: String(form.get("note") ?? "").slice(0, 500) || null, file_name: file.name.slice(0, 200), size: file.size },
  });
  if (!r.ok) {
    await (sb as any).storage.from(EVIDENCE_BUCKET).remove([path]);
    return NextResponse.json({ error: r.error ?? "Could not record the claim", migration_needed: r.skipped === "migration_missing" || undefined }, { status: r.skipped === "migration_missing" ? 503 : 500 });
  }

  await recordAudit({ entity_type: "contract", entity_id: ctx.params.id, action: "contract.manual_signature_claimed", actor_email: auth.user.email, tenant_id: auth.user.tenant_id, metadata: { document_sha256: sha, signers, actor_user_id: auth.user.id } });
  return NextResponse.json({ evidence_id: r.id, document_sha256: sha, note: "Recorded as a claim. A different person must verify the signed document before it counts as proof." }, { status: 201 });
}
