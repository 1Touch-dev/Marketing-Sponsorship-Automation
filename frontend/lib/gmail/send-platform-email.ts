import { supabaseAdmin } from "@/lib/supabase/server";
import { gmailClientFromTokens, createGmailDraft, sendGmailDraft } from "@/lib/gmail/client";
import { decryptSecret } from "@/lib/security/secret-crypto";
import { serverEnv } from "@/lib/env";

/**
 * Sends a real email via the platform's connected Gmail account (same
 * token lookup this codebase already used once, inline, in
 * app/api/emails/[id]/send/route.ts's sendTestCopy — extracted here since
 * the sponsor-portal magic link (Task 12) is a second, genuinely separate
 * caller). Best-effort: callers should treat a thrown error as
 * non-fatal where a fallback (e.g. logging the link) exists.
 */
export async function sendPlatformEmail(args: {
  tenantId: string;
  to: string;
  subject: string;
  bodyText: string;
  bodyHtml?: string;
}): Promise<void> {
  const sb = supabaseAdmin();
  const env = serverEnv();
  const senderEmail = env.DEFAULT_FROM_EMAIL;
  if (!senderEmail) throw new Error("DEFAULT_FROM_EMAIL not configured");

  const { data: user } = await sb
    .from("users")
    .select("metadata")
    .eq("email", senderEmail)
    .eq("tenant_id", args.tenantId)
    .maybeSingle();
  const tokens = (user?.metadata as Record<string, unknown> | undefined)?.gmail_tokens as
    | { access_token?: string; refresh_token?: string; expiry_date?: number }
    | undefined;
  if (!tokens?.refresh_token) throw new Error("Gmail not connected");

  const gmail = gmailClientFromTokens({
    access_token: tokens.access_token ? decryptSecret(tokens.access_token) : undefined,
    refresh_token: tokens.refresh_token ? decryptSecret(tokens.refresh_token) : undefined,
    expiry_date: tokens.expiry_date,
  });

  const draft = await createGmailDraft(gmail, {
    from: senderEmail,
    to: args.to,
    subject: args.subject,
    bodyText: args.bodyText,
    bodyHtml: args.bodyHtml,
  });
  if (!draft.id) throw new Error("Gmail did not return a draft id");
  await sendGmailDraft(gmail, draft.id);
}
