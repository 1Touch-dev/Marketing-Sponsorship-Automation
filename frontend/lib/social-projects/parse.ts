export const SOCIAL_PROJECT_STATUSES = ["open", "active", "completed", "cancelled"] as const;
export type SocialProjectStatus = (typeof SOCIAL_PROJECT_STATUSES)[number];

export type SocialProjectPatch = {
  budget_raised?: number;
  status?: SocialProjectStatus;
};

export type ParseResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string };

export function parseSocialProjectPatch(body: unknown): ParseResult<SocialProjectPatch> {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { ok: false, error: "Invalid payload" };
  }
  const b = body as Record<string, unknown>;
  const data: SocialProjectPatch = {};

  if ("budget_raised" in b) {
    const n = typeof b.budget_raised === "number" ? b.budget_raised : Number(b.budget_raised);
    if (!Number.isFinite(n) || n < 0) {
      return { ok: false, error: "budget_raised must be a number ≥ 0" };
    }
    data.budget_raised = n;
  }

  if ("status" in b && b.status != null && b.status !== "") {
    const s = String(b.status);
    if (!(SOCIAL_PROJECT_STATUSES as readonly string[]).includes(s)) {
      return { ok: false, error: "Invalid status" };
    }
    data.status = s as SocialProjectStatus;
  }

  if (Object.keys(data).length === 0) {
    return { ok: false, error: "No updatable fields" };
  }
  return { ok: true, data };
}
