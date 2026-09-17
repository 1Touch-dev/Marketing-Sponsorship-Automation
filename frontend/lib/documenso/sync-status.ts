import { supabaseAdmin } from "@/lib/supabase/server";
import { recordAudit } from "@/lib/audit/log";
import { getEnvelopeStatus, downloadSignedPdf } from "./client";

const DOCUMENSO_TO_LOCAL: Record<string, string> = {
  DRAFT: "draft",
  PENDING: "pending",
  COMPLETED: "completed",
  REJECTED: "rejected",
  CANCELLED: "cancelled",
};

/**
 * Shared by the admin-triggered "Refresh Status" route and the Documenso
 * webhook — always re-fetches the real status from Documenso's
 * authenticated API rather than trusting a webhook payload's claimed
 * status, so this is safe to call even before webhook signature
 * verification is wired up (see webhook/route.ts).
 */
export async function syncContractSignatureStatus(
  contractId: string,
): Promise<{ status: string; completedAt: string | null; signedPdfUrl: string | null }> {
  const sb = supabaseAdmin();
  const { data: contract } = await sb
    .from("contracts")
    .select("id, documenso_envelope_id, signature_status")
    .eq("id", contractId)
    .maybeSingle();

  if (!contract?.documenso_envelope_id) {
    throw new Error(`Contract ${contractId} has no linked Documenso envelope`);
  }

  const { status, completedAt } = await getEnvelopeStatus(contract.documenso_envelope_id);
  const localStatus = DOCUMENSO_TO_LOCAL[status] ?? "pending";
  const updates: Record<string, unknown> = { signature_status: localStatus };
  const justCompleted = localStatus === "completed" && contract.signature_status !== "completed";

  if (justCompleted) {
    updates.signature_completed_at = completedAt ?? new Date().toISOString();
    try {
      const signedPdf = await downloadSignedPdf(contract.documenso_envelope_id);
      const path = `contracts/${contract.id}/signed_${Date.now()}.pdf`;
      const bucket = (sb as any).storage.from("proposal-assets");
      const { error: uploadError } = await bucket.upload(path, signedPdf, { contentType: "application/pdf", upsert: true });
      if (!uploadError) {
        const { data: publicUrl } = bucket.getPublicUrl(path);
        updates.signed_pdf_url = publicUrl?.publicUrl ?? null;
      }
    } catch {
      // Non-fatal — retryable by polling/re-syncing again later.
    }

    await recordAudit({
      entity_type: "contract",
      entity_id: contract.id,
      action: "contract.signature_completed",
      metadata: { envelope_id: contract.documenso_envelope_id },
    });
  }

  await sb.from("contracts").update(updates).eq("id", contract.id);
  return {
    status: localStatus,
    completedAt: (updates.signature_completed_at as string) ?? null,
    signedPdfUrl: (updates.signed_pdf_url as string) ?? null,
  };
}

export async function findContractByEnvelopeId(envelopeId: string): Promise<{ id: string } | null> {
  const sb = supabaseAdmin();
  const { data } = await sb
    .from("contracts")
    .select("id")
    .eq("documenso_envelope_id", envelopeId)
    .maybeSingle();
  return data ?? null;
}
