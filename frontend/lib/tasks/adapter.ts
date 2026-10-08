/**
 * The contract between the sponsorship platform and whatever outside tool the club uses for day-to-day tasks
 * (Pipedrive Projects, Plane, or none; decision X-13).
 *
 * The one rule behind everything here: OBLIGATIONS STAY CANONICAL IN THIS PLATFORM. The outside tool holds a working copy a
 * team can tick off; it never decides what was sold, when it is due, or whether it was delivered. So an adapter can
 *   - create and update its copy of an obligation (push),
 *   - and report what happened to that copy (pull),
 * and nothing else: it has no way to write an obligation. What it reports lands in a list a person reads (task_sync_inbox)
 * and acts on through the same screens, rules and second-person checks as any other delivery.
 *
 * Whoever implements an adapter for a real tool implements this interface, then runs adapterContractCases() against it
 * (lib/tasks/contract.ts); the platform side (mapping, idempotency, the inbox, the guards) is already done.
 */

/** What the outside tool is told about one obligation. */
export interface TaskPayload {
  obligationId: string;
  title: string;
  description: string | null;
  /** The date in force (a moved date is already applied). */
  dueDate: string;
  ownerEmail: string;
  /** Not the whole contract: just enough for a person in the other tool to know what this is. */
  contractNumber: string | null;
  companyName: string | null;
  quantity: number | null;
  unit: string | null;
  /** "done" once the platform has it delivered with proof; the tool never decides this. */
  status: "open" | "done";
}

export type TaskUpdate = Partial<Pick<TaskPayload, "title" | "description" | "dueDate" | "ownerEmail" | "status">>;

export type ExternalChangeKind = "completed" | "reopened" | "date_changed" | "renamed" | "reassigned" | "deleted";

/** One thing that happened in the outside tool. */
export interface ExternalChange {
  /** The tool's own id for THIS event. The same event delivered twice must carry the same id. */
  eventId: string;
  /** The tool's id for the task it happened to (what createTask returned). */
  externalId: string;
  kind: ExternalChangeKind;
  at: string;
  /** Who did it in the tool, as the tool names them. */
  by: string | null;
  /** The new value, where there is one: { dueDate }, { title }, { ownerEmail }. */
  detail: Record<string, unknown>;
}

export interface TaskSourceAdapter {
  /** The tool's name as it is recorded on links ("pipedrive", "plane"...). */
  readonly system: string;

  /**
   * Creates the tool's copy of an obligation. MUST be idempotent on `idempotencyKey`: calling it again with the same key,
   * after a timeout or a crash, returns the same externalId and creates nothing new. If the tool has no native way to do
   * that, the adapter keeps the key in a field of the task and looks it up first.
   */
  createTask(task: TaskPayload, idempotencyKey: string): Promise<{ externalId: string; url?: string | null }>;

  /** Changes the tool's copy. MUST be safe to repeat with the same key. A task that no longer exists is an error, not a silent no-op. */
  updateTask(externalId: string, patch: TaskUpdate, idempotencyKey: string): Promise<void>;

  /**
   * Changes since `cursor` (null = from the beginning of what the tool still remembers), oldest first, with the cursor to
   * pass next time. May return the same event more than once across calls; each carries a stable eventId.
   */
  pullChanges(cursor: string | null): Promise<{ changes: ExternalChange[]; cursor: string | null }>;
}

/** The platform's choice when no outside tool is connected: nothing leaves, nothing comes in, obligations are the only task list. */
export const NO_EXTERNAL_TASKS = "none";
