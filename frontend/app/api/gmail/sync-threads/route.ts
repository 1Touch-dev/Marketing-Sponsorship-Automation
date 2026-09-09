import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { gmailClientFromTokens, listThreadMessages, extractMessageBody } from "@/lib/gmail/client";
import { serverEnv } from "@/lib/env";
import { recordAudit } from "@/lib/audit/log";
import { decryptSecret } from "@/lib/security/secret-crypto";
import { classifyReply } from "@/lib/emails/reply-classifier";
import { requirePermission } from "@/lib/auth/server-permission";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * POST /api/gmail/sync-threads
 * Optional body: { gmail_thread_id?: string } — sync one thread; otherwise sync all sent emails with a thread id.
 *
 * Polls Gmail and updates `email_threads.last_message_at` and outbound `emails` status to `replied`
 * when an inbound message exists after our last outbound send.
 *
 * Intended for n8n Schedule triggers or manual operator runs.
 */
export async function POST(req: Request) {
  const auth = await requirePermission("manage_integrations");
  if ("error" in auth) return auth.error;

  const env = serverEnv();
  const body = (await req.json().catch(() => ({}))) as { gmail_thread_id?: string };

  const senderEmail = env.DEFAULT_FROM_EMAIL;
  if (!senderEmail) {
    return NextResponse.json({ error: "DEFAULT_FROM_EMAIL not configured" }, { status: 400 });
  }

  const sb = supabaseAdmin();
  const { data: user } = await sb.from("users").select("*").eq("email", senderEmail).maybeSingle();
  const tokens = (user?.metadata as Record<string, unknown> | undefined)?.gmail_tokens as
    | { access_token?: string; refresh_token?: string; expiry_date?: number }
    | undefined;
  if (!tokens?.refresh_token) {
    return NextResponse.json(
      { error: "Gmail not connected. Visit /api/auth/gmail first." },
      { status: 412 },
    );
  }

  // Tokens are stored encrypted at rest (Pattern 6 hardening) —
  // decryptSecret() passes through legacy plaintext values unchanged, so
  // this works for tokens stored before or after that change.
  const gmail = gmailClientFromTokens({
    access_token: tokens.access_token ? decryptSecret(tokens.access_token) : undefined,
    refresh_token: tokens.refresh_token ? decryptSecret(tokens.refresh_token) : undefined,
    expiry_date: tokens.expiry_date,
  });

  let query = sb
    .from("emails")
    .select("id, gmail_thread_id, recipient, sent_at, status, created_at, proposal_id")
    .eq("direction", "outbound")
    .not("gmail_thread_id", "is", null)
    .in("status", ["sent", "opened", "replied"]);

  if (body.gmail_thread_id) {
    query = query.eq("gmail_thread_id", body.gmail_thread_id);
  }

  const { data: rows, error: listErr } = await query;
  if (listErr) return NextResponse.json({ error: listErr.message }, { status: 500 });

  const synced: string[] = [];
  const errors: { thread: string; message: string }[] = [];
  const classified: { email_id: string; classification: string }[] = [];

  for (const row of rows ?? []) {
    const tid = row.gmail_thread_id;
    if (!tid) continue;
    try {
      const thread = await listThreadMessages(gmail, tid);
      const messages = thread.messages ?? [];
      const sentMs = new Date(row.sent_at ?? row.created_at ?? 0).getTime();

      const inboundMessages = messages.filter((m) => {
        const headers = m.payload?.headers ?? [];
        const from = headers.find((h) => h.name?.toLowerCase() === "from")?.value ?? "";
        const fromUs = from.toLowerCase().includes(senderEmail.toLowerCase());
        const msgMs = m.internalDate ? parseInt(m.internalDate, 10) : 0;
        return !fromUs && msgMs >= sentMs - 60_000;
      });
      const hasInboundAfter = inboundMessages.length > 0;

      const { data: threadRow } = await sb
        .from("email_threads")
        .update({
          last_message_at: new Date().toISOString(),
          status: hasInboundAfter ? "replied" : "open",
        })
        .eq("gmail_thread_id", tid)
        .select("id")
        .maybeSingle();

      if (hasInboundAfter && row.status !== "replied") {
        await sb.from("emails").update({ status: "replied", replied_at: new Date().toISOString() }).eq("id", row.id);
        await recordAudit({
          entity_type: "email",
          entity_id: row.id,
          action: "email.reply_detected",
          metadata: { gmail_thread_id: tid },
        });
      }

      // Store + classify each inbound message (Phase 2 — reply
      // classification). Upsert on gmail_message_id with ignoreDuplicates
      // so an already-processed message is neither re-inserted nor
      // re-classified (re-classifying on every periodic sync would waste
      // real Bedrock spend for no new information).
      for (const m of inboundMessages) {
        if (!m.id) continue;
        const headers = m.payload?.headers ?? [];
        const from = headers.find((h) => h.name?.toLowerCase() === "from")?.value ?? "unknown";
        const subjectHeader = headers.find((h) => h.name?.toLowerCase() === "subject")?.value ?? row.recipient;
        const { text: bodyText, html: bodyHtml } = extractMessageBody(m.payload ?? undefined);
        const msgMs = m.internalDate ? parseInt(m.internalDate, 10) : Date.now();

        const { data: inserted } = await sb
          .from("emails")
          .upsert(
            {
              gmail_message_id: m.id,
              gmail_thread_id: tid,
              thread_id: threadRow?.id ?? null,
              proposal_id: row.proposal_id,
              direction: "inbound",
              sender: from,
              recipient: senderEmail,
              subject: subjectHeader,
              body_text: bodyText,
              body_html: bodyHtml,
              status: "received",
              created_at: new Date(msgMs).toISOString(),
            },
            { onConflict: "gmail_message_id", ignoreDuplicates: true },
          )
          .select("id")
          .maybeSingle();

        if (inserted?.id && bodyText) {
          const result = await classifyReply({ subject: subjectHeader, bodyText });
          await sb
            .from("emails")
            .update({
              reply_classification: result.classification,
              reply_classification_confidence: result.confidence,
              reply_summary: result.summary,
              reply_classified_at: new Date().toISOString(),
            })
            .eq("id", inserted.id);
          classified.push({ email_id: inserted.id, classification: result.classification });
        }
      }

      synced.push(tid);
    } catch (e) {
      errors.push({ thread: tid, message: e instanceof Error ? e.message : "unknown" });
    }
  }

  return NextResponse.json({
    checked: rows?.length ?? 0,
    synced_thread_ids: synced,
    classified,
    errors,
  });
}
