import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { requirePermission } from "@/lib/auth/server-permission";
import { recordAudit } from "@/lib/audit/log";
import { renderUrlToPdf } from "@/lib/proposals/pdf-export";
import { randomBytes } from "crypto";

export const runtime = "nodejs";
export const maxDuration = 30;

/**
 * GET /api/proposals/[id]/export-pdf
 * Branded, server-generated PDF of the public proposal share page (Task 7)
 * — distinct from the client-side window.print() on the share page itself,
 * this renders headlessly on the server and streams a real PDF file back,
 * so it works as an email attachment / offline recap, not just an
 * interactive print dialog.
 */
export async function GET(req: Request, ctx: { params: { id: string } }) {
  const auth = await requirePermission("edit_proposal");
  if ("error" in auth) return auth.error;

  const sb = supabaseAdmin();
  const { data: proposal } = await sb
    .from("proposals")
    .select("id, title, share_token")
    .eq("id", ctx.params.id)
    .eq("tenant_id", auth.user.tenant_id)
    .maybeSingle();

  if (!proposal) return NextResponse.json({ error: "Proposal not found" }, { status: 404 });

  let shareToken = (proposal as { share_token?: string | null }).share_token;
  if (!shareToken) {
    shareToken = randomBytes(24).toString("base64url");
    await sb.from("proposals").update({ share_token: shareToken } as Record<string, unknown>).eq("id", proposal.id);
  }

  // Render against localhost — this runs headlessly on the same box, so
  // there's no reason to route through the public ngrok URL just to loop
  // back to the same server.
  const internalUrl = `http://localhost:${process.env.PORT || 3000}/proposals/view/${shareToken}`;

  try {
    const pdf = await renderUrlToPdf(internalUrl);

    await recordAudit({
      entity_type: "proposal",
      entity_id: proposal.id,
      action: "proposal.pdf_exported",
    });

    const filename = `${proposal.title.replace(/[^a-z0-9]+/gi, "-").slice(0, 80)}.pdf`;
    return new NextResponse(pdf as unknown as BodyInit, {
      headers: {
        "content-type": "application/pdf",
        "content-disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: `PDF generation failed: ${message}` }, { status: 500 });
  }
}
