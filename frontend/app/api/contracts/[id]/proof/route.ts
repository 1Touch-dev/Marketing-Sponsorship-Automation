import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { resolveTenantId } from "@/lib/tenants/current";
import { buildProofBundle, loadProof } from "@/lib/contracts/evidence-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * What this contract can actually prove: its stage derived from recorded
 * evidence (not a status someone set), the evidence timeline, whether every
 * frozen revision and stored document still matches its hash, and what is
 * missing. ?format=bundle returns everything a third party needs to re-check it.
 */
export async function GET(req: Request, ctx: { params: { id: string } }) {
  const tenantId = await resolveTenantId();
  const sb = supabaseAdmin();
  const bundle = new URL(req.url).searchParams.get("format") === "bundle";

  if (bundle) {
    const data = await buildProofBundle(sb, tenantId, ctx.params.id);
    if (!data) return NextResponse.json({ error: "Contract not found" }, { status: 404 });
    return NextResponse.json(data);
  }

  const loaded = await loadProof(sb, tenantId, ctx.params.id);
  if (!loaded) return NextResponse.json({ error: "Contract not found" }, { status: 404 });
  return NextResponse.json({
    contract: { id: loaded.contract.id, contract_number: loaded.contract.contract_number, title: loaded.contract.title, signature_status: loaded.contract.signature_status },
    proof: loaded.proof,
    bound_revision: loaded.boundRevision,
    revision_integrity: loaded.revisions,
    documents: loaded.documents,
    evidence: loaded.evidence,
  });
}
