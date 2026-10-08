/**
 * Obligations: what a signed contract commits the club to deliver, as owned, dated work.
 * Pure rules only (no database), so the handoff can be tested without one.
 */

export const OBLIGATION_KINDS = ["deliverable", "onboarding"] as const;
export type ObligationKind = (typeof OBLIGATION_KINDS)[number];

export const OWNER_BASES = ["opportunity_owner", "handoff_actor", "tenant_admin", "assigned"] as const;
export type OwnerBasis = (typeof OWNER_BASES)[number];

export type ObligationStatus = "open" | "delivered" | "evidenced" | "accepted" | "waived";
export type ObligationAction = "deliver" | "evidence" | "accept" | "waive" | "reopen";
export type EvidenceKind = "link" | "file" | "statement";

export interface EventRow {
  event_type: "delivered" | "evidenced" | "accepted" | "waived" | "reopened";
  created_at: string;
}

// ── what the club does for every sponsor, and when ──────────────────────────

/** Standard onboarding steps. The offset is days after the contract starts. */
export const STANDARD_OBLIGATIONS: ReadonlyArray<{ code: string; title: string; offsetDays: number }> = [
  { code: "signed-contract-and-invoice", title: "Enviar contrato assinado e nota fiscal ao patrocinador", offsetDays: 7 },
  { code: "billing-schedule", title: "Confirmar dados de faturamento e cronograma de pagamento", offsetDays: 7 },
  { code: "kickoff-meeting", title: "Agendar reunião de kickoff com o time do patrocinador", offsetDays: 14 },
  { code: "season-activation-calendar", title: "Compartilhar calendário de ativações da temporada", offsetDays: 14 },
];

export function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

// ── who owns it ─────────────────────────────────────────────────────────────

export interface OwnerChoice { email: string; basis: OwnerBasis }

const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

/**
 * The default-owner rule, in order: the owner of the opportunity the contract came from; else the
 * person who triggered the handoff; else the tenant's first active admin. Nothing is ever left
 * ownerless: when none of the three exists the handoff refuses instead.
 */
export function resolveOwner(c: { opportunityOwner?: string | null; actorEmail?: string | null; tenantAdmin?: string | null }): OwnerChoice | null {
  const ok = (e?: string | null) => (e && EMAIL.test(e.trim()) ? e.trim().toLowerCase() : null);
  const opp = ok(c.opportunityOwner);
  if (opp) return { email: opp, basis: "opportunity_owner" };
  const actor = ok(c.actorEmail);
  if (actor) return { email: actor, basis: "handoff_actor" };
  const admin = ok(c.tenantAdmin);
  if (admin) return { email: admin, basis: "tenant_admin" };
  return null;
}

// ── what gets created ───────────────────────────────────────────────────────

export interface PlannedObligation {
  source_key: string;
  kind: ObligationKind;
  title: string;
  quantity: number | null;
  unit: string | null;
  allocation_id: string | null;
  due_date: string;
  due_basis: string;
}

export interface PlanInput {
  startDate: string | null;
  endDate: string | null;
  allocations: Array<{ allocation_id: string; inventory_name: string | null; quantity: number; unit: string | null }>;
  /** the free-text deliverables written into the proposal, used only when no allocation exists */
  deliverables: string[];
  titleForAllocation: (a: { inventory_name: string | null; quantity: number; unit: string | null }) => string;
}

/** A short stable key for a deliverable written as text, so a rerun recognises it. */
export function deliverableKey(text: string): string {
  let h = 5381;
  for (const ch of text.trim().toLowerCase().replace(/\s+/g, " ")) h = ((h << 5) + h + ch.charCodeAt(0)) >>> 0;
  return `deliverable:${h.toString(36)}`;
}

/**
 * Plans the obligations a contract creates. Every one gets a date: onboarding steps from the
 * contract start, deliverables by the contract end (an allocation has no dates of its own yet).
 * A contract without both dates plans nothing and says why.
 */
export function planObligations(input: PlanInput): { ok: true; items: PlannedObligation[] } | { ok: false; problems: string[] } {
  const problems: string[] = [];
  if (!input.startDate) problems.push("the contract has no start date");
  if (!input.endDate) problems.push("the contract has no end date");
  if (input.startDate && input.endDate && input.endDate < input.startDate) problems.push("the contract ends before it starts");
  if (problems.length > 0 || !input.startDate || !input.endDate) return { ok: false, problems };

  const items: PlannedObligation[] = STANDARD_OBLIGATIONS.map((s) => {
    const due = addDays(input.startDate!, s.offsetDays);
    const clamped = due > input.endDate! ? input.endDate! : due;
    return {
      source_key: `standard:${s.code}`, kind: "onboarding" as const, title: s.title, quantity: null, unit: null, allocation_id: null,
      due_date: clamped, due_basis: `contract start + ${s.offsetDays} days`,
    };
  });

  if (input.allocations.length > 0) {
    for (const a of input.allocations) {
      items.push({
        source_key: `allocation:${a.allocation_id}`, kind: "deliverable", title: input.titleForAllocation(a), quantity: a.quantity > 0 ? a.quantity : null,
        unit: a.unit, allocation_id: a.allocation_id, due_date: input.endDate, due_basis: "contract end date",
      });
    }
  } else {
    const seen = new Set<string>();
    for (const d of input.deliverables.map((x) => x.trim()).filter(Boolean)) {
      const key = deliverableKey(d);
      if (seen.has(key)) continue;
      seen.add(key);
      items.push({ source_key: key, kind: "deliverable", title: `Entregar: ${d}`, quantity: null, unit: null, allocation_id: null, due_date: input.endDate, due_basis: "contract end date" });
    }
  }
  return { ok: true, items };
}

// ── status, derived from the event history ──────────────────────────────────

export function deriveStatus(events: EventRow[]): ObligationStatus {
  let status: ObligationStatus = "open";
  const ordered = events.map((e, i) => ({ e, i })).sort((a, b) => Date.parse(a.e.created_at) - Date.parse(b.e.created_at) || a.i - b.i);
  for (const { e } of ordered) {
    if (e.event_type === "delivered") status = "delivered";
    else if (e.event_type === "evidenced") status = "evidenced";
    else if (e.event_type === "accepted") status = "accepted";
    else if (e.event_type === "waived") status = "waived";
    else if (e.event_type === "reopened") status = "open";
  }
  return status;
}

const TRANSITIONS: Record<ObligationStatus, Partial<Record<ObligationAction, EventRow["event_type"]>>> = {
  open: { deliver: "delivered", waive: "waived" },
  delivered: { evidence: "evidenced", waive: "waived", reopen: "reopened" },
  evidenced: { evidence: "evidenced", accept: "accepted", waive: "waived", reopen: "reopened" },
  accepted: { reopen: "reopened" },
  waived: { reopen: "reopened" },
};

export const allowedActions = (s: ObligationStatus): ObligationAction[] => Object.keys(TRANSITIONS[s]) as ObligationAction[];
export const eventFor = (s: ObligationStatus, a: ObligationAction) => TRANSITIONS[s][a] ?? null;

/** Proof of delivery exists (or the commitment was knowingly set aside). */
export const isProven = (s: ObligationStatus) => s === "evidenced" || s === "accepted" || s === "waived";

/** Not yet due, due soon, or late: only for work that is not done. */
export function timing(dueDate: string, status: ObligationStatus, today: string): "done" | "overdue" | "due_soon" | "upcoming" {
  if (status === "accepted" || status === "waived" || status === "evidenced") return "done";
  if (dueDate < today) return "overdue";
  return dueDate <= addDays(today, 14) ? "due_soon" : "upcoming";
}

// ── events ──────────────────────────────────────────────────────────────────

export interface EventInput {
  action: ObligationAction;
  note?: string | null;
  reason?: string | null;
  evidenceKind?: string | null;
  evidenceRef?: string | null;
}

/** What is wrong with a requested event, if anything. */
export function validateEvent(i: EventInput): string[] {
  const problems: string[] = [];
  if ((i.action === "waive" || i.action === "reopen") && (!i.reason || i.reason.trim().length < 5)) problems.push(`a reason (5+ characters) is required to ${i.action}`);
  if (i.action === "evidence") {
    const ref = i.evidenceRef?.trim() ?? "";
    if (i.evidenceKind !== "link" && i.evidenceKind !== "file" && i.evidenceKind !== "statement") problems.push("evidence_kind must be link, file or statement");
    else if (!ref) problems.push("evidence_ref is required");
    else if (i.evidenceKind === "statement") { if (ref.length < 20) problems.push("a written statement needs 20+ characters saying what was delivered, when and how it was confirmed"); }
    else if (!/^https?:\/\/\S+$/i.test(ref)) problems.push(`evidence_ref must be a web address for a ${i.evidenceKind}`);
  }
  return problems;
}

/** How strong the proof is: an attached record, or only a person's word. */
export function evidenceStrength(kind: string | null | undefined): "attached" | "stated" | "none" {
  if (kind === "link" || kind === "file") return "attached";
  if (kind === "statement") return "stated";
  return "none";
}

// ── the old checklist, which lived inside the proposal ──────────────────────

export interface LegacyTask { id: string; title: string; status: "pending" | "done"; created_at: string; completed_at: string | null; allocation_id?: string | null }

/** A task already ticked in the old checklist that matches this obligation, if any. */
export function matchingLegacyDone(legacy: LegacyTask[], o: { title: string; allocation_id: string | null }): LegacyTask | null {
  const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");
  return legacy.find((t) => t.status === "done" && ((o.allocation_id && t.allocation_id === o.allocation_id) || norm(t.title) === norm(o.title))) ?? null;
}

/** The checklist the proposal page and portal still read, rebuilt from obligations so there is one truth. */
export function legacyProjection(rows: Array<{ id: string; title: string; created_at: string; allocation_id: string | null; status: ObligationStatus; doneAt: string | null }>): LegacyTask[] {
  return rows.map((r) => ({
    id: r.id, title: r.title, status: r.status === "open" ? "pending" : "done", created_at: r.created_at,
    completed_at: r.status === "open" ? null : r.doneAt, allocation_id: r.allocation_id,
  }));
}
