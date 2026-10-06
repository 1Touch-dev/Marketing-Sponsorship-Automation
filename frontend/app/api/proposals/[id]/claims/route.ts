import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { resolveTenantId } from "@/lib/tenants/current";
import { buildProposalClaimsReport } from "@/lib/claims/proposal-report";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Before approval: which club figures this proposal's documents will show,
 * which are withheld and why, and which figures in its text no claim supports.
 */
export async function GET(_req: Request, ctx: { params: { id: string } }) {
  const tenantId = await resolveTenantId();
  const sb = supabaseAdmin();
  const { data: proposal } = await sb
    .from("proposals")
    .select("id, content, strategy_variants")
    .eq("id", ctx.params.id)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (!proposal) return NextResponse.json({ error: "Proposal not found" }, { status: 404 });
  return NextResponse.json(await buildProposalClaimsReport(sb, tenantId, proposal));
}
