import { normalizeEmail } from "@/lib/contacts/model";

/** Exact hosts (and their subdomains) that must never be approved or marked sent. */
const RESERVED_EXACT_DOMAINS = ["example.com", "example.org"] as const;

/** Top-level domains reserved for testing / documentation. */
const RESERVED_TLDS = ["test", "invalid"] as const;

function recipientHost(email: string): string | null {
  const normalized = normalizeEmail(email);
  const at = normalized.lastIndexOf("@");
  if (at < 0 || at === normalized.length - 1) return null;
  return normalized.slice(at + 1);
}

/**
 * True when the address uses a reserved/documentation domain
 * (example.com, example.org, *.test, *.invalid), including subdomains
 * like mail.example.com.
 */
export function isReservedRecipientDomain(email: string): boolean {
  const host = recipientHost(email);
  if (!host) return false;

  for (const domain of RESERVED_EXACT_DOMAINS) {
    if (host === domain || host.endsWith(`.${domain}`)) return true;
  }
  for (const tld of RESERVED_TLDS) {
    if (host === tld || host.endsWith(`.${tld}`)) return true;
  }
  return false;
}

export type ReservedRecipientBlock = {
  code: "reserved_domain";
  message: string;
};

/** Readable refusal for approve / Mark as Sent / test-send paths. */
export function reservedRecipientBlock(email: string): ReservedRecipientBlock | null {
  if (!isReservedRecipientDomain(email)) return null;
  const host = recipientHost(email) ?? "unknown";
  return {
    code: "reserved_domain",
    message: `Cannot approve or mark as sent: recipient uses a reserved/test domain (${host}).`,
  };
}
