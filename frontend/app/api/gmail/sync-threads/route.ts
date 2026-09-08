import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { gmailClientFromTokens, listThreadMessages } from "@/lib/gmail/client";
import { serverEnv } from "@/lib/env";
import { recordAudit } from "@/lib/audit/log";
import { decryptSecret } from "@/lib/security/secret-crypto";

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
    .select("id, gmail_thread_id, recipient, sent_at, status, created_at")
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

  for (const row of rows ?? []) {
    const tid = row.gmail_thread_id;
    if (!tid) continue;
    try {
      const thread = await listThreadMessages(gmail, tid);
      const messages = thread.messages ?? [];
      const sentMs = new Date(row.sent_at ?? row.created_at ?? 0).getTime();

      let hasInboundAfter = false;
      for (const m of messages) {
        const headers = m.payload?.headers ?? [];
        const from = headers.find((h) => h.name?.toLowerCase() === "from")?.value ?? "";
        const fromUs = from.toLowerCase().includes(senderEmail.toLowerCase());
        const msgMs = m.internalDate ? parseInt(m.internalDate, 10) : 0;
        if (!fromUs && msgMs >= sentMs - 60_000) {
          hasInboundAfter = true;
          break;
        }
      }

      await sb
        .from("email_threads")
        .update({
          last_message_at: new Date().toISOString(),
          status: hasInboundAfter ? "replied" : "open",
        })
        .eq("gmail_thread_id", tid);

      if (hasInboundAfter && row.status !== "replied") {
        await sb.from("emails").update({ status: "replied", replied_at: new Date().toISOString() }).eq("id", row.id);
        await recordAudit({
          entity_type: "email",
          entity_id: row.id,
          action: "email.reply_detected",
          metadata: { gmail_thread_id: tid },
        });
      }
      synced.push(tid);
    } catch (e) {
      errors.push({ thread: tid, message: e instanceof Error ? e.message : "unknown" });
    }
  }

  return NextResponse.json({
    checked: rows?.length ?? 0,
    synced_thread_ids: synced,
    errors,
  });
}
