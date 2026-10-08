/**
 * Cash, barter and savings, kept apart. Pure rules only (no database).
 *
 * Three measures, never added together:
 *   cash     money the sponsor pays, as instalments (value lines of kind "cash")
 *   barter   goods or services the sponsor provides instead of money (kind "barter")
 *   savings  what the club would otherwise have paid for barter goods it has actually received
 *
 * A deal that is still a draft is not revenue, and a proposed amount becomes a contracted amount by
 * the same line moving onto the contract, so it cannot be counted twice.
 */

export const LINE_KINDS = ["cash", "barter"] as const;
export type LineKind = (typeof LINE_KINDS)[number];

export type LineStatus = "planned" | "invoiced" | "settled" | "voided";
export type LineAction = "invoice" | "settle" | "void";

export interface EventRow { event_type: "invoiced" | "settled" | "voided"; created_at: string }

export function deriveLineStatus(events: EventRow[]): LineStatus {
  let status: LineStatus = "planned";
  const ordered = events.map((e, i) => ({ e, i })).sort((a, b) => Date.parse(a.e.created_at) - Date.parse(b.e.created_at) || a.i - b.i);
  for (const { e } of ordered) {
    if (e.event_type === "voided") return "voided";
    if (e.event_type === "settled") status = "settled";
    else if (e.event_type === "invoiced" && status === "planned") status = "invoiced";
  }
  return status;
}

/** What may be recorded next. Barter has no invoice; a settled line cannot be voided; a voided line is final. */
export function allowedActions(kind: LineKind, status: LineStatus): LineAction[] {
  if (status === "voided") return [];
  if (status === "settled") return [];
  if (status === "invoiced") return ["settle", "void"];
  return kind === "cash" ? ["invoice", "settle", "void"] : ["settle", "void"];
}

// ── settings: the rules still to be chosen, with conservative defaults ──────

export const BARTER_BASES = ["agreed_value", "club_reference_value"] as const;
export const RECOGNITION_STAGES = ["contracted", "invoiced", "settled"] as const;
export const CONTRACT_COVERS = ["cash_only", "cash_and_barter"] as const;

export interface AccountingSettings {
  barter_valuation_basis: (typeof BARTER_BASES)[number];
  recognition_stage: (typeof RECOGNITION_STAGES)[number];
  contract_total_covers: (typeof CONTRACT_COVERS)[number];
  barter_tax_note: string | null;
}

/** Until a person decides: barter at the agreed value, cash counted only once it is received, a contract total that includes barter. */
export const DEFAULT_SETTINGS: AccountingSettings = {
  barter_valuation_basis: "agreed_value", recognition_stage: "settled", contract_total_covers: "cash_and_barter", barter_tax_note: null,
};

export function validateSettings(p: Partial<Record<keyof AccountingSettings, unknown>>): string[] {
  const problems: string[] = [];
  if (p.barter_valuation_basis !== undefined && !(BARTER_BASES as readonly unknown[]).includes(p.barter_valuation_basis)) problems.push(`barter_valuation_basis must be one of ${BARTER_BASES.join(", ")}`);
  if (p.recognition_stage !== undefined && !(RECOGNITION_STAGES as readonly unknown[]).includes(p.recognition_stage)) problems.push(`recognition_stage must be one of ${RECOGNITION_STAGES.join(", ")}`);
  if (p.contract_total_covers !== undefined && !(CONTRACT_COVERS as readonly unknown[]).includes(p.contract_total_covers)) problems.push(`contract_total_covers must be one of ${CONTRACT_COVERS.join(", ")}`);
  if (p.barter_tax_note !== undefined && p.barter_tax_note !== null && (typeof p.barter_tax_note !== "string" || p.barter_tax_note.length > 2000)) problems.push("barter_tax_note must be text of at most 2000 characters");
  return problems;
}

// ── lines ───────────────────────────────────────────────────────────────────

export interface LineInput {
  kind?: string; label?: string; amount_brl?: number | string | null; due_date?: string | null; club_reference_value?: number | string | null;
  barter_item_id?: string | null; proposal_id?: string | null; contract_id?: string | null;
}

const ISO = /^\d{4}-\d{2}-\d{2}$/;
const money = (v: unknown): number | null => { const n = typeof v === "string" ? Number(v) : (v as number); return Number.isFinite(n) ? Math.round(n * 100) / 100 : null; };
export { money };

export function validateLine(i: LineInput): string[] {
  const problems: string[] = [];
  if (i.kind !== "cash" && i.kind !== "barter") problems.push("kind must be cash or barter");
  if (!i.label || !i.label.trim()) problems.push("a label is required (what this instalment or these goods are)");
  const amount = money(i.amount_brl);
  if (amount === null || amount <= 0) problems.push("amount_brl must be a positive amount in BRL");
  if (!i.proposal_id && !i.contract_id) problems.push("a line belongs to a proposal or a contract");
  if (i.due_date && (!ISO.test(i.due_date) || Number.isNaN(Date.parse(`${i.due_date}T00:00:00Z`)))) problems.push("due_date must be a real date written YYYY-MM-DD");
  if (i.kind === "cash") {
    if (i.club_reference_value !== undefined && i.club_reference_value !== null) problems.push("only barter has a club reference value");
    if (i.barter_item_id) problems.push("only barter can be linked to a wishlist item");
  } else if (i.club_reference_value !== undefined && i.club_reference_value !== null) {
    const r = money(i.club_reference_value);
    if (r === null || r <= 0) problems.push("club_reference_value must be a positive amount in BRL");
  }
  return problems;
}

export interface EventInput { action: LineAction; reference?: string | null; occurredOn?: string | null; reason?: string | null }

export function validateEvent(i: EventInput, today: string): string[] {
  const problems: string[] = [];
  if (i.action === "invoice" || i.action === "settle") {
    const min = i.action === "invoice" ? 3 : 5;
    if (!i.reference || i.reference.trim().length < min) problems.push(`a reference (${min}+ characters) is required: ${i.action === "invoice" ? "the invoice number" : "the bank or receipt reference, or the delivery note"}`);
    if (!i.occurredOn || !ISO.test(i.occurredOn) || Number.isNaN(Date.parse(`${i.occurredOn}T00:00:00Z`))) problems.push("occurred_on must be the real date it happened, YYYY-MM-DD");
    else if (i.occurredOn > today) problems.push("occurred_on is in the future; record it when it has happened");
  }
  if (i.action === "void" && (!i.reason || i.reason.trim().length < 5)) problems.push("a reason (5+ characters) is required to void a line");
  return problems;
}

// ── where a line stands ─────────────────────────────────────────────────────

/** Contract statuses in which money or goods can be recorded. */
export const IN_FORCE = ["active", "completed", "expired"] as const;
export const isInForce = (s: string | null | undefined) => !!s && (IN_FORCE as readonly string[]).includes(s);

/** Proposal statuses that are still being worked (a rejected one has lapsed). */
const PROPOSAL_LIVE = ["draft", "under_review", "revision_requested", "approved", "scheduled", "sent", "active_contract"];

export type Bucket = "proposed" | "draft_contract" | "contracted" | "invoiced" | "settled" | "voided" | "lapsed" | "orphan";

export function classify(i: { status: LineStatus; contractId: string | null; contractStatus: string | null; proposalId: string | null; proposalStatus: string | null }): Bucket {
  if (i.status === "voided") return "voided";
  if (i.status === "settled") return "settled"; // it happened, whatever became of the deal
  if (i.contractId) {
    if (isInForce(i.contractStatus)) return i.status === "invoiced" ? "invoiced" : "contracted";
    if (i.contractStatus === "draft") return "draft_contract";
    return "lapsed";
  }
  if (!i.proposalId) return "orphan";
  return i.proposalStatus && PROPOSAL_LIVE.includes(i.proposalStatus) ? "proposed" : "lapsed";
}

// ── the numbers ─────────────────────────────────────────────────────────────

export interface Line {
  id: string; company_id: string; proposal_id: string | null; contract_id: string | null; kind: LineKind; label: string; amount_brl: number;
  due_date: string | null; club_reference_value: number | null; barter_item_id: string | null;
}

export interface ClassifiedLine extends Line { status: LineStatus; bucket: Bucket; proposalStatus: string | null; contractStatus: string | null }

export interface Pile {
  proposed: number; draft_contract: number; contracted: number; invoiced: number; settled: number;
  /** contracted + invoiced + settled: everything on a contract in force */
  committed: number;
  /** what counts as recognised, at the stage chosen in the settings */
  recognized: number;
  excluded: { voided: number; lapsed: number; orphan: number };
}

export interface BarterPile extends Pile {
  basis: AccountingSettings["barter_valuation_basis"];
  /** lines with no reference value, left out of the totals under the reference-value basis */
  unvalued_lines: string[];
}

export interface Reconciliation {
  contract_id: string; contract_number: string | null; status: string;
  contract_total_brl: number | null; lines_cash_brl: number; lines_barter_brl: number; expected_brl: number; difference_brl: number | null;
  result: "matches" | "lines_exceed_total" | "lines_short_of_total" | "no_total_recorded" | "no_lines";
}

export interface FinanceSummary {
  settings: AccountingSettings;
  settings_are_default: boolean;
  cash: Pile;
  barter: BarterPile;
  savings: { realized: number; pending: number; unvalued_lines: string[]; lines_realized: number };
  reconciliation: Reconciliation[];
  gaps: { orphan_lines: string[]; won_proposals_with_unlinked_lines: string[]; active_contracts_without_lines: string[]; lapsed_lines: string[] };
  notes: string[];
}

const emptyPile = (): Pile => ({ proposed: 0, draft_contract: 0, contracted: 0, invoiced: 0, settled: 0, committed: 0, recognized: 0, excluded: { voided: 0, lapsed: 0, orphan: 0 } });
const round2 = (n: number) => Math.round(n * 100) / 100;

/** The value a barter line counts for under the chosen basis; null when the basis needs a number the line does not have. */
export function barterValue(l: Pick<Line, "amount_brl" | "club_reference_value">, basis: AccountingSettings["barter_valuation_basis"]): number | null {
  return basis === "agreed_value" ? l.amount_brl : l.club_reference_value;
}

export function summarise(input: {
  lines: ClassifiedLine[];
  settings: AccountingSettings;
  settingsAreDefault: boolean;
  contracts: Array<{ id: string; contract_number: string | null; status: string; total_value_brl: number | null }>;
}): FinanceSummary {
  const { settings } = input;
  const cash = emptyPile();
  const barter: BarterPile = { ...emptyPile(), basis: settings.barter_valuation_basis, unvalued_lines: [] };
  const gaps: FinanceSummary["gaps"] = { orphan_lines: [], won_proposals_with_unlinked_lines: [], active_contracts_without_lines: [], lapsed_lines: [] };
  let savingsRealized = 0, savingsPending = 0, savingsLines = 0;
  const savingsUnvalued: string[] = [];

  for (const l of input.lines) {
    const pile = l.kind === "cash" ? cash : barter;
    const value = l.kind === "cash" ? l.amount_brl : barterValue(l, settings.barter_valuation_basis);
    if (l.bucket === "voided" || l.bucket === "lapsed" || l.bucket === "orphan") {
      if (l.bucket === "orphan") gaps.orphan_lines.push(l.id);
      if (l.bucket === "lapsed") gaps.lapsed_lines.push(l.id);
      if (value !== null) pile.excluded[l.bucket] += value;
      continue;
    }
    if (l.kind === "barter" && value === null) { barter.unvalued_lines.push(l.id); }
    else if (value !== null) pile[l.bucket as "proposed" | "draft_contract" | "contracted" | "invoiced" | "settled"] += value;
    if (l.bucket === "proposed" && l.proposalStatus === "active_contract" && !gaps.won_proposals_with_unlinked_lines.includes(l.proposal_id ?? "")) gaps.won_proposals_with_unlinked_lines.push(l.proposal_id ?? "");

    if (l.kind === "barter") {
      // savings: what the club would otherwise have paid, counted only for goods actually received
      if (l.club_reference_value === null) { if (l.bucket === "settled") savingsUnvalued.push(l.id); }
      else if (l.bucket === "settled") { savingsRealized += l.club_reference_value; savingsLines++; }
      else if (l.bucket === "contracted" || l.bucket === "invoiced") savingsPending += l.club_reference_value;
    }
  }

  for (const [pile, kind] of [[cash, "cash"], [barter, "barter"]] as const) {
    pile.committed = round2(pile.contracted + pile.invoiced + pile.settled);
    pile.recognized = round2(settings.recognition_stage === "contracted" ? pile.committed
      // barter has no invoice: when cash is recognised on invoicing, barter is recognised on receipt
      : settings.recognition_stage === "invoiced" ? (kind === "cash" ? pile.invoiced + pile.settled : pile.settled)
      : pile.settled);
    for (const k of ["proposed", "draft_contract", "contracted", "invoiced", "settled"] as const) pile[k] = round2(pile[k]);
    for (const k of ["voided", "lapsed", "orphan"] as const) pile.excluded[k] = round2(pile.excluded[k]);
  }

  // does the contract's own total agree with the lines behind it?
  const byContract = new Map<string, ClassifiedLine[]>();
  for (const l of input.lines) if (l.contract_id && l.bucket !== "voided") byContract.set(l.contract_id, [...(byContract.get(l.contract_id) ?? []), l]);
  const reconciliation: Reconciliation[] = [];
  for (const c of input.contracts) {
    const ls = byContract.get(c.id) ?? [];
    if (ls.length === 0) {
      if (c.status === "active") { gaps.active_contracts_without_lines.push(c.id); reconciliation.push({ contract_id: c.id, contract_number: c.contract_number, status: c.status, contract_total_brl: c.total_value_brl, lines_cash_brl: 0, lines_barter_brl: 0, expected_brl: 0, difference_brl: null, result: "no_lines" }); }
      continue;
    }
    const cashSum = round2(ls.filter((l) => l.kind === "cash").reduce((s, l) => s + l.amount_brl, 0));
    const barterSum = round2(ls.filter((l) => l.kind === "barter").reduce((s, l) => s + l.amount_brl, 0));
    const expected = round2(settings.contract_total_covers === "cash_and_barter" ? cashSum + barterSum : cashSum);
    const total = c.total_value_brl === null ? null : Number(c.total_value_brl);
    const diff = total === null ? null : round2(total - expected);
    reconciliation.push({
      contract_id: c.id, contract_number: c.contract_number, status: c.status, contract_total_brl: total, lines_cash_brl: cashSum, lines_barter_brl: barterSum, expected_brl: expected, difference_brl: diff,
      result: total === null ? "no_total_recorded" : Math.abs(diff!) < 0.01 ? "matches" : diff! < 0 ? "lines_exceed_total" : "lines_short_of_total",
    });
  }

  return {
    settings, settings_are_default: input.settingsAreDefault, cash, barter,
    savings: { realized: round2(savingsRealized), pending: round2(savingsPending), unvalued_lines: savingsUnvalued, lines_realized: savingsLines },
    reconciliation, gaps,
    notes: [
      "Cash, barter and savings are different measures. Never add them together: savings is the club's view of barter goods already received, not extra value.",
      "A draft or lapsed deal is never counted as contracted or recognised; only money or goods actually recorded as settled count after a deal lapses.",
      ...(input.settingsAreDefault ? ["The accounting rules have not been set by a person yet: the defaults above are conservative placeholders."] : []),
    ],
  };
}
