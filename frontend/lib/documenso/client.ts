import { Documenso } from "@documenso/sdk-typescript";

/**
 * E-signature via Documenso's hosted API (Task 11). Chosen over
 * self-hosting after research 2026-09-17 — API access requires the Teams
 * tier ($40/mo) or above, official TypeScript SDK, standard advanced
 * e-signature (not ICP-Brasil qualified, which appears to be a
 * self-host-only capability and isn't required for private-consent
 * commercial contracts under Brazilian law).
 *
 * Silently unusable (clear thrown error, not a crash) until
 * DOCUMENSO_API_KEY is configured — same pattern as Slack/Langfuse
 * elsewhere in this codebase.
 */
function getClient(): Documenso {
  const apiKey = process.env.DOCUMENSO_API_KEY;
  if (!apiKey) {
    throw new Error("DOCUMENSO_API_KEY not configured — sign up at app.documenso.com (Teams tier or above for API access) and add the key to .env.local.");
  }
  return new Documenso({ apiKey });
}

export interface SendForSignatureArgs {
  title: string;
  pdfFileName: string;
  pdfBuffer: Buffer;
  signerEmail: string;
  signerName: string;
  message?: string;
}

export interface SendForSignatureResult {
  envelopeId: string;
  signingUrl: string;
}

/**
 * Creates a single-file, single-signer envelope and immediately sends it
 * (distribute) — no draft step, matching the "Send for Signature" button's
 * one-click UX. The signature field is placed at a fixed bottom-right spot
 * on the last page (positions are percentage-of-page per Documenso's API,
 * not pixels) — a reasonable default since this app doesn't have a visual
 * field-placement UI; the signer can still review the whole document
 * before signing regardless of exact field placement.
 */
export async function sendForSignature(args: SendForSignatureArgs): Promise<SendForSignatureResult> {
  const documenso = getClient();

  const created = await documenso.envelopes.create({
    payload: {
      title: args.title,
      type: "DOCUMENT",
      recipients: [
        {
          email: args.signerEmail,
          name: args.signerName,
          role: "SIGNER",
          fields: [
            {
              type: "SIGNATURE",
              page: 1,
              positionX: 65,
              positionY: 88,
              width: 25,
              height: 8,
            },
          ],
        },
      ],
      meta: {
        subject: args.title,
        message: args.message ?? "Por favor, revise e assine o contrato de patrocínio em anexo.",
        distributionMethod: "EMAIL",
        language: "pt-BR",
      },
    },
    files: [{ fileName: args.pdfFileName, content: args.pdfBuffer }],
  });

  const distributed = await documenso.envelopes.distribute({ envelopeId: created.id });
  const signingUrl = distributed.recipients[0]?.signingUrl ?? "";

  return { envelopeId: created.id, signingUrl };
}

export interface EnvelopeStatus {
  status: "DRAFT" | "PENDING" | "COMPLETED" | "REJECTED" | "CANCELLED";
  completedAt: string | null;
}

export async function getEnvelopeStatus(envelopeId: string): Promise<EnvelopeStatus> {
  const documenso = getClient();
  const envelope = await documenso.envelopes.get({ envelopeId });
  return { status: envelope.status, completedAt: envelope.completedAt };
}

/** Downloads the final signed PDF (with signatures + audit trail burned in). */
export async function downloadSignedPdf(envelopeId: string): Promise<Buffer> {
  const documenso = getClient();
  const envelope = await documenso.envelopes.get({ envelopeId });
  const itemId = envelope.envelopeItems[0]?.id;
  if (!itemId) throw new Error(`Envelope ${envelopeId} has no document items`);

  const download = await documenso.envelopes.items.download({ envelopeItemId: itemId, version: "signed" });
  const result = download.result as unknown;

  if (typeof result === "string") {
    // Pre-signed URL — fetch it directly.
    const res = await fetch(result);
    if (!res.ok) throw new Error(`Failed to fetch signed document: ${res.status}`);
    return Buffer.from(await res.arrayBuffer());
  }
  if (result instanceof ArrayBuffer) return Buffer.from(result);
  if (Buffer.isBuffer(result)) return result;
  throw new Error("Unexpected response shape from envelope item download — inspect and adjust downloadSignedPdf().");
}
