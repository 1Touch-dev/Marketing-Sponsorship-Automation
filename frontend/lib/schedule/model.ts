/**
 * Dependencies and date changes. Pure rules only (no database).
 *
 * A dependency says one obligation waits on another ("finish to start"): the predecessor is due
 * on or before its successor. Moving a date therefore has consequences: later work may now be
 * due before the work it waits on, or fall outside the contract or project period. This file
 * works out what, and whose, before anything is changed.
 */
import { addDays } from "../obligations/model";

export type DateField = "due_date" | "period_start" | "period_end" | "target_date";

export interface Edge { obligation_id: string; predecessor_id: string }

export interface Node {
  id: string;
  title: string;
  owner_email: string;
  /** the date in force (the original, or the latest move) */
  due: string;
  /** accepted, waived or evidenced: finished, so a date no longer applies */
  finished: boolean;
}

// ── defaults the handoff sets up ────────────────────────────────────────────

/**
 * The usual order of onboarding work, as (step, waits on). Every sold item waits on the season
 * activation calendar. By construction a predecessor is never due after its successor.
 */
export const STANDARD_DEPENDENCIES: ReadonlyArray<{ step: string; waitsOn: string }> = [
  { step: "standard:billing-schedule", waitsOn: "standard:signed-contract-and-invoice" },
  { step: "standard:kickoff-meeting", waitsOn: "standard:signed-contract-and-invoice" },
  { step: "standard:season-activation-calendar", waitsOn: "standard:kickoff-meeting" },
];
export const DELIVERABLES_WAIT_ON = "standard:season-activation-calendar";

/** The (successor key, predecessor key) pairs to create for a set of source keys. */
export function plannedDependencies(sourceKeys: string[]): Array<{ successor: string; predecessor: string }> {
  const have = new Set(sourceKeys);
  const out: Array<{ successor: string; predecessor: string }> = [];
  for (const d of STANDARD_DEPENDENCIES) if (have.has(d.step) && have.has(d.waitsOn)) out.push({ successor: d.step, predecessor: d.waitsOn });
  if (have.has(DELIVERABLES_WAIT_ON)) {
    for (const k of sourceKeys) if (k.startsWith("allocation:") || k.startsWith("deliverable:")) out.push({ successor: k, predecessor: DELIVERABLES_WAIT_ON });
  }
  return out;
}

// ── the graph ───────────────────────────────────────────────────────────────

/** Everything that (directly or through others) waits on `id`, nearest first. */
export function downstreamOf(edges: Edge[], id: string): Array<{ id: string; depth: number }> {
  const out: Array<{ id: string; depth: number }> = [];
  const seen = new Set<string>([id]);
  let frontier = [id];
  for (let depth = 1; frontier.length > 0; depth++) {
    const next: string[] = [];
    for (const f of frontier) {
      for (const e of edges) {
        if (e.predecessor_id === f && !seen.has(e.obligation_id)) { seen.add(e.obligation_id); next.push(e.obligation_id); out.push({ id: e.obligation_id, depth }); }
      }
    }
    frontier = next;
  }
  return out;
}

/** The direct predecessors of `id`. */
export const predecessorsOf = (edges: Edge[], id: string): string[] => edges.filter((e) => e.obligation_id === id).map((e) => e.predecessor_id);

/** True when making `successor` wait on `predecessor` would close a loop. */
export function wouldCycle(edges: Edge[], successor: string, predecessor: string): boolean {
  if (successor === predecessor) return true;
  // a loop exists when `successor` is already reachable by following "waits on" from `predecessor`
  return downstreamOf(edges, successor).some((d) => d.id === predecessor);
}

// ── impact of moving one obligation's date ──────────────────────────────────

export type ConflictKind = "before_predecessor" | "successor_before_this" | "after_contract_end" | "after_project_end";

export interface Conflict { kind: ConflictKind; id: string | null; message: string }

export interface AffectedWork { id: string; title: string; owner_email: string; due: string; depth: number; finished: boolean; becomes_late: boolean; suggested_due: string | null }

export interface ObligationImpact {
  subject: { id: string; title: string; owner_email: string; current_due: string; new_due: string; direction: "later" | "earlier" };
  downstream: AffectedWork[];
  waiting_on: Array<{ id: string; title: string; owner_email: string; due: string }>;
  conflicts: Conflict[];
  /** conflicts a cascade resolves by moving the later work too */
  resolved_by_cascade: number;
  owners: string[];
  needs_acknowledgement: boolean;
}

export interface ImpactContext {
  nodes: Node[];
  edges: Edge[];
  contractEnd: string | null;
  projectEnd: string | null;
}

/** What moving obligation `id` to `newDue` does to the work around it, and who owns it. */
export function impactOfObligationMove(ctx: ImpactContext, id: string, newDue: string): ObligationImpact | null {
  const byId = new Map(ctx.nodes.map((n) => [n.id, n]));
  const subject = byId.get(id);
  if (!subject) return null;

  const conflicts: Conflict[] = [];
  const downstream: AffectedWork[] = downstreamOf(ctx.edges, id)
    .map(({ id: did, depth }) => {
      const n = byId.get(did);
      if (!n) return null;
      const late = !n.finished && n.due < newDue;
      return { id: n.id, title: n.title, owner_email: n.owner_email, due: n.due, depth, finished: n.finished, becomes_late: late, suggested_due: late ? newDue : null };
    })
    .filter((x): x is AffectedWork => !!x);

  for (const d of downstream) {
    if (d.becomes_late) conflicts.push({ kind: "successor_before_this", id: d.id, message: `"${d.title}" (${d.owner_email}) is due ${d.due}, before the new date ${newDue}` });
  }
  const resolvedByCascade = conflicts.length;

  const waitingOn = predecessorsOf(ctx.edges, id).map((p) => byId.get(p)).filter((n): n is Node => !!n).map((n) => ({ id: n.id, title: n.title, owner_email: n.owner_email, due: n.due, finished: n.finished }));
  for (const p of waitingOn) {
    if (!p.finished && p.due > newDue) conflicts.push({ kind: "before_predecessor", id: p.id, message: `it would be due before "${p.title}" (${p.owner_email}), due ${p.due}, which it waits on` });
  }
  if (ctx.contractEnd && newDue > ctx.contractEnd) conflicts.push({ kind: "after_contract_end", id: null, message: `${newDue} is after the contract ends (${ctx.contractEnd})` });
  if (ctx.projectEnd && newDue > ctx.projectEnd) conflicts.push({ kind: "after_project_end", id: null, message: `${newDue} is after the delivery period ends (${ctx.projectEnd})` });

  const owners = [...new Set([subject.owner_email, ...downstream.filter((d) => !d.finished).map((d) => d.owner_email), ...waitingOn.filter((p) => !p.finished).map((p) => p.owner_email)])].sort();
  return {
    subject: { id, title: subject.title, owner_email: subject.owner_email, current_due: subject.due, new_due: newDue, direction: newDue > subject.due ? "later" : "earlier" },
    downstream, waiting_on: waitingOn.map(({ finished: _f, ...rest }) => rest), conflicts, resolved_by_cascade: resolvedByCascade, owners,
    needs_acknowledgement: conflicts.length > 0,
  };
}

/** Conflicts still standing once a cascade has moved the later work. */
export const unresolvedAfterCascade = (impact: ObligationImpact): Conflict[] => impact.conflicts.filter((c) => c.kind !== "successor_before_this");

// ── impact of moving a project's date ───────────────────────────────────────

export interface ProjectImpact {
  field: DateField;
  current: string;
  new_value: string;
  affected: Array<{ id: string; title: string; owner_email: string; due: string }>;
  conflicts: Conflict[];
  owners: string[];
  needs_acknowledgement: boolean;
}

/**
 * What moving a delivery project's period (or a sales project's target date) does. Pulling the end
 * earlier leaves unfinished work due after it; pushing it past the contract end is flagged.
 */
export function impactOfProjectMove(ctx: {
  type: "commercial" | "delivery"; field: DateField; current: string; newValue: string; periodStart: string | null; periodEnd: string | null;
  contractEnd: string | null; work: Node[]; owner_email: string;
}): ProjectImpact {
  const conflicts: Conflict[] = [];
  const affected: ProjectImpact["affected"] = [];
  if (ctx.type === "delivery" && ctx.field === "period_end") {
    for (const w of ctx.work) {
      if (!w.finished && w.due > ctx.newValue) {
        affected.push({ id: w.id, title: w.title, owner_email: w.owner_email, due: w.due });
        conflicts.push({ kind: "after_project_end", id: w.id, message: `"${w.title}" (${w.owner_email}) is due ${w.due}, after the new end ${ctx.newValue}` });
      }
    }
    if (ctx.contractEnd && ctx.newValue > ctx.contractEnd) conflicts.push({ kind: "after_contract_end", id: null, message: `${ctx.newValue} is after the contract ends (${ctx.contractEnd})` });
  }
  if (ctx.type === "delivery" && ctx.field === "period_start" && ctx.periodEnd && ctx.newValue > ctx.periodEnd) {
    conflicts.push({ kind: "after_project_end", id: null, message: `the new start ${ctx.newValue} is after the period end ${ctx.periodEnd}` });
  }
  const owners = [...new Set([ctx.owner_email, ...affected.map((a) => a.owner_email)])].sort();
  return { field: ctx.field, current: ctx.current, new_value: ctx.newValue, affected, conflicts, owners, needs_acknowledgement: conflicts.length > 0 };
}

// ── what may be moved, and to what ──────────────────────────────────────────

const ISO = /^\d{4}-\d{2}-\d{2}$/;
export const isIsoDate = (s: unknown): s is string => typeof s === "string" && ISO.test(s) && !Number.isNaN(Date.parse(`${s}T00:00:00Z`)) && addDays(s, 0) === s;

/** What is wrong with a requested date move, if anything. */
export function validateMove(i: { current: string; newValue: string | null | undefined; reason: string | null | undefined }): string[] {
  const problems: string[] = [];
  if (!isIsoDate(i.newValue)) problems.push("the new date must be a real date written YYYY-MM-DD");
  else if (i.newValue === i.current) problems.push(`the date is already ${i.current}`);
  if (!i.reason || i.reason.trim().length < 5) problems.push("a reason (5+ characters) is required to move a date");
  return problems;
}

export interface ChangeRow { field: string; old_value: string; new_value: string; created_at: string }

/** The date in force: the original, or the newest move. Ties on time fall to the later row given. */
export function effectiveDate(original: string, changes: ChangeRow[]): string {
  let value = original;
  let at = "";
  for (const c of changes) if (c.created_at >= at) { value = c.new_value; at = c.created_at; }
  return value;
}
