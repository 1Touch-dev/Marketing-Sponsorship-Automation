import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { createOrUpdateDeal } from "@/lib/pipedrive/sync";
import { requirePermission } from "@/lib/auth/server-permission";

export const runtime = "nodejs";

/**
 * This is a direct status-set endpoint, separate from the proper approval
 * flow in app/api/proposals/[id]/approve (which also records an `approvals`
 * row). It can set status to "approved"/"sent"/"rejected" directly, so it
 * needs the same permission tier as that flow, not just edit_proposal.
 */
export async function PATCH(req: Request, ctx: { params: { id: string } }) {
  const auth = await requirePermission("approve_proposal");
  if ("error" in auth) return auth.error;

  const body = await req.json().catch(() => ({})) as { status?: string };
  const validStatuses = ["draft", "under_review", "approved", "rejected", "sent", "revision_requested"];

  if (!body.status || !validStatuses.includes(body.status)) {
    return NextResponse.json({ error: "Invalid status" }, { status: 400 });
  }

  const sb = supabaseAdmin();
  const { data, error } = await sb
    .from("proposals")
    .update({ status: body.status, updated_at: new Date().toISOString() })
    .eq("id", ctx.params.id)
    .select("id, status, title, share_token, company_id")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Sync to Pipedrive when proposal is marked as sent
  if (body.status === "sent" && data) {
    try {
      const { data: proposal } = await sb
        .from("proposals")
        .select("title, share_token, companies(company_name)")
        .eq("id", ctx.params.id)
        .single();

      if (proposal) {
        const companyName = (Array.isArray(proposal.companies)
          ? (proposal.companies[0] as { company_name: string } | undefined)?.company_name
          : (proposal.companies as { company_name: string } | null)?.company_name) ?? "Unknown";
        const appUrl = process.env.APP_URL ?? "";
        const shareToken = proposal.share_token as string | null;
        createOrUpdateDeal({
          title: `${companyName} × Coritiba FC — ${proposal.title}`,
          orgName: companyName,
          status: "open",
          proposalId: ctx.params.id,
          proposalUrl: shareToken ? `${appUrl}/proposals/view/${shareToken}` : undefined,
        }).catch(() => {});
      }
    } catch {
      // non-fatal — Pipedrive sync failure should not block response
    }
  }

  return NextResponse.json(data);
}
