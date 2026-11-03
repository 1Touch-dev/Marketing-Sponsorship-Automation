/**
 * Who our email comes from, and where replies go.
 *
 * Everything goes out from ONE subdomain, `mail.sponsorship.coritiba.com.br`: it is the domain verified in Amazon SES, and the
 * sending role's IAM policy only allows From addresses on it. The club's own domain is never used as the From address (its
 * SPF/DMARC would reject it, and SES would refuse the send).
 *
 * Nobody reads mail at that subdomain, so every message names a real mailbox in Reply-To.
 */
export const DEFAULT_MAIL_DOMAIN = "mail.sponsorship.coritiba.com.br";
export const DEFAULT_FROM_NAME = "Coritiba FC Patrocínios";
export const DEFAULT_SNS_TOPIC_ARN = "arn:aws:sns:us-east-1:180536781258:sponsorship-ses-feedback";

export type MailKind = "newsletter" | "outreach" | "system";

const EMAIL = /^[^\s@<>"]+@[^\s@<>"]+\.[^\s@<>"]+$/;
export const isEmailAddress = (v: string | null | undefined): v is string => !!v && EMAIL.test(v.trim());

export const mailDomain = () => (process.env.MAIL_FROM_DOMAIN?.trim() || DEFAULT_MAIL_DOMAIN).toLowerCase();

/** "ses" sends through Amazon SES. Anything else means SES is not switched on for this server yet. */
export function mailProvider(): "ses" | "gmail" {
  return process.env.MAIL_PROVIDER?.trim().toLowerCase() === "ses" ? "ses" : "gmail";
}

export const snsTopicArn = () => process.env.SES_SNS_TOPIC_ARN?.trim() || DEFAULT_SNS_TOPIC_ARN;

export interface FromIdentity { name: string; address: string; header: string }

/** A display name safe in a From header: plain ASCII is quoted, anything else is encoded (RFC 2047) so "Patrocínios" survives. */
export function encodeDisplayName(name: string): string {
  const clean = name.replace(/[\r\n]+/g, " ").trim();
  if (/^[\x20-\x7e]*$/.test(clean)) return `"${clean.replace(/(["\\])/g, "\\$1")}"`;
  return `=?UTF-8?B?${Buffer.from(clean, "utf8").toString("base64")}?=`;
}

export function fromFor(kind: MailKind, displayName?: string | null): FromIdentity {
  const domain = mailDomain();
  const address = (
    kind === "system"
      ? process.env.MAIL_SYSTEM_FROM_ADDRESS?.trim() || `nao-responda@${domain}`
      : process.env.MAIL_FROM_ADDRESS?.trim() || `patrocinio@${domain}`
  ).toLowerCase();
  if (!isEmailAddress(address) || !address.endsWith(`@${domain}`)) {
    throw new Error(`The From address ${address} is not on ${domain}. Amazon SES only sends from the verified domain.`);
  }
  const name = displayName?.trim() || process.env.MAIL_FROM_NAME?.trim() || DEFAULT_FROM_NAME;
  return { name, address, header: `${encodeDisplayName(name)} <${address}>` };
}

/** A club-wide message (a newsletter) is answered at the club's shared mailbox; until that exists, at the person who sent it. */
export function clubReplyTo(fallbackPerson?: string | null): string | undefined {
  return replyToFor(isEmailAddress(process.env.MAIL_REPLY_TO) ? process.env.MAIL_REPLY_TO : fallbackPerson);
}

/**
 * Where a reply goes. Order: the person sending (their own address), then MAIL_REPLY_TO (the club's shared mailbox), then none.
 * A reply-to that is not a plain address is dropped, never passed on.
 */
export function replyToFor(person?: string | null): string | undefined {
  for (const c of [person, process.env.MAIL_REPLY_TO]) if (isEmailAddress(c)) return c.trim().toLowerCase();
  return undefined;
}
