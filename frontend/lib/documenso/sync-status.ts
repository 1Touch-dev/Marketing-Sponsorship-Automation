import { supabaseAdmin } from "@/lib/supabase/server";
import { recordAudit } from "@/lib/audit/log";
import { getEnvelopeStatus, downloadSignedPdf } from "./client";
import { applySignerEvent } from "@/lib/contracts/signers-store";
import { recordEvidenceSafe, sha256Hex } from "@/lib/contracts/evidence-store";
import { signerEventFromRecipient } from "@/lib/contracts/signature-state";
import { serviceActor } from "@/lib/identity/actor";

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
    .select("id, tenant_id, documenso_envelope_id, signature_status")
    .eq("id", contractId)
    .maybeSingle();

  if (!contract?.documenso_envelope_id) {
    throw new Error(`Contract ${contractId} has no linked Documenso envelope`);
  }

  const { status, completedAt, recipients } = await getEnvelopeStatus(contract.documenso_envelope_id);
  const localStatus = DOCUMENSO_TO_LOCAL[status] ?? "pending";

  // Record each recipient's own progress, so one person signing a contract
  // that needs several signatures is never mistaken for it being complete.
  // Never blocks the status sync itself.
  try {
    for (const recipient of recipients) {
      await applySignerEvent(sb, String((contract as { tenant_id: string }).tenant_id), contract.id, signerEventFromRecipient(recipient));
    }
  } catch (err) {
    console.error("[documenso] recording signer progress failed", err);
  }
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
        // Keep the signed document's hash with the evidence, so the stored file
        // can be re-checked later and any change to it shows.
        await recordEvidenceSafe(sb, String((contract as { tenant_id: string }).tenant_id), contract.id, {
          evidence_type: "signed_document",
          source: "provider",
          provider: "documenso",
          provider_event_id: `signed_document:${contract.documenso_envelope_id}`,
          document_sha256: sha256Hex(signedPdf),
          document_path: path,
          document_url: (updates.signed_pdf_url as string) ?? null,
        });
      }
    } catch {
      // Non-fatal — retryable by polling/re-syncing again later.
    }

    await recordEvidenceSafe(sb, String((contract as { tenant_id: string }).tenant_id), contract.id, {
      evidence_type: "envelope_completed",
      source: "provider",
      provider: "documenso",
      provider_event_id: "envelope_completed",
      occurred_at: (updates.signature_completed_at as string) ?? undefined,
    });

    await recordAudit({
      actor: serviceActor("documenso-sync"),
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
