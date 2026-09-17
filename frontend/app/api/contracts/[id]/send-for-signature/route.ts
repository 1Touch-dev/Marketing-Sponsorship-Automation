import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { requirePermission } from "@/lib/auth/server-permission";
import { recordAudit } from "@/lib/audit/log";
import { renderUrlToPdf } from "@/lib/proposals/pdf-export";
import { sendForSignature } from "@/lib/documenso/client";
import { gateCookieName, signGateToken } from "@/lib/proposals/access-gate";
import { randomBytes } from "crypto";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * POST /api/contracts/[id]/send-for-signature
 * Task 11 — sends the linked proposal's branded PDF (the document that
 * already contains the full commercial terms) to the sponsor's primary
 * contact for e-signature via Documenso. No dedicated "contract PDF"
 * template exists in this app yet, so the proposal PDF (Task 7) is reused
 * — same reasoning as the fulfillment-checklist deliverables list already
 * being sourced from the proposal's own content.
 */
export async function POST(req: Request, ctx: { params: { id: string } }) {
  const auth = await requirePermission("edit_proposal");
  if ("error" in auth) return auth.error;

  const sb = supabaseAdmin();
  const { data: contract } = await sb
    .from("contracts")
    .select("id, title, proposal_id, company_id, signature_status")
    .eq("id", ctx.params.id)
    .eq("tenant_id", auth.user.tenant_id)
    .maybeSingle();

  if (!contract) return NextResponse.json({ error: "Contract not found" }, { status: 404 });
  if (contract.signature_status === "pending") {
    return NextResponse.json({ error: "Already sent and awaiting signature" }, { status: 409 });
  }
  if (!contract.proposal_id) {
    return NextResponse.json({ error: "This contract has no linked proposal to generate a document from" }, { status: 400 });
  }
  if (!contract.company_id) {
    return NextResponse.json({ error: "This contract has no linked company" }, { status: 400 });
  }

  const { data: contactRows } = await sb
    .from("contacts")
    .select("full_name, email")
    .eq("company_id", contract.company_id)
    .not("email", "is", null)
    .order("created_at", { ascending: true })
    .limit(1);
  const contact = contactRows?.[0];
  if (!contact?.email) {
    return NextResponse.json(
      { error: "No contact with an email address found for this company — add one under Contacts first." },
      { status: 400 },
    );
  }

  const { data: proposal } = await sb
    .from("proposals")
    .select("id, title, share_token, access_gate_enabled")
    .eq("id", contract.proposal_id)
    .eq("tenant_id", auth.user.tenant_id)
    .maybeSingle();
  if (!proposal) return NextResponse.json({ error: "Linked proposal not found" }, { status: 404 });

  let shareToken = proposal.share_token;
  if (!shareToken) {
    shareToken = randomBytes(24).toString("base64url");
    await sb.from("proposals").update({ share_token: shareToken } as Record<string, unknown>).eq("id", proposal.id);
  }

  const port = process.env.PORT || 3000;
  const internalUrl = `http://localhost:${port}/proposals/view/${shareToken}`;
  const gateEnabled = !!(proposal as { access_gate_enabled?: boolean }).access_gate_enabled;
  const cookies = gateEnabled
    ? [{ name: gateCookieName(shareToken), value: signGateToken(shareToken), url: internalUrl }]
    : undefined;

  try {
    const pdf = await renderUrlToPdf(internalUrl, { cookies });

    const { envelopeId, signingUrl } = await sendForSignature({
      title: contract.title || proposal.title,
      pdfFileName: `${(contract.title || proposal.title).replace(/[^a-z0-9]+/gi, "-").slice(0, 80)}.pdf`,
      pdfBuffer: pdf,
      signerEmail: contact.email,
      signerName: contact.full_name || contact.email,
    });

    await sb
      .from("contracts")
      .update({
        documenso_envelope_id: envelopeId,
        signature_status: "pending",
        signature_requested_at: new Date().toISOString(),
        signing_url: signingUrl,
      } as Record<string, unknown>)
      .eq("id", contract.id);

    await recordAudit({
      entity_type: "contract",
      entity_id: contract.id,
      action: "contract.sent_for_signature",
      metadata: { envelope_id: envelopeId, signer_email: contact.email },
    });

    return NextResponse.json({ envelopeId, signingUrl, signerEmail: contact.email });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: `Failed to send for signature: ${message}` }, { status: 500 });
  }
}
