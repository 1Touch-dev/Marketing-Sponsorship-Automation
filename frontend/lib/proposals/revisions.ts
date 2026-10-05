import { createHash } from "crypto";

/**
 * The commercial terms of a proposal: what a sponsor is being offered. Only
 * these fields, plus the quote lines, are covered by a revision's checksum.
 * Operational data other routes write after approval (fulfilment tasks,
 * uploaded assets, document bundles, execution brief) is deliberately not
 * included, or it would raise false "changed since approval" alarms.
 */
export const COMMERCIAL_CONTENT_KEYS = [
  "title",
  "executive_summary",
  "campaign_rationale",
  "sponsorship_value",
  "activation_plan",
  "deliverables",
  "investment_note",
  "cta",
] as const;

export type QuoteLine = {
  /** the quote line's own id: one identifier carried through contract, delivery and renewal */
  allocation_id: string | null;
  inventory_id: string;
  /** display only, not part of the checksum (an inventory rename must not look like a change) */
  name: string | null;
  quantity: number;
  unit: string;
  period: string | null;
  currency: string;
  unit_price: number | null;
  discount_pct: number | null;
  discount_authorized_by: string | null;
  tax_treatment: string;
  line_total: number | null;
};

export type LineRow = {
  id?: string | null;
  inventory_id: string;
  quantity?: number | null;
  scope?: string | null;
  unit_type?: string | null;
  period_label?: string | null;
  currency?: string | null;
  price_agreed?: number | string | null;
  discount_pct?: number | string | null;
  discount_authorized_by?: string | null;
  tax_treatment?: string | null;
  name?: string | null;
};

function toNumber(v: number | string | null | undefined): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function buildQuoteLines(rows: LineRow[]): QuoteLine[] {
  const lines = rows.map((r): QuoteLine => {
    const quantity = Math.max(1, Math.floor(Number(r.quantity ?? 1)));
    const unitPrice = toNumber(r.price_agreed);
    const discount = toNumber(r.discount_pct);
    const gross = unitPrice === null ? null : unitPrice * quantity;
    return {
      allocation_id: r.id ?? null,
      inventory_id: r.inventory_id,
      name: r.name ?? null,
      quantity,
      unit: r.scope ?? r.unit_type ?? "per_season",
      period: r.period_label ?? null,
      currency: r.currency ?? "BRL",
      unit_price: unitPrice,
      discount_pct: discount,
      discount_authorized_by: r.discount_authorized_by ?? null,
      tax_treatment: r.tax_treatment ?? "unspecified",
      line_total: gross === null ? null : round2(gross * (1 - (discount ?? 0) / 100)),
    };
  });
  // Deterministic order so the checksum does not depend on row order.
  return lines.sort((a, b) => canonicalJson(checksumLine(a)).localeCompare(canonicalJson(checksumLine(b))));
}

export function quoteTotal(lines: QuoteLine[], currency = "BRL"): number {
  return round2(lines.filter((l) => l.currency === currency).reduce((s, l) => s + (l.line_total ?? 0), 0));
}

export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null";
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  const obj = value as Record<string, unknown>;
  return `{${Object.keys(obj)
    .sort()
    .filter((k) => obj[k] !== undefined)
    .map((k) => `${JSON.stringify(k)}:${canonicalJson(obj[k])}`)
    .join(",")}}`;
}

function checksumLine(l: QuoteLine) {
  const { name: _name, line_total: _total, ...rest } = l;
  void _name;
  void _total;
  return rest;
}

export function commercialContent(title: string | null | undefined, content: Record<string, unknown> | null | undefined) {
  const out: Record<string, unknown> = { title: title ?? content?.title ?? null };
  for (const key of COMMERCIAL_CONTENT_KEYS) {
    if (key === "title") continue;
    out[key] = content?.[key] ?? null;
  }
  return out;
}

export type Snapshot = {
  title: string | null;
  content: Record<string, unknown>;
  lines: QuoteLine[];
};

export function revisionChecksum(snapshot: Snapshot): string {
  const payload = {
    content: commercialContent(snapshot.title, snapshot.content),
    lines: snapshot.lines.map(checksumLine).sort((a, b) => canonicalJson(a).localeCompare(canonicalJson(b))),
  };
  return createHash("sha256").update(canonicalJson(payload)).digest("hex");
}

export type Drift = {
  hasApprovedRevision: boolean;
  drifted: boolean;
  approvedChecksum: string | null;
  currentChecksum: string;
};

export function compareToApproved(approvedChecksum: string | null, snapshot: Snapshot): Drift {
  const currentChecksum = revisionChecksum(snapshot);
  return {
    hasApprovedRevision: approvedChecksum !== null,
    drifted: approvedChecksum !== null && approvedChecksum !== currentChecksum,
    approvedChecksum,
    currentChecksum,
  };
}
