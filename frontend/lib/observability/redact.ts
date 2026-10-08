import { logFingerprint } from "../identity/privacy";

/**
 * What may leave the platform for an observability tool. Prompts and replies contain real people (a sponsor's contact,
 * the email they wrote back), so before anything is sent:
 *   - email addresses, phone numbers, CNPJ/CPF numbers and anything shaped like a key or token are replaced by a short
 *     fingerprint (the same person gets the same fingerprint, so a pattern is still visible, but who it is is not);
 *   - long text is cut.
 * LANGFUSE_CAPTURE chooses how much is sent at all:
 *   "metadata"  no prompt or reply text, only sizes, model, tokens, cost, timing, scores
 *   "redacted"  (default) text with the personal data above removed
 *   "full"      text as it is; only for a Langfuse the club hosts itself and has agreed to hold personal data
 */
export type CaptureMode = "metadata" | "redacted" | "full";

export const captureMode = (): CaptureMode => {
  const v = (process.env.LANGFUSE_CAPTURE || "redacted").trim().toLowerCase();
  return v === "metadata" || v === "full" ? v : "redacted";
};

const fp = (prefix: string, v: string) => `[${prefix}:${logFingerprint(v) ?? "x"}]`;

const PATTERNS: Array<[RegExp, (m: string) => string]> = [
  [/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, (m) => fp("email", m)],
  // CNPJ 12.345.678/0001-90 or 14 digits, CPF 123.456.789-09 or 11 digits
  [/\b\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}\b/g, (m) => fp("cnpj", m)],
  [/\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/g, (m) => fp("cpf", m)],
  // phone numbers: optional +55, area code, 8 or 9 digits
  [/(?:\+?55[\s-]?)?\(?\b\d{2}\)?[\s-]?9?\d{4}[\s-]?\d{4}\b/g, (m) => fp("phone", m)],
  // keys and tokens: sk-..., Bearer ..., long hex or base64url blobs
  [/\bsk-[A-Za-z0-9_-]{16,}\b/g, (m) => fp("key", m)],
  [/\bBearer\s+[A-Za-z0-9._~+/-]{16,}=*/g, (m) => fp("token", m)],
  [/\b[A-Za-z0-9_-]{32,}\b/g, (m) => fp("token", m)],
];

export function redactText(text: string, max = 4000): string {
  let out = text;
  for (const [re, f] of PATTERNS) out = out.replace(re, f);
  return out.length > max ? `${out.slice(0, max)} …[cut, ${out.length - max} more characters]` : out;
}

/** Applies the capture mode to any value: strings are redacted, objects and arrays are walked, nothing is mutated. */
export function forTrace(value: unknown, mode: CaptureMode = captureMode(), depth = 0): unknown {
  if (value == null) return value;
  if (mode === "metadata") {
    if (typeof value === "string") return `[text, ${value.length} characters]`;
    if (Array.isArray(value)) return `[list of ${value.length}]`;
    if (typeof value === "object") return `[record with ${Object.keys(value as object).length} fields]`;
    return value;
  }
  if (typeof value === "string") return mode === "full" ? value : redactText(value);
  if (typeof value !== "object" || depth > 6) return typeof value === "object" ? "[nested]" : value;
  if (Array.isArray(value)) return value.slice(0, 50).map((v) => forTrace(v, mode, depth + 1));
  return Object.fromEntries(Object.entries(value as Record<string, unknown>).slice(0, 60).map(([k, v]) => [k, /secret|password|token|api[_-]?key|authorization/i.test(k) && mode !== "full" ? "[withheld]" : forTrace(v, mode, depth + 1)]));
}
