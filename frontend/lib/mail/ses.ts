import { SESv2Client, SendEmailCommand } from "@aws-sdk/client-sesv2";
import { fromInstanceMetadata } from "@smithy/credential-provider-imds";
import { fromFor, replyToFor, type MailKind } from "./config";

/** One message to one person. The caller says what kind it is; the From address and display name follow from that. */
export interface OutgoingMail {
  to: string;
  subject: string;
  text: string;
  html?: string;
  kind: MailKind;
  /** Display name for the From header (a person's name for outreach). Default: the club's. */
  fromName?: string | null;
  /** Where a reply goes: the person's own address when there is one. Falls back to MAIL_REPLY_TO. */
  replyTo?: string | null;
  headers?: Record<string, string>;
  /** A short label stored with the message at the provider ("newsletter", "portal-link"). */
  tag?: string;
}
export interface MailSendResult { messageId: string }
export type MailSender = (mail: OutgoingMail) => Promise<MailSendResult>;

export class MailError extends Error {
  constructor(message: string, readonly code: string, readonly transient: boolean) { super(message); this.name = "MailError"; }
}

const TRANSIENT = new Set(["ThrottlingException", "TooManyRequestsException", "ServiceUnavailable", "InternalFailure", "TimeoutError", "RequestTimeout"]);

let cached: SESv2Client | null = null;
export function resetSesClientForTests() { cached = null; }

/**
 * The SES client. Credentials come from the server's IAM role, asked for EXPLICITLY: the default AWS lookup reads
 * AWS_ACCESS_KEY_ID from .env.local first, and those old keys are dead ("security token invalid"), so it would never reach the role.
 * SES_ENDPOINT points the client at a stand-in server in tests. SES_CREDENTIALS=default-chain opts back into the default lookup.
 */
function client(): SESv2Client {
  if (cached) return cached;
  const endpoint = process.env.SES_ENDPOINT?.trim() || undefined;
  const credentials = endpoint
    ? { accessKeyId: "test", secretAccessKey: "test" }
    : process.env.SES_CREDENTIALS?.trim() === "default-chain"
      ? undefined
      : fromInstanceMetadata({ maxRetries: 2, timeout: 2000 });
  cached = new SESv2Client({ region: process.env.SES_REGION?.trim() || process.env.AWS_REGION?.trim() || "us-east-1", endpoint, credentials, maxAttempts: 3 });
  return cached;
}

export const sendViaSes: MailSender = async (mail) => {
  const from = fromFor(mail.kind, mail.fromName);
  const reply = replyToFor(mail.replyTo);
  const charset = "UTF-8";
  try {
    const out = await client().send(
      new SendEmailCommand({
        FromEmailAddress: from.header,
        Destination: { ToAddresses: [mail.to] },
        ReplyToAddresses: reply ? [reply] : undefined,
        Content: {
          Simple: {
            Subject: { Data: mail.subject, Charset: charset },
            Body: { Text: { Data: mail.text, Charset: charset }, ...(mail.html ? { Html: { Data: mail.html, Charset: charset } } : {}) },
            Headers: mail.headers ? Object.entries(mail.headers).map(([Name, Value]) => ({ Name, Value })) : undefined,
          },
        },
        EmailTags: mail.tag ? [{ Name: "kind", Value: mail.tag.replace(/[^A-Za-z0-9_-]/g, "_").slice(0, 255) }] : undefined,
      }),
    );
    if (!out.MessageId) throw new MailError("Amazon SES did not return a message id", "NoMessageId", false);
    return { messageId: out.MessageId };
  } catch (err) {
    if (err instanceof MailError) throw err;
    const e = err as { name?: string; message?: string; $metadata?: { httpStatusCode?: number } };
    const status = e.$metadata?.httpStatusCode ?? 0;
    const code = e.name ?? "SesError";
    throw new MailError(`${code}: ${(e.message ?? "send failed").slice(0, 300)}`, code, TRANSIENT.has(code) || status >= 500 || status === 429);
  }
};
