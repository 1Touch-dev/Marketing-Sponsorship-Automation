import { isMissingMigration } from "../proposals/revision-store";
import type { WriteResult } from "../accounts/store";
import {
  DEFAULT_SETTINGS, allowedActions, classify, deriveLineStatus, money, summarise, validateEvent, validateLine, validateSettings,
  type AccountingSettings, type ClassifiedLine, type EventInput, type EventRow, type FinanceSummary, type Line, type LineAction, type LineInput, type LineKind, type LineStatus,
} from "./model";

type Sb = any;

const notSetUp = "Cash, barter and savings accounting is not set up yet (migration 0066).";
const todayStr = () => new Date().toISOString().slice(0, 10);
const chunks = <T,>(xs: T[], n = 100) => Array.from({ length: Math.ceil(xs.length / n) }, (_, i) => xs.slice(i * n, i * n + n));
const fail = (error: { message: string; code?: string }): { ok: false; status: number; error: string } =>
  isMissingMigration(error) ? { ok: false, status: 503, error: notSetUp } : { ok: false, status: 500, error: error.message };

// ── settings ────────────────────────────────────────────────────────────────

export async function loadSettings(sb: Sb, tenantId: string): Promise<WriteResult<{ settings: AccountingSettings; isDefault: boolean; updated_by: string | null; updated_at: string | null }>> {
  const { data, error } = await sb.from("accounting_settings").select("barter_valuation_basis, recognition_stage, contract_total_covers, barter_tax_note, updated_by, updated_at").eq("tenant_id", tenantId).maybeSingle();
  if (error) return fail(error);
  if (!data) return { ok: true, value: { settings: DEFAULT_SETTINGS, isDefault: true, updated_by: null, updated_at: null } };
  const { updated_by, updated_at, ...settings } = data as AccountingSettings & { updated_by: string; updated_at: string };
  return { ok: true, value: { settings, isDefault: false, updated_by, updated_at } };
}

export async function saveSettings(sb: Sb, tenantId: string, patch: Partial<AccountingSettings>, actorEmail: string): Promise<WriteResult<AccountingSettings>> {
  if (!actorEmail) return { ok: false, status: 403, error: "A signed-in person is required." };
  const problems = validateSettings(patch);
  if (problems.length > 0) return { ok: false, status: 400, error: problems.join("; ") };
  if (Object.keys(patch).length === 0) return { ok: false, status: 400, error: "Nothing to change" };
  const current = await loadSettings(sb, tenantId);
  if (!current.ok) return current;
  const next = { ...current.value.settings, ...patch, barter_tax_note: patch.barter_tax_note === undefined ? current.value.settings.barter_tax_note : patch.barter_tax_note?.trim() || null };
  const { error } = await sb.from("accounting_settings").upsert({ tenant_id: tenantId, ...next, updated_by: actorEmail, updated_at: new Date().toISOString() }, { onConflict: "tenant_id" });
  if (error) return fail(error);
  return { ok: true, value: next };
}

// ── lines ───────────────────────────────────────────────────────────────────

interface LineRow {
  id: string; tenant_id: string; company_id: string; proposal_id: string | null; contract_id: string | null; kind: LineKind; label: string; amount_brl: number | string;
  currency: string; due_date: string | null; barter_item_id: string | null; club_reference_value: number | string | null; reference_basis: string | null; created_by: string; created_at: string;
}
const COLUMNS = "id, tenant_id, company_id, proposal_id, contract_id, kind, label, amount_brl, currency, due_date, barter_item_id, club_reference_value, reference_basis, created_by, created_at";

const asLine = (r: LineRow): Line => ({
  id: r.id, company_id: r.company_id, proposal_id: r.proposal_id, contract_id: r.contract_id, kind: r.kind, label: r.label, amount_brl: Number(r.amount_brl),
  due_date: r.due_date, club_reference_value: r.club_reference_value === null ? null : Number(r.club_reference_value), barter_item_id: r.barter_item_id,
});

export interface LineView extends Line {
  status: LineStatus; bucket: ClassifiedLine["bucket"]; actions: LineAction[]; reference_basis: string | null; currency: string; created_by: string; created_at: string;
  contract_status: string | null; proposal_status: string | null;
}

async function loadEvents(sb: Sb, ids: string[]): Promise<Array<EventRow & { line_id: string; reference: string | null; occurred_on: string | null; reason: string | null; actor_email: string }>> {
  const out: any[] = [];
  for (const part of chunks(ids)) {
    const { data } = await sb.from("value_line_events").select("line_id, event_type, reference, occurred_on, reason, actor_email, created_at").in("line_id", part).order("created_at", { ascending: true });
    out.push(...(data ?? []));
  }
  return out;
}

async function classifyAll(sb: Sb, tenantId: string, rows: LineRow[]): Promise<{ lines: ClassifiedLine[]; views: LineView[] }> {
  const events = await loadEvents(sb, rows.map((r) => r.id));
  const contractIds = [...new Set(rows.map((r) => r.contract_id).filter(Boolean))] as string[];
  const proposalIds = [...new Set(rows.map((r) => r.proposal_id).filter(Boolean))] as string[];
  const cStatus = new Map<string, string>();
  const pStatus = new Map<string, string>();
  for (const part of chunks(contractIds)) {
    const { data } = await sb.from("contracts").select("id, status").eq("tenant_id", tenantId).in("id", part);
    for (const c of (data ?? []) as Array<{ id: string; status: string }>) cStatus.set(c.id, c.status);
  }
  for (const part of chunks(proposalIds)) {
    const { data } = await sb.from("proposals").select("id, status").eq("tenant_id", tenantId).in("id", part);
    for (const p of (data ?? []) as Array<{ id: string; status: string }>) pStatus.set(p.id, p.status);
  }
  const lines: ClassifiedLine[] = [];
  const views: LineView[] = [];
  for (const r of rows) {
    const status = deriveLineStatus(events.filter((e) => e.line_id === r.id));
    const contractStatus = r.contract_id ? cStatus.get(r.contract_id) ?? null : null;
    const proposalStatus = r.proposal_id ? pStatus.get(r.proposal_id) ?? null : null;
    const bucket = classify({ status, contractId: r.contract_id, contractStatus, proposalId: r.proposal_id, proposalStatus });
    const base = asLine(r);
    lines.push({ ...base, status, bucket, proposalStatus, contractStatus });
    views.push({ ...base, status, bucket, actions: allowedActions(r.kind, status), reference_basis: r.reference_basis, currency: r.currency, created_by: r.created_by, created_at: r.created_at, contract_status: contractStatus, proposal_status: proposalStatus });
  }
  return { lines, views };
}

export interface LineFilter { companyId?: string | null; contractId?: string | null; proposalId?: string | null; kind?: string | null; bucket?: string | null }

export async function listLines(sb: Sb, tenantId: string, f: LineFilter = {}): Promise<WriteResult<LineView[]>> {
  let q = sb.from("value_lines").select(COLUMNS).eq("tenant_id", tenantId).order("created_at", { ascending: false }).limit(2000);
  if (f.companyId) q = q.eq("company_id", f.companyId);
  if (f.contractId) q = q.eq("contract_id", f.contractId);
  if (f.proposalId) q = q.eq("proposal_id", f.proposalId);
  if (f.kind) q = q.eq("kind", f.kind);
  const { data, error } = await q;
  if (error) return fail(error);
  const { views } = await classifyAll(sb, tenantId, (data ?? []) as LineRow[]);
  return { ok: true, value: f.bucket ? views.filter((v) => v.bucket === f.bucket) : views };
}

export interface LineDetail extends LineView {
  history: Array<{ event_type: string; reference: string | null; occurred_on: string | null; reason: string | null; actor_email: string; created_at: string }>;
}

export async function getLine(sb: Sb, tenantId: string, id: string): Promise<WriteResult<LineDetail>> {
  const { data, error } = await sb.from("value_lines").select(COLUMNS).eq("id", id).eq("tenant_id", tenantId).maybeSingle();
  if (error) return fail(error);
  if (!data) return { ok: false, status: 404, error: "Line not found" };
  const { views } = await classifyAll(sb, tenantId, [data as LineRow]);
  const events = await loadEvents(sb, [id]);
  return { ok: true, value: { ...views[0], history: [...events].reverse().map(({ line_id: _l, ...e }) => e) } };
}

export async function createLine(sb: Sb, tenantId: string, companyId: string, input: LineInput, actorEmail: string): Promise<WriteResult<{ id: string; warnings: string[] }>> {
  if (!actorEmail) return { ok: false, status: 403, error: "A signed-in person is required." };
  const problems = validateLine(input);
  if (problems.length > 0) return { ok: false, status: 400, error: problems.join("; ") };
  const warnings: string[] = [];

  const { data: company } = await sb.from("companies").select("id").eq("id", companyId).eq("tenant_id", tenantId).maybeSingle();
  if (!company) return { ok: false, status: 404, error: "Company not found" };
  if (input.contract_id) {
    const { data: c } = await sb.from("contracts").select("id, company_id, status").eq("id", input.contract_id).eq("tenant_id", tenantId).maybeSingle();
    if (!c) return { ok: false, status: 404, error: "Contract not found" };
    if (c.company_id !== companyId) return { ok: false, status: 409, error: "That contract is not linked to this company." };
    if (c.status === "draft") warnings.push("The contract is still a draft: this line is recorded but not counted as revenue until the contract is in force.");
  }
  if (input.proposal_id) {
    const { data: p } = await sb.from("proposals").select("id, company_id").eq("id", input.proposal_id).eq("tenant_id", tenantId).maybeSingle();
    if (!p) return { ok: false, status: 404, error: "Proposal not found" };
    if (p.company_id && p.company_id !== companyId) return { ok: false, status: 409, error: "That proposal belongs to another company." };
  }

  let reference = input.club_reference_value === undefined || input.club_reference_value === null ? null : money(input.club_reference_value);
  let referenceBasis: string | null = reference === null ? null : "entered";
  if (input.kind === "barter" && input.barter_item_id) {
    const { data: item } = await sb.from("barter_items").select("id, current_price").eq("id", input.barter_item_id).eq("tenant_id", tenantId).maybeSingle();
    if (!item) return { ok: false, status: 404, error: "That barter wishlist item was not found." };
    if (reference === null && item.current_price !== null && Number(item.current_price) > 0) { reference = money(item.current_price); referenceBasis = "wishlist_price"; warnings.push(`The club reference value was taken from the wishlist item's current price (${reference}).`); }
  }
  if (input.kind === "barter" && reference === null) warnings.push("No club reference value: savings cannot be counted for this barter line until one is known.");

  const { data, error } = await sb.from("value_lines").insert({
    tenant_id: tenantId, company_id: companyId, proposal_id: input.proposal_id ?? null, contract_id: input.contract_id ?? null, kind: input.kind, label: input.label!.trim(),
    amount_brl: money(input.amount_brl), due_date: input.due_date ?? null, barter_item_id: input.kind === "barter" ? input.barter_item_id ?? null : null,
    club_reference_value: reference, reference_basis: referenceBasis, created_by: actorEmail,
  }).select("id").single();
  if (error) return fail(error);
  return { ok: true, value: { id: data.id, warnings } };
}

export async function recordEvent(sb: Sb, tenantId: string, id: string, input: EventInput, actorEmail: string): Promise<WriteResult<{ status: LineStatus }>> {
  if (!actorEmail) return { ok: false, status: 403, error: "A signed-in person is required." };
  const line = await getLine(sb, tenantId, id);
  if (!line.ok) return line;
  const l = line.value;
  if (!l.actions.includes(input.action)) return { ok: false, status: 409, error: `A ${l.status} ${l.kind} line cannot be ${input.action === "void" ? "voided" : input.action === "invoice" ? "invoiced" : "settled"}. Allowed now: ${l.actions.join(", ") || "nothing"}.` };
  const problems = validateEvent(input, todayStr());
  if (problems.length > 0) return { ok: false, status: 400, error: problems.join("; ") };
  if ((input.action === "invoice" || input.action === "settle")) {
    if (!l.contract_id) return { ok: false, status: 409, error: "A proposed amount is not revenue: it has to be on a contract before it is invoiced or settled." };
    if (l.bucket === "draft_contract") return { ok: false, status: 409, error: "The contract is still a draft: a draft deal is not revenue." };
    if (l.bucket === "lapsed") return { ok: false, status: 409, error: `The contract is "${l.contract_status}", not in force.` };
  }
  const event = input.action === "invoice" ? "invoiced" : input.action === "settle" ? "settled" : "voided";
  const { error } = await sb.from("value_line_events").insert({
    tenant_id: tenantId, line_id: id, event_type: event, reference: input.reference?.trim() || null, occurred_on: input.occurredOn ?? null, reason: input.reason?.trim() || null, actor_email: actorEmail,
  });
  if (error) return { ok: false, status: /not revenue|not in force|already|voided|future|different/.test(error.message) ? 409 : 500, error: error.message };
  return { ok: true, value: { status: deriveLineStatus([{ event_type: event, created_at: new Date().toISOString() }]) } };
}

/**
 * When a contract is created from a proposal, the proposal's lines move onto it: the same rows, so
 * what was proposed becomes contracted without being counted twice. Safe to run again.
 */
export async function linkProposalLines(sb: Sb, tenantId: string, proposalId: string, contractId: string, companyId: string | null): Promise<{ linked: number }> {
  if (!companyId) return { linked: 0 };
  const { data, error } = await sb.from("value_lines").update({ contract_id: contractId }).eq("tenant_id", tenantId).eq("proposal_id", proposalId).eq("company_id", companyId).is("contract_id", null).select("id");
  return error ? { linked: 0 } : { linked: (data ?? []).length };
}

// ── the summary ─────────────────────────────────────────────────────────────

export async function loadSummary(sb: Sb, tenantId: string, f: { companyId?: string | null } = {}): Promise<WriteResult<FinanceSummary>> {
  const settings = await loadSettings(sb, tenantId);
  if (!settings.ok) return settings;
  let q = sb.from("value_lines").select(COLUMNS).eq("tenant_id", tenantId).limit(5000);
  if (f.companyId) q = q.eq("company_id", f.companyId);
  const { data, error } = await q;
  if (error) return fail(error);
  const { lines } = await classifyAll(sb, tenantId, (data ?? []) as LineRow[]);
  let cq = sb.from("contracts").select("id, contract_number, status, total_value_brl").eq("tenant_id", tenantId);
  if (f.companyId) cq = cq.eq("company_id", f.companyId);
  const { data: contracts, error: cErr } = await cq;
  if (cErr) return { ok: false, status: 500, error: cErr.message };
  return {
    ok: true,
    value: summarise({
      lines, settings: settings.value.settings, settingsAreDefault: settings.value.isDefault,
      contracts: ((contracts ?? []) as Array<{ id: string; contract_number: string | null; status: string; total_value_brl: number | string | null }>).map((c) => ({ ...c, total_value_brl: c.total_value_brl === null ? null : Number(c.total_value_brl) })),
    }),
  };
}
