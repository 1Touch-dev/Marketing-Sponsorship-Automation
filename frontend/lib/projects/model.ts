/**
 * Commercial and delivery projects (Task 15).
 *
 * One schema, two types with different rules. The status is derived from the
 * project's events, and the facts that block completion are read from the
 * records it points at (the opportunity, the contract, the delivery tasks), so
 * a project cannot be declared finished while its own records say otherwise.
 */

export const PROJECT_TYPES = ["commercial", "delivery"] as const;
export type ProjectType = (typeof PROJECT_TYPES)[number];

export type ProjectStatus = "planned" | "active" | "on_hold" | "completed" | "cancelled";
export type ProjectAction = "start" | "pause" | "resume" | "complete" | "cancel";
export type ProjectEventType = "started" | "paused" | "resumed" | "completed" | "cancelled";

/** What each type needs to exist and what it takes to finish. Exposed so a screen can show it. */
export const TYPE_DEFINITIONS: Record<ProjectType, { label: string; summary: string; required: string[]; completion: string[] }> = {
  commercial: {
    label: "Commercial project",
    summary: "The sales side of one opportunity.",
    required: ["an opportunity that is still being worked", "an objective", "a target date", "a next action", "an owner"],
    completion: ["the deal has an outcome: won, lost or closed", "the outcome is written down (why it was won or lost)"],
  },
  delivery: {
    label: "Delivery project",
    summary: "The fulfilment side of one signed contract.",
    required: ["an active contract", "a delivery period (start and end)", "an owner"],
    completion: ["every delivery task is done", "the delivery period has ended, or a reason is given for finishing early"],
  },
};

const EVENT_STATUS: Record<ProjectEventType, ProjectStatus> = {
  started: "active", paused: "on_hold", resumed: "active", completed: "completed", cancelled: "cancelled",
};

export interface EventRow { event_type: ProjectEventType; created_at: string }

/** No events means planned; otherwise the newest event decides. */
export function deriveStatus(events: EventRow[]): ProjectStatus {
  let newest: EventRow | null = null;
  for (const e of events) if (!newest || e.created_at >= newest.created_at) newest = e;
  return newest ? EVENT_STATUS[newest.event_type] : "planned";
}

const TRANSITIONS: Record<ProjectStatus, Partial<Record<ProjectAction, ProjectEventType>>> = {
  planned: { start: "started", cancel: "cancelled" },
  active: { pause: "paused", complete: "completed", cancel: "cancelled" },
  on_hold: { resume: "resumed", cancel: "cancelled" },
  completed: {},
  cancelled: {},
};

export const allowedActions = (status: ProjectStatus): ProjectAction[] => Object.keys(TRANSITIONS[status]) as ProjectAction[];
export const eventFor = (status: ProjectStatus, action: ProjectAction): ProjectEventType | null => TRANSITIONS[status][action] ?? null;
export const isTerminal = (s: ProjectStatus) => s === "completed" || s === "cancelled";

// ── creating ────────────────────────────────────────────────────────────────

export interface ProjectInput {
  type: ProjectType;
  company_id: string;
  title?: string | null;
  description?: string | null;
  owner_email?: string | null;
  opportunity_id?: string | null;
  proposal_id?: string | null;
  contract_id?: string | null;
  objective?: string | null;
  target_date?: string | null;
  next_action?: string | null;
  period_start?: string | null;
  period_end?: string | null;
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const blank = (s: unknown) => typeof s !== "string" || s.trim() === "";

/** The missing or wrong fields for this type, in plain words. Empty when the input is complete. */
export function validateProjectInput(i: ProjectInput, today: string): string[] {
  const problems: string[] = [];
  if (!PROJECT_TYPES.includes(i.type)) return [`type must be one of ${PROJECT_TYPES.join(", ")}`];
  if (blank(i.company_id)) problems.push("company is required");
  if (blank(i.owner_email) || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(String(i.owner_email))) problems.push("an owner (a valid email) is required");

  if (i.type === "commercial") {
    if (blank(i.opportunity_id)) problems.push("a commercial project needs the opportunity it works on");
    if (blank(i.objective)) problems.push("a commercial project needs an objective");
    if (blank(i.next_action)) problems.push("a commercial project needs a next action");
    if (blank(i.target_date) || !DATE_RE.test(String(i.target_date))) problems.push("a commercial project needs a target date (YYYY-MM-DD)");
    else if ((i.target_date as string) < today) problems.push("the target date cannot be in the past");
    if (i.contract_id || i.period_start || i.period_end) problems.push("a commercial project has no contract or delivery period; that belongs to a delivery project");
  } else {
    if (blank(i.contract_id)) problems.push("a delivery project needs the signed contract it delivers");
    for (const f of ["period_start", "period_end"] as const) {
      if (blank(i[f]) || !DATE_RE.test(String(i[f]))) problems.push(`a delivery project needs ${f.replace("_", " ")} (YYYY-MM-DD)`);
    }
    if (DATE_RE.test(String(i.period_start)) && DATE_RE.test(String(i.period_end)) && (i.period_end as string) < (i.period_start as string)) problems.push("the delivery period cannot end before it starts");
    if (i.objective || i.target_date || i.next_action) problems.push("a delivery project has no sales objective, target date or next action; that belongs to a commercial project");
  }
  return problems;
}

// ── completing ──────────────────────────────────────────────────────────────

export interface CompletionFacts {
  type: ProjectType;
  today: string;
  /** Commercial: the derived status of the opportunity. */
  opportunityStatus?: string | null;
  /** Delivery: the contract's status, the end of the delivery period, and delivery tasks still open. */
  contractStatus?: string | null;
  periodEnd?: string | null;
  openTasks?: number;
  /** What the person supplies when completing. */
  outcomeNote?: string | null;
  earlyReason?: string | null;
}

export interface Completion {
  /** Facts that stop it, whatever anyone writes. */
  blockers: string[];
  /** Things the person completing it still has to write. */
  inputs: string[];
}

export function completionCheck(f: CompletionFacts): Completion {
  const blockers: string[] = [];
  const inputs: string[] = [];
  if (f.type === "commercial") {
    if (!f.opportunityStatus) blockers.push("the opportunity this project works on cannot be found");
    else if (f.opportunityStatus === "draft" || f.opportunityStatus === "open") blockers.push(`the deal is still ${f.opportunityStatus}: win it, lose it or close it first`);
    if (!f.outcomeNote || f.outcomeNote.trim().length < 10) inputs.push("an outcome note: why was it won or lost?");
  } else {
    if (f.contractStatus !== "active" && f.contractStatus !== "completed" && f.contractStatus !== "expired") blockers.push(`the contract is "${f.contractStatus ?? "missing"}", not active`);
    if ((f.openTasks ?? 0) > 0) blockers.push(`${f.openTasks} delivery task${f.openTasks === 1 ? " is" : "s are"} still open`);
    const ended = !!f.periodEnd && f.today > f.periodEnd;
    if (!ended && (!f.earlyReason || f.earlyReason.trim().length < 10)) inputs.push(`a reason for finishing early: the delivery period runs until ${f.periodEnd ?? "an unknown date"}`);
  }
  return { blockers, inputs };
}
