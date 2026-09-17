/**
 * Stable, anonymous per-browser identifier for the public proposal share
 * page — persisted in localStorage so repeat visits (and the lead-interest
 * form, once submitted) can be attributed to the same visitor without
 * requiring an account or cookie consent banner. Never sent anywhere except
 * this proposal's own track-view/interest endpoints.
 */
const STORAGE_KEY = "msa_visitor_key";

export function getOrCreateVisitorKey(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const existing = window.localStorage.getItem(STORAGE_KEY);
    if (existing) return existing;
    const fresh =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `v_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    window.localStorage.setItem(STORAGE_KEY, fresh);
    return fresh;
  } catch {
    // Private browsing / storage blocked — degrade to anonymous, untracked.
    return null;
  }
}
