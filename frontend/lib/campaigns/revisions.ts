import { createHash } from "crypto";
import { canonicalJson } from "../proposals/revisions";

/**
 * What a campaign's pre-approval covers: its own words and the inventory in its package. Pre-approving lets the Outreach
 * Agent run on the campaign in batches without a person approving each proposal, so anything the agent writes from must be
 * covered, and nothing the system writes afterwards on its own (model output, ids, timestamps) may raise a false alarm.
 */
export const CAMPAIGN_TEXT_KEYS = ["title", "summary", "objective", "cta", "description", "activation", "strategy"] as const;
// Deliberately NOT covered: the activation brief (internal delivery planning, regenerated with new timestamps and model text
// each time), model output and ids. Covering them would expire an approval on every regenerate.

export type CampaignLine = {
  inventory_id: string | null;
  name: string;
  category: string | null;
  inventory_type: string | null;
  quantity: number;
  unit: string | null;
  unit_price: number;
  notes: string | null;
};

export type CampaignSnapshot = { content: Record<string, unknown>; lines: CampaignLine[] };

const num = (v: unknown, fallback: number): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
};
const text = (v: unknown): string | null => (typeof v === "string" && v.trim() !== "" ? v.trim() : null);

/** The words of a campaign. Empty and missing are the same thing, and surrounding whitespace is not a change. */
export function campaignContent(row: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const key of CAMPAIGN_TEXT_KEYS) {
    const v = row[key];
    out[key] = typeof v === "string" ? text(v) : (v ?? null);
  }
  return out;
}

/** The package: only items that are included, in an order that does not depend on how they were stored. */
export function campaignLines(items: Array<Record<string, unknown>>): CampaignLine[] {
  return items
    .filter((i) => i.included !== false)
    .map((i): CampaignLine => ({
      inventory_id: text(i.inventory_id),
      name: text(i.name) ?? "Item",
      category: text(i.category),
      inventory_type: text(i.inventory_type),
      quantity: Math.max(1, Math.floor(num(i.quantity, 1))),
      unit: text(i.unit),
      unit_price: Math.round(num(i.unit_price, 0) * 100) / 100,
      notes: text(i.notes),
    }))
    .sort((a, b) => canonicalJson(a).localeCompare(canonicalJson(b)));
}

export const campaignTotal = (lines: CampaignLine[]): number => Math.round(lines.reduce((s, l) => s + l.quantity * l.unit_price, 0) * 100) / 100;

export const campaignChecksum = (s: CampaignSnapshot): string => createHash("sha256").update(canonicalJson({ content: s.content, lines: s.lines })).digest("hex");

/** Why a campaign may or may not be run unattended. */
export type CampaignApproval =
  | { state: "not_preapproved"; valid: false; message: string }
  | { state: "valid"; valid: true; revision_number: number; message: string }
  | { state: "expired"; valid: false; revision_number: number; message: string }
  | { state: "unfrozen"; valid: false; message: string }
  // migration 0073 is not applied yet: behave exactly as before it
  | { state: "legacy"; valid: true; message: string };

/** What the status badge may say. Pre-approval is a separate flag and must not turn a draft into Approved. */
export function campaignStatusPresentation(
  status: string,
  bound: { matches: boolean; revision_number: number } | null,
): { status: string; label?: string } {
  if (bound?.matches && status === "approved") {
    return { status, label: `Approved, version ${bound.revision_number}` };
  }
  if (bound && !bound.matches && status === "approved") return { status: "draft" };
  return { status };
}

export const APPROVAL_MESSAGES = {
  not_preapproved: "Campaign is not pre-approved. Mark it as pre-approved before running the batch agent.",
  expired: "This campaign's wording or package changed after it was pre-approved, so the pre-approval no longer applies. Read it again and pre-approve it.",
  unfrozen: "This campaign was pre-approved before its wording was recorded, so it is not known what was approved. Pre-approve it again to record it.",
  valid: "Pre-approved, and unchanged since.",
  legacy: "Pre-approved (revisions are not set up yet).",
} as const;
