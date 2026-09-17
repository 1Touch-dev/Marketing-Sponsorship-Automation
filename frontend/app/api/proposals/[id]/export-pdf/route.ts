import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { requirePermission } from "@/lib/auth/server-permission";
import { recordAudit } from "@/lib/audit/log";
import { renderUrlToPdf } from "@/lib/proposals/pdf-export";
import { randomBytes } from "crypto";
import { gateCookieName, signGateToken } from "@/lib/proposals/access-gate";

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
    .select("id, title, share_token, access_gate_enabled")
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
  const port = process.env.PORT || 3000;
  const internalUrl = `http://localhost:${port}/proposals/view/${shareToken}`;

  // If an NDA/passcode gate (Task 6) is enabled on this proposal, the
  // headless renderer has no way to pass it interactively — found
  // live-testing 2026-09-17: the exported "PDF" was just a 1-page capture
  // of the password prompt. The admin requesting this export is already
  // authenticated (requirePermission above), so it's correct to bypass
  // the sponsor-facing gate for this internal render, the same way a
  // logged-in admin already sees the real proposal everywhere else.
  const gateEnabled = !!(proposal as { access_gate_enabled?: boolean }).access_gate_enabled;
  const cookies = gateEnabled
    ? [{ name: gateCookieName(shareToken), value: signGateToken(shareToken), url: internalUrl }]
    : undefined;

  try {
    const pdf = await renderUrlToPdf(internalUrl, { cookies });

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
