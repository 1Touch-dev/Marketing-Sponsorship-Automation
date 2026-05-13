import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { recordAudit } from "@/lib/audit/log";
import { gmailClientFromTokens, createGmailDraft, sendGmailDraft } from "@/lib/gmail/client";
import { serverEnv } from "@/lib/env";

export const runtime = "nodejs";
export const maxDuration = 30;

/**
 * POST /api/emails/:id/send
 * Body: { mode?: "draft" | "send" }
 *  - "draft" (default): create a Gmail draft, persist gmail_*_id, mark as approved.
 *  - "send": create draft then immediately send it.
 *
 * Requires Gmail OAuth tokens for the operator stored in
 * public.users.metadata (selected by sender email = DEFAULT_FROM_EMAIL).
 */
export async function POST(req: Request, ctx: { params: { id: string } }) {
  const env = serverEnv();
  const body = (await req.json().catch(() => ({}))) as { mode?: "draft" | "send" };
  const mode = body.mode === "send" ? "send" : "draft";

  const sb = supabaseAdmin();
  const { data: email, error: getErr } = await sb.from("emails").select("*").eq("id", ctx.params.id).single();
  if (getErr || !email) return NextResponse.json({ error: "Email not found" }, { status: 404 });

  if (email.status === "sent") {
    return NextResponse.json({ error: "Email already sent" }, { status: 409 });
  }

  // Load operator tokens from users table
  const senderEmail = email.sender || env.DEFAULT_FROM_EMAIL;
  if (!senderEmail) {
    return NextResponse.json({ error: "No sender email configured" }, { status: 400 });
  }
  const { data: user } = await sb.from("users").select("*").eq("email", senderEmail).maybeSingle();
  const tokens = (user?.metadata as Record<string, unknown> | undefined)?.gmail_tokens as
    | { access_token?: string; refresh_token?: string; expiry_date?: number }
    | undefined;
  if (!tokens?.refresh_token) {
    return NextResponse.json(
      { error: `Gmail not connected for ${senderEmail}. Visit /api/auth/gmail to connect.` },
      { status: 412 },
    );
  }

  const gmail = gmailClientFromTokens(tokens);

  let draft;
  try {
    draft = await createGmailDraft(gmail, {
      from: senderEmail,
      to: email.recipient,
      subject: email.subject,
      bodyText: email.body_text ?? "",
      bodyHtml: email.body_html ?? undefined,
      cc: email.cc ?? undefined,
      bcc: email.bcc ?? undefined,
    });
  } catch (err) {
    return NextResponse.json(
      { error: `Gmail draft failed: ${err instanceof Error ? err.message : "unknown"}` },
      { status: 502 },
    );
  }

  const updates: Record<string, unknown> = {
    status: mode === "send" ? "sent" : "approved",
    approved_at: new Date().toISOString(),
    gmail_message_id: draft.message?.id ?? null,
    gmail_thread_id: draft.message?.threadId ?? null,
  };

  if (mode === "send" && draft.id) {
    try {
      const sent = await sendGmailDraft(gmail, draft.id);
      updates.gmail_message_id = sent.id ?? updates.gmail_message_id;
      updates.gmail_thread_id = sent.threadId ?? updates.gmail_thread_id;
      updates.sent_at = new Date().toISOString();
    } catch (err) {
      return NextResponse.json(
        { error: `Gmail send failed: ${err instanceof Error ? err.message : "unknown"}` },
        { status: 502 },
      );
    }
  }

  // Upsert thread row
  if (updates.gmail_thread_id) {
    const threadId = updates.gmail_thread_id as string;
    const { data: thread } = await sb
      .from("email_threads")
      .upsert(
        {
          gmail_thread_id: threadId,
          proposal_id: email.proposal_id,
          subject: email.subject,
          participants: [email.recipient, senderEmail],
          last_message_at: new Date().toISOString(),
        },
        { onConflict: "gmail_thread_id" },
      )
      .select("*")
      .single();
    if (thread) updates.thread_id = thread.id;
  }

  const { data: updated, error: updErr } = await sb
    .from("emails")
    .update(updates)
    .eq("id", email.id)
    .select("*")
    .single();
  if (updErr) return NextResponse.json({ error: updErr.message }, { status: 500 });

  await recordAudit({
    entity_type: "email",
    entity_id: email.id,
    action: mode === "send" ? "email.sent" : "email.draft_created",
    metadata: { recipient: email.recipient, gmail_thread_id: updates.gmail_thread_id },
  });

  return NextResponse.json({ data: updated });
}
