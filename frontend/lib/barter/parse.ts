export const BARTER_STATUSES = ["open", "in_negotiation", "closed", "cancelled"] as const;
export type BarterStatus = (typeof BARTER_STATUSES)[number];

export const BARTER_TYPES = ["full_barter", "partial_barter", "negotiated_discount"] as const;
export type BarterType = (typeof BARTER_TYPES)[number];

export const BARTER_STATUS_LABELS: Record<BarterStatus, string> = {
  open: "Open",
  in_negotiation: "In Negotiation",
  closed: "Closed",
  cancelled: "Cancelled",
};

export const BARTER_TYPE_LABELS: Record<BarterType, string> = {
  full_barter: "Full Barter (no cash)",
  partial_barter: "Partial Barter (barter + payment)",
  negotiated_discount: "Negotiated Discount via Sponsorship",
};

export type BarterPatch = {
  status?: BarterStatus;
  barter_type?: BarterType;
  target_price?: number | null;
  notes?: string | null;
};

export type ParseResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string };

export function parseBarterPatch(body: unknown): ParseResult<BarterPatch> {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { ok: false, error: "Invalid payload" };
  }
  const b = body as Record<string, unknown>;
  const data: BarterPatch = {};

  if ("status" in b && b.status != null && b.status !== "") {
    const s = String(b.status);
    if (!(BARTER_STATUSES as readonly string[]).includes(s)) {
      return { ok: false, error: "Invalid status" };
    }
    data.status = s as BarterStatus;
  }

  if ("barter_type" in b && b.barter_type != null && b.barter_type !== "") {
    const t = String(b.barter_type);
    if (!(BARTER_TYPES as readonly string[]).includes(t)) {
      return { ok: false, error: "Invalid barter_type" };
    }
    data.barter_type = t as BarterType;
  }

  if ("target_price" in b) {
    if (b.target_price === null || b.target_price === "") {
      data.target_price = null;
    } else {
      const n = typeof b.target_price === "number" ? b.target_price : Number(b.target_price);
      if (!Number.isFinite(n) || n < 0) {
        return { ok: false, error: "target_price must be a number ≥ 0" };
      }
      data.target_price = n;
    }
  }

  if ("notes" in b) {
    if (b.notes == null || b.notes === "") data.notes = null;
    else data.notes = String(b.notes);
  }

  if (Object.keys(data).length === 0) {
    return { ok: false, error: "No updatable fields" };
  }
  return { ok: true, data };
}
