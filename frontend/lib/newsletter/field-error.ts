export type NewsletterRequiredField = "subject" | "body";

/** Pack E2E-NEWS-01 copy. `show` is true after the field was edited or Preview was opened. */
export function newsletterFieldError(
  field: NewsletterRequiredField,
  value: string,
  show: boolean,
): string | null {
  if (!show) return null;
  if (value.trim()) return null;
  return field === "subject" ? "Subject is required" : "Email body is required";
}
