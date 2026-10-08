import crypto from "crypto";

/**
 * A short, keyed fingerprint of a value (an IP address, an email address, a share token) for the audit log.
 * The log is permanent, so it must not hold what a person could later ask to have erased, nor anything that
 * works as a credential. The fingerprint still lets the same visitor be recognised across entries.
 */
export function logFingerprint(value: string | null | undefined): string | null {
  if (!value) return null;
  const key = process.env.INTERNAL_API_SECRET || "audit-fingerprint";
  return crypto.createHmac("sha256", key).update(value.trim().toLowerCase()).digest("hex").slice(0, 16);
}
