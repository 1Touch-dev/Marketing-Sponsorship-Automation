import { sendPlatformEmail } from "@/lib/gmail/send-platform-email";
import { mailProvider } from "./config";
import { sendViaSes, type MailSender } from "./ses";

/**
 * An email the platform sends on its own account (a sponsor's portal login link): through Amazon SES once MAIL_PROVIDER=ses,
 * through the connected Gmail until then. Throws when it could not be sent, so the caller decides what is fatal.
 */
export async function sendSystemEmail(
  a: { tenantId: string; to: string; subject: string; bodyText: string; bodyHtml?: string; tag: string },
  deps: { send?: MailSender; provider?: "ses" | "gmail" } = {},
): Promise<{ provider: "ses" | "gmail"; messageId?: string }> {
  const provider = deps.provider ?? mailProvider();
  if (provider === "ses") {
    const r = await (deps.send ?? sendViaSes)({ to: a.to, subject: a.subject, text: a.bodyText, html: a.bodyHtml, kind: "system", tag: a.tag });
    return { provider, messageId: r.messageId };
  }
  await sendPlatformEmail({ tenantId: a.tenantId, to: a.to, subject: a.subject, bodyText: a.bodyText, bodyHtml: a.bodyHtml });
  return { provider };
}
