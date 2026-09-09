import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { recordAudit } from "@/lib/audit/log";
import { resolveAppUrl } from "@/lib/url";
import { randomBytes } from "crypto";
import { requirePermission } from "@/lib/auth/server-permission";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/proposals/[id]/share
 * Generate (or return existing) shareable public link for a proposal.
 *
 * DELETE /api/proposals/[id]/share
 * Revoke the share link.
 */
export async function POST(req: Request, ctx: { params: { id: string } }) {
  const auth = await requirePermission("edit_proposal");
  if ("error" in auth) return auth.error;

  const sb = supabaseAdmin();
  const { data: proposal } = await sb
    .from("proposals")
    .select("id, title, share_token, status")
    .eq("id", ctx.params.id)
    .maybeSingle();

  if (!proposal) return NextResponse.json({ error: "Proposal not found" }, { status: 404 });

  type ProposalWithShare = typeof proposal & { share_token?: string | null };
  const p = proposal as ProposalWithShare;

  // Return existing token if already shared
  if (p.share_token) {
    const baseUrl = resolveAppUrl(req);
    return NextResponse.json({
      share_url: `${baseUrl}/proposals/view/${p.share_token}`,
      share_token: p.share_token,
      already_existed: true,
    });
  }

  // Generate a secure random token
  const token = randomBytes(24).toString("base64url");

  await sb.from("proposals").update({ share_token: token } as Record<string, unknown>).eq("id", proposal.id);

  await recordAudit({
    entity_type: "proposal",
    entity_id: proposal.id,
    action: "proposal.share_created",
    metadata: { title: proposal.title },
  });

  const baseUrl = resolveAppUrl(req);
  return NextResponse.json({
    share_url: `${baseUrl}/proposals/view/${token}`,
    share_token: token,
    already_existed: false,
  });
}

export async function DELETE(_req: Request, ctx: { params: { id: string } }) {
  const auth = await requirePermission("edit_proposal");
  if ("error" in auth) return auth.error;

  const sb = supabaseAdmin();
  const { data: proposal } = await sb
    .from("proposals")
    .select("id, title")
    .eq("id", ctx.params.id)
    .maybeSingle();

  if (!proposal) return NextResponse.json({ error: "Proposal not found" }, { status: 404 });

  await sb.from("proposals").update({ share_token: null } as Record<string, unknown>).eq("id", proposal.id);

  await recordAudit({
    entity_type: "proposal",
    entity_id: proposal.id,
    action: "proposal.share_revoked",
    metadata: { title: proposal.title },
  });

  return NextResponse.json({ success: true });
}
