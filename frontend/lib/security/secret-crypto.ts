import crypto from "node:crypto";

/**
 * Hardening pass (master_report.md Section 8, Pattern 6). Gmail OAuth
 * access/refresh tokens were being stored in plaintext in users.metadata —
 * a refresh_token doesn't expire on its own, so a DB read (leak, backup
 * exposure, insider access) would grant standing access to the connected
 * Gmail account. AES-256-GCM with a key derived from ENCRYPTION_SECRET
 * (already a documented-but-unused env var meant for exactly this).
 *
 * decryptSecret() passes through anything not carrying the ENC_PREFIX
 * unchanged, so tokens already stored in plaintext before this change keep
 * working — no backfill/migration pass required before deploying this.
 */
const ALGO = "aes-256-gcm";
const ENC_PREFIX = "enc:v1:";
const IV_LEN = 12;
const TAG_LEN = 16;

function getKey(): Buffer {
  const secret = process.env.ENCRYPTION_SECRET;
  if (!secret) {
    throw new Error(
      "ENCRYPTION_SECRET is not set — cannot encrypt/decrypt secrets at rest",
    );
  }
  return crypto.createHash("sha256").update(secret).digest();
}

export function encryptSecret(plaintext: string): string {
  const key = getKey();
  const iv = crypto.randomBytes(IV_LEN);
  const cipher = crypto.createCipheriv(ALGO, key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return ENC_PREFIX + Buffer.concat([iv, tag, ciphertext]).toString("base64");
}

/**
 * Decrypts a value produced by encryptSecret(). If the value doesn't carry
 * the enc:v1: prefix (legacy plaintext, or not a secret at all), it is
 * returned unchanged — this is what makes the migration to encrypted
 * storage backward-compatible with tokens written before this change.
 */
export function decryptSecret(value: string): string {
  if (!value.startsWith(ENC_PREFIX)) return value;
  const key = getKey();
  const raw = Buffer.from(value.slice(ENC_PREFIX.length), "base64");
  const iv = raw.subarray(0, IV_LEN);
  const tag = raw.subarray(IV_LEN, IV_LEN + TAG_LEN);
  const ciphertext = raw.subarray(IV_LEN + TAG_LEN);
  const decipher = crypto.createDecipheriv(ALGO, key, iv);
  decipher.setAuthTag(tag);
  const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return plaintext.toString("utf8");
}
