import { google, gmail_v1 } from "googleapis";
import { serverEnv } from "@/lib/env";

/**
 * Gmail OAuth helper.
 *
 * Token persistence model for the MVP:
 *   - The operator authenticates once via /api/auth/gmail.
 *   - Tokens are stored as a single row in public.users with
 *     metadata.gmail_tokens (refresh_token + access_token + expiry).
 *   - For the MVP we treat the DEFAULT_FROM_EMAIL user as the sender;
 *     a multi-mailbox model is Phase 2.
 */
/**
 * Hardening pass (master_report.md Section 8, Pattern 6 — minimum-scope
 * grants). Audited every gmail_v1 call this codebase actually makes:
 * users.drafts.create/send (lib/gmail/client.ts) and users.threads.get
 * (sync-threads route) — nothing calls messages.send directly, and nothing
 * touches labels/trash/modify. gmail.compose already covers creating AND
 * sending drafts (and direct message sending), making gmail.send fully
 * redundant here; gmail.modify was unused entirely. Dropped both.
 */
const SCOPES = [
  "https://www.googleapis.com/auth/gmail.compose",
  "https://www.googleapis.com/auth/gmail.readonly",
];

export function oauthClient() {
  const env = serverEnv();
  return new google.auth.OAuth2(
    env.GOOGLE_CLIENT_ID,
    env.GOOGLE_CLIENT_SECRET,
    env.GOOGLE_REDIRECT_URI,
  );
}

export function gmailAuthUrl(state: string) {
  const client = oauthClient();
  return client.generateAuthUrl({
    access_type: "offline",
    // "select_account consent" forces Google to show the account picker AND
    // re-request consent, ensuring a refresh_token is always returned and the
    // operator can choose which Gmail account to connect.
    prompt: "select_account consent",
    scope: SCOPES,
    include_granted_scopes: true,
    state,
  });
}

export async function exchangeCodeForTokens(code: string) {
  const client = oauthClient();
  const { tokens } = await client.getToken(code);
  return tokens;
}

export function gmailClientFromTokens(tokens: {
  access_token?: string | null;
  refresh_token?: string | null;
  expiry_date?: number | null;
}): gmail_v1.Gmail {
  const auth = oauthClient();
  auth.setCredentials(tokens);
  return google.gmail({ version: "v1", auth });
}

function encodeRfc822(args: {
  from: string;
  to: string;
  subject: string;
  bodyText: string;
  bodyHtml?: string;
  cc?: string[];
  bcc?: string[];
}) {
  const boundary = "msa_boundary_" + Math.random().toString(36).slice(2);
  const headers = [
    `From: ${args.from}`,
    `To: ${args.to}`,
    args.cc?.length ? `Cc: ${args.cc.join(", ")}` : null,
    args.bcc?.length ? `Bcc: ${args.bcc.join(", ")}` : null,
    `Subject: ${args.subject}`,
    "MIME-Version: 1.0",
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    "",
  ]
    .filter(Boolean)
    .join("\r\n");

  const html = args.bodyHtml ?? `<pre>${args.bodyText.replace(/</g, "&lt;")}</pre>`;
  const body = [
    `--${boundary}`,
    "Content-Type: text/plain; charset=UTF-8",
    "",
    args.bodyText,
    `--${boundary}`,
    "Content-Type: text/html; charset=UTF-8",
    "",
    html,
    `--${boundary}--`,
  ].join("\r\n");

  const rfc822 = `${headers}\r\n${body}`;
  return Buffer.from(rfc822)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

export async function createGmailDraft(
  gmail: gmail_v1.Gmail,
  args: {
    from: string;
    to: string;
    subject: string;
    bodyText: string;
    bodyHtml?: string;
    cc?: string[];
    bcc?: string[];
    threadId?: string;
  },
) {
  const raw = encodeRfc822(args);
  const res = await gmail.users.drafts.create({
    userId: "me",
    requestBody: { message: { raw, threadId: args.threadId } },
  });
  return res.data;
}

export async function sendGmailDraft(gmail: gmail_v1.Gmail, draftId: string) {
  const res = await gmail.users.drafts.send({
    userId: "me",
    requestBody: { id: draftId },
  });
  return res.data;
}

export async function listThreadMessages(
  gmail: gmail_v1.Gmail,
  threadId: string,
) {
  const res = await gmail.users.threads.get({
    userId: "me",
    id: threadId,
    format: "metadata",
    metadataHeaders: ["From", "Date", "Subject"],
  });
  return res.data;
}
