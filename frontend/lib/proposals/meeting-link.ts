/**
 * Default booking URL for a staff user (platform_users.calendar_url).
 * Empty / missing → null so public CTA can fall back to mailto.
 */
export function meetingLinkForUser(user: { calendar_url?: string | null }): string | null {
  const raw = user.calendar_url;
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/** True when PostgREST/Postgres says calendar_url (or similar) is not in the schema yet. */
export function isMissingCalendarUrlColumn(error: { message?: string; code?: string } | null | undefined): boolean {
  if (!error?.message) return false;
  const msg = error.message;
  return (
    /calendar_url/i.test(msg) &&
    /(does not exist|schema cache|Could not find|column)/i.test(msg)
  );
}
