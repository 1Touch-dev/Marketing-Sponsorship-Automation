/**
 * Deliver one outreach email through Amazon SES (James option 1, phase A).
 * Reply-To is the club mailbox; From stays on the verified mail subdomain.
 */
import { clubReplyTo, mailProvider } from "./config";
import { MailError, sendViaSes, type MailSender } from "./ses";
import { makeUnsubscribeToken, unsubscribeHeaders, unsubscribeUrl } from "./unsubscribe";

export class OutreachMailNotConfiguredError extends Error {
  constructor() {
    super("Sending email is not switched on for this server yet (MAIL_PROVIDER is not ses). Nothing was sent.");
    this.name = "OutreachMailNotConfiguredError";
  }
}

export type OutreachEmailPayload = {
  to: string;
  subject: string;
  bodyText: string;
  bodyHtml?: string | null;
  /** Display name on From (sender profile). Defaults to club name. */
  fromName?: string | null;
  /** Prefer this Reply-To; otherwise MAIL_REPLY_TO / club fallback. */
  replyTo?: string | null;
  /** Required for signed unsubscribe links. */
  tenantId: string;
  /** App origin for unsubscribe URLs. */
  appUrl: string;
};

export type OutreachSendResult = { messageId: string; bareMessageId: string; rawMessageId: string };

/**
 * SES Message-IDs look like `abc@email.amazonses.com` or `<abc@region.amazonses.com>`.
 * Replies reference the same local-part; store/match the bare id before `@`.
 */
export function normalizeSesMessageId(id: string): { bare: string; raw: string } {
  const raw = id.trim().replace(/^<|>$/g, "");
  const at = raw.indexOf("@");
  const bare = (at > 0 ? raw.slice(0, at) : raw).trim();
  return { bare: bare || raw, raw };
}

/** True when we cannot know if SES accepted the message — do not revert to approved / retry. */
export function isUncertainSesFailure(err: unknown): boolean {
  if (err instanceof OutreachMailNotConfiguredError) return false;
  if (err instanceof MailError) return err.transient;
  if (!(err instanceof Error)) return true;
  const m = err.message.toLowerCase();
  return (
    m.includes("timeout") ||
    m.includes("timed out") ||
    m.includes("network") ||
    m.includes("econnreset") ||
    m.includes("econnrefused") ||
    m.includes("fetch failed") ||
    m.includes("socket")
  );
}

/**
 * Sends one outreach message via SES. Throws OutreachMailNotConfiguredError when MAIL_PROVIDER is not ses.
 * Throws MailError (or other) when the provider rejects the send.
 */
export async function sendOutreachEmail(
  mail: OutreachEmailPayload,
  deps: { send?: MailSender } = {},
): Promise<OutreachSendResult> {
  if (mailProvider() !== "ses") {
    throw new OutreachMailNotConfiguredError();
  }
  const to = mail.to.trim();
  if (!to) throw new MailError("Outreach send requires a recipient", "NoRecipient", false);

  const token = makeUnsubscribeToken(mail.tenantId, to);
  const unsub = unsubscribeUrl(mail.appUrl, token);
  const headers = unsubscribeHeaders(unsub);
  const textBase = mail.bodyText || (mail.bodyHtml ? stripHtml(mail.bodyHtml) : "");
  const text = `${textBase}\n\n--\nPara não receber mais mensagens do Coritiba FC Patrocínios: ${unsub}`;
  const html = mail.bodyHtml ? injectOutreachUnsubscribeFooter(mail.bodyHtml, unsub) : undefined;

  const send = deps.send ?? sendViaSes;
  const r = await send({
    to,
    subject: mail.subject,
    text,
    html,
    kind: "outreach",
    fromName: mail.fromName,
    replyTo: clubReplyTo(mail.replyTo),
    headers,
    tag: "outreach",
  });
  const ids = normalizeSesMessageId(r.messageId);
  return { messageId: ids.bare, bareMessageId: ids.bare, rawMessageId: ids.raw };
}

export function injectOutreachUnsubscribeFooter(html: string, unsubUrl: string): string {
  const footer = `
<div style="margin-top:24px;padding-top:12px;border-top:1px solid #e5e7eb;font-size:11px;color:#9ca3af;line-height:1.5">
  <p>Coritiba FC · Departamento Comercial</p>
  <p><a href="${unsubUrl}" style="color:#6b7280">Não quero mais receber estas mensagens</a></p>
</div>`;
  if (html.includes("</body>")) return html.replace("</body>", `${footer}</body>`);
  return html + footer;
}

function stripHtml(html: string): string {
  return html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}
