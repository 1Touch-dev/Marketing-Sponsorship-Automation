/**
 * POST /api/campaigns/[id]/preapprove
 * Marks a campaign as pre-approved for outreach-agent auto-run mode — once
 * set, the batch agent runner (POST /api/agents/outreach/batch) can target
 * this campaign's companies without pausing for per-proposal human approval.
 *
 * Body: { preapproved: boolean }
 */
import { NextResponse } from "next/server";
import { supabaseAdmin, supabaseServer } from "@/lib/supabase/server";
import { requirePermission } from "@/lib/auth/server-permission";

export const runtime = "nodejs";

/**
 * This flag lets the batch agent runner skip per-proposal human approval
 * entirely (see app/api/agents/outreach/batch/route.ts) — real safety-gate
 * bypass, so it needs the same permission tier as approving anything else,
 * not just "logged in". Found in the RBAC follow-up audit, 2026-09-09.
 */
export async function POST(req: Request, ctx: { params: { id: string } }) {
  const auth = await requirePermission("approve_proposal");
  if ("error" in auth) return auth.error;
  const { data: { user } } = await supabaseServer().auth.getUser().catch(() => ({ data: { user: null } }));
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const preapproved = body?.preapproved !== false;

  const sb = supabaseAdmin();

  // Guard found live 2026-09-23 (James, screenshot): a campaign with no real
  // content — no inventory, just the wizard's auto-generated placeholder
  // concept — could still be marked pre-approved and fed straight into
  // unattended batch outreach with nothing real behind it. Only checked when
  // turning pre-approval ON; revoking it is always allowed.
  if (preapproved) {
    const { data: campaign, error: campaignErr } = await sb
      .from("campaigns")
      .select("summary")
      .eq("id", ctx.params.id)
      .eq("tenant_id", auth.user.tenant_id)
      .maybeSingle();
    if (campaignErr || !campaign) {
      return NextResponse.json({ error: campaignErr?.message ?? "Campaign not found" }, { status: 404 });
    }

    const summary = (campaign.summary as string | null)?.trim() ?? "";
    const isPlaceholderConcept = !summary || /^Wizard-generated campaign for /.test(summary);
    if (isPlaceholderConcept) {
      return NextResponse.json(
        { error: "This campaign has no real concept written yet — fill in a real campaign concept before marking it pre-approved." },
        { status: 400 },
      );
    }

    const { count: includedCount, error: inventoryErr } = await sb
      .from("campaign_inventory_items" as "companies")
      .select("id", { count: "exact", head: true })
      .eq("campaign_id" as "id", ctx.params.id)
      .eq("tenant_id" as "id", auth.user.tenant_id)
      .eq("included" as "id", true as unknown as string);
    if (inventoryErr) return NextResponse.json({ error: inventoryErr.message }, { status: 500 });
    if (!includedCount) {
      return NextResponse.json(
        { error: "This campaign has no inventory items included yet — add at least one to the package before marking it pre-approved." },
        { status: 400 },
      );
    }
  }

  const { data, error } = await sb
    .from("campaigns")
    .update({
      is_preapproved: preapproved,
      preapproved_by: preapproved ? user.id : null,
      preapproved_at: preapproved ? new Date().toISOString() : null,
    })
    .eq("id", ctx.params.id)
    .eq("tenant_id", auth.user.tenant_id)
    .select("id, is_preapproved, preapproved_at")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data });
}
