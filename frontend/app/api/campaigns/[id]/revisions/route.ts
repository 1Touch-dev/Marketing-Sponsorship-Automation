import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { resolveTenantId } from "@/lib/tenants/current";
import { isMissingMigration } from "@/lib/proposals/revision-store";
import { campaignApproval } from "@/lib/campaigns/revision-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Frozen revisions of a campaign, newest first, and whether its pre-approval still applies to what it says and contains now. */
export async function GET(_req: Request, ctx: { params: { id: string } }) {
  const tenantId = await resolveTenantId();
  const sb = supabaseAdmin();
  const { data: campaign } = await sb.from("campaigns").select("id").eq("id", ctx.params.id).eq("tenant_id", tenantId).maybeSingle();
  if (!campaign) return NextResponse.json({ error: "Campaign not found" }, { status: 404 });

  const { data, error } = await (sb as any)
    .from("campaign_revisions")
    .select("id, revision_number, checksum, total_brl, reason, created_by, created_at, content, lines")
    .eq("campaign_id", ctx.params.id)
    .eq("tenant_id", tenantId)
    .order("revision_number", { ascending: false });
  if (error) {
    if (isMissingMigration(error)) return NextResponse.json({ revisions: [], migration_needed: true });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  const approval = await campaignApproval(sb, tenantId, ctx.params.id);
  return NextResponse.json({ revisions: data ?? [], approval });
}
