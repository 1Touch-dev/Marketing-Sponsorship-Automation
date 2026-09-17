import { NextResponse } from "next/server";
import { syncContractSignatureStatus, findContractByEnvelopeId } from "@/lib/documenso/sync-status";

export const runtime = "nodejs";

/**
 * POST /api/documenso/webhook
 * Task 11 — Documenso webhook receiver.
 *
 * IMPORTANT — signature verification not yet wired up: Documenso shows
 * the exact webhook-secret header/scheme in its dashboard at the moment
 * you create a webhook (Settings > Webhooks), and that couldn't be
 * confirmed from documentation alone before a real account existed. This
 * is deliberately safe in the meantime: the payload's own claimed status
 * is never trusted or written directly — every call re-fetches the real
 * status from Documenso's authenticated API (same as the admin's manual
 * "Refresh Status" button, see lib/documenso/sync-status.ts). Worst case
 * from an unverified caller is a wasted API call, not a spoofed contract
 * status. Once a real webhook secret is visible in the Documenso
 * dashboard, add verification here before relying on this for anything
 * more sensitive.
 */
export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ ok: true });

  // Try a few plausible shapes for where the envelope/document ID lives —
  // exact Documenso webhook payload shape unconfirmed without a live
  // account; adjust once a real payload has been observed.
  const envelopeId: string | undefined =
    body?.data?.id ?? body?.payload?.id ?? body?.document?.id ?? body?.envelopeId ?? body?.id;

  if (!envelopeId || typeof envelopeId !== "string") {
    return NextResponse.json({ ok: true, note: "No envelope id found in payload, ignored" });
  }

  const contract = await findContractByEnvelopeId(envelopeId);
  if (!contract) {
    return NextResponse.json({ ok: true, note: "No matching contract for this envelope" });
  }

  try {
    await syncContractSignatureStatus(contract.id);
  } catch {
    // Non-fatal — the admin's manual "Refresh Status" button remains
    // available regardless of webhook delivery success.
  }

  return NextResponse.json({ ok: true });
}
