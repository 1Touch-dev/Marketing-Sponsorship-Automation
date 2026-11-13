/**
 * Explicit update payload for PATCH /api/users/me.
 * Never spreads the request body — only calendar_url (+ updated_at).
 */
export function buildCalendarUrlUpdate(calendarUrl: string | null): {
  calendar_url: string | null;
  updated_at: string;
} {
  return {
    calendar_url: calendarUrl,
    updated_at: new Date().toISOString(),
  };
}

/** Fields that must never be taken from a /api/users/me body. */
export const ME_PATCH_FORBIDDEN_KEYS = ["role", "is_active", "full_name", "email", "id", "tenant_id"] as const;
