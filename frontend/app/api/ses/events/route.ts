import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { applyFeedback, parseSesEvent } from "@/lib/mail/feedback";
import { confirmSnsSubscription, verifySnsMessage, type SnsMessage } from "@/lib/mail/sns";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/ses/events — Amazon SNS delivers what Amazon SES reports here: bounces, complaints, deliveries.
 *
 * There is no login on this route (Amazon cannot have one), so the ONLY way in is a message whose signature verifies against
 * a certificate on Amazon SNS and whose topic is ours (verifySnsMessage). Everything else is refused before any data is read.
 */
export async function POST(req: Request) {
  const raw = await req.text();
  if (raw.length > 262_144) return NextResponse.json({ error: "Too large" }, { status: 413 });
  let msg: SnsMessage;
  try { msg = JSON.parse(raw); } catch { return NextResponse.json({ error: "Not JSON" }, { status: 400 }); }

  if (!(await verifySnsMessage(msg))) return NextResponse.json({ error: "Signature not valid" }, { status: 403 });

  if (msg.Type === "SubscriptionConfirmation") {
    const ok = await confirmSnsSubscription(msg).catch(() => false);
    return NextResponse.json({ ok, confirmed: ok }, { status: ok ? 200 : 502 });
  }
  if (msg.Type === "UnsubscribeConfirmation") return NextResponse.json({ ok: true });
  if (msg.Type !== "Notification") return NextResponse.json({ error: "Unknown message type" }, { status: 400 });

  const ev = parseSesEvent(msg.Message);
  if (!ev) return NextResponse.json({ error: "Not an SES event" }, { status: 400 });
  try {
    const r = await applyFeedback(supabaseAdmin(), msg.MessageId, ev, safePayload(msg.Message));
    return NextResponse.json({ ok: true, ...r });
  } catch (err) {
    // A 5xx makes SNS try again later, which is what we want for a database hiccup.
    console.error("[ses-events]", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "Could not record the event" }, { status: 500 });
  }
}

/** Keep the provider's event for the record, without the full message headers and body text. */
function safePayload(message: string): unknown {
  try {
    const j = JSON.parse(message);
    if (j?.mail) { const { headers: _h, commonHeaders: _c, ...mail } = j.mail; return { ...j, mail }; }
    return j;
  } catch { return {}; }
}
