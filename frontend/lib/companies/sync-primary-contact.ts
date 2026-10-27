import { isMissingMigration } from "../proposals/revision-store";
import { normalizeEmail } from "../contacts/model";

type Sb = any;

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

export function isValidContactEmail(email: string | null | undefined): email is string {
  if (typeof email !== "string") return false;
  const trimmed = email.trim();
  return trimmed.length > 0 && EMAIL_RE.test(trimmed);
}

/**
 * When the company form has a real contact email, also write a `contacts` row.
 * `/contacts`, portal login and outreach read that table — not companies.contact_*.
 * Empty or invalid email is a no-op: the company can still be saved with name/phone only.
 * A missing contacts table must not fail company create.
 */
export async function syncPrimaryContactFromCompany(
  sb: Sb,
  input: {
    tenantId: string;
    companyId: string;
    fullName?: string | null;
    email?: string | null;
    phone?: string | null;
  },
): Promise<{ synced: boolean }> {
  if (!isValidContactEmail(input.email)) return { synced: false };

  const email = normalizeEmail(input.email);
  const fullName = input.fullName?.trim() || null;
  const phone = input.phone?.trim() || null;

  const { error } = await sb.from("contacts").upsert(
    {
      tenant_id: input.tenantId,
      company_id: input.companyId,
      email,
      full_name: fullName,
      phone,
      source: "manual",
    },
    { onConflict: "company_id,email" },
  );

  if (error && !isMissingMigration(error)) {
    console.error("[sync-primary-contact]", error.message);
  }
  return { synced: !error };
}
