import { NextResponse } from "next/server";
import { z } from "zod";
import { supabaseAdmin } from "@/lib/supabase/server";
import { requirePermission } from "@/lib/auth/server-permission";
import { recordAudit } from "@/lib/audit/log";
import { loadProof, recordEvidence } from "@/lib/contracts/evidence-store";
import { canVerifyClaim } from "@/lib/contracts/proof";

export const runtime = "nodejs";

const bodySchema = z.object({
  claim_id: z.string().uuid(),
  decision: z.enum(["verify", "reject"]),
  note: z.string().max(500).optional(),
});

/**
 * A second person confirms (or rejects) a manually recorded signature claim.
 * The person who recorded the claim cannot be the one who verifies it.
 */
export async function POST(req: Request, ctx: { params: { id: string } }) {
  const auth = await requirePermission("approve_proposal");
  if ("error" in auth) return auth.error;

  const parsed = bodySchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "Invalid payload", issues: parsed.error.issues }, { status: 400 });
  const { claim_id, decision, note } = parsed.data;

  const sb = supabaseAdmin();
  const { data: claim } = await sb
    .from("contract_evidence")
    .select("id, evidence_type, actor_user_id, actor_email, document_sha256, document_path")
    .eq("id", claim_id)
    .eq("contract_id", ctx.params.id)
    .eq("tenant_id", auth.user.tenant_id)
    .maybeSingle();
  if (!claim || (claim as { evidence_type: string }).evidence_type !== "manual_signature_claim") {
    return NextResponse.json({ error: "Signature claim not found on this contract." }, { status: 404 });
  }
  const c = claim as { id: string; actor_user_id: string | null; actor_email: string | null; document_sha256: string | null; document_path: string | null };

  if (!canVerifyClaim(c, auth.user.id)) {
    return NextResponse.json({ error: "A different person must verify this claim. The person who recorded it cannot verify or reject it.", code: "same_person" }, { status: 403 });
  }

  // Verifying means the stored document still matches the hash recorded with the claim.
  if (decision === "verify") {
    const loaded = await loadProof(sb, auth.user.tenant_id, ctx.params.id);
    const doc = loaded?.documents.find((d) => d.evidence_id === claim_id);
    if (!c.document_sha256 || !doc || doc.intact !== true) {
      return NextResponse.json({ error: "The stored signed document could not be re-checked against its hash, so it cannot be verified.", code: "document_unverifiable", document: doc ?? null }, { status: 409 });
    }
  }

  const r = await recordEvidence(sb, auth.user.tenant_id, ctx.params.id, {
    evidence_type: decision === "verify" ? "manual_verification" : "manual_rejection",
    source: "manual",
    references_evidence_id: claim_id,
    document_sha256: c.document_sha256,
    actor_user_id: auth.user.id,
    actor_email: auth.user.email,
    detail: { note: note ?? null, claim_recorded_by: c.actor_email },
  });
  if (!r.ok) return NextResponse.json({ error: r.error ?? "Could not record", migration_needed: r.skipped === "migration_missing" || undefined }, { status: r.skipped === "migration_missing" ? 503 : 500 });

  await recordAudit({ entity_type: "contract", entity_id: ctx.params.id, action: decision === "verify" ? "contract.manual_signature_verified" : "contract.manual_signature_rejected", actor_email: auth.user.email, tenant_id: auth.user.tenant_id, metadata: { claim_id, actor_user_id: auth.user.id } });
  const after = await loadProof(sb, auth.user.tenant_id, ctx.params.id);
  return NextResponse.json({ recorded: decision, proof: after?.proof });
}
