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
  const { data, error } = await sb
    .from("campaigns")
    .update({
      is_preapproved: preapproved,
      preapproved_by: preapproved ? user.id : null,
      preapproved_at: preapproved ? new Date().toISOString() : null,
    })
    .eq("id", ctx.params.id)
    .select("id, is_preapproved, preapproved_at")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data });
}
