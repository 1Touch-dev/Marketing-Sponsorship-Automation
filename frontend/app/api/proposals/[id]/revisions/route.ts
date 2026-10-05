import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { resolveTenantId } from "@/lib/tenants/current";
import { checkProposalDrift, isMissingMigration } from "@/lib/proposals/revision-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Frozen revisions of a proposal's commercial terms, newest first, plus whether the live proposal has drifted from the approved one. */
export async function GET(_req: Request, ctx: { params: { id: string } }) {
  const tenantId = await resolveTenantId();
  const sb = supabaseAdmin();

  const { data, error } = await (sb as any)
    .from("proposal_revisions")
    .select("id, revision_number, checksum, total_brl, currency, reason, lines, created_at")
    .eq("proposal_id", ctx.params.id)
    .eq("tenant_id", tenantId)
    .order("revision_number", { ascending: false });
  if (error) {
    if (isMissingMigration(error)) return NextResponse.json({ revisions: [], migration_needed: true });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const check = await checkProposalDrift(sb, tenantId, ctx.params.id);
  return NextResponse.json({
    revisions: data ?? [],
    approved_revision_id: check.ok ? check.approvedRevisionId : null,
    changed_since_approval: check.ok ? check.drift.drifted : null,
  });
}
