import type { ExternalChange, TaskPayload, TaskSourceAdapter, TaskUpdate } from "../adapter";

/**
 * A complete, honest in-memory adapter: the reference for how a real one behaves, and what the platform's tests run
 * against. It is idempotent on the key, remembers every task, and lets a test play the part of a person using the tool.
 * It can also be told to misbehave (time out after doing the work, repeat events) to prove the platform copes.
 */
export class MemoryTaskTool implements TaskSourceAdapter {
  readonly system: string;
  tasks = new Map<string, { externalId: string; payload: TaskPayload; deleted: boolean }>();
  private byKey = new Map<string, string>();
  private log: Array<ExternalChange & { seq: number }> = [];
  private seq = 0;
  private n = 0;
  calls = { create: 0, update: 0, pull: 0 };
  /** Throw AFTER doing the work, the way a timeout does: the caller cannot tell it worked. */
  failAfterCreate = 0;
  duplicateEvents = false;

  constructor(system = "memory") { this.system = system; }

  async createTask(task: TaskPayload, key: string) {
    this.calls.create++;
    let id = this.byKey.get(key);
    if (!id) {
      id = `${this.system}-${++this.n}`;
      this.byKey.set(key, id);
      this.tasks.set(id, { externalId: id, payload: { ...task }, deleted: false });
    }
    if (this.failAfterCreate > 0) { this.failAfterCreate--; throw new Error("timeout after the task was created"); }
    return { externalId: id, url: `https://tool.example/${id}` };
  }

  async updateTask(externalId: string, patch: TaskUpdate, _key: string) {
    this.calls.update++;
    const t = this.tasks.get(externalId);
    if (!t || t.deleted) throw new Error(`Task ${externalId} no longer exists in ${this.system}`);
    Object.assign(t.payload, Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined)));
  }

  async pullChanges(cursor: string | null) {
    this.calls.pull++;
    const after = cursor ? Number(cursor) : 0;
    const fresh = this.log.filter((c) => c.seq > after);
    const changes = fresh.map(({ seq: _s, ...c }) => c as ExternalChange);
    const out = this.duplicateEvents ? [...changes, ...changes] : changes;
    return { changes: out, cursor: String(this.seq) };
  }

  // ── a person using the tool ──
  private emit(externalId: string, kind: ExternalChange["kind"], by: string, detail: Record<string, unknown> = {}) {
    const seq = ++this.seq;
    this.log.push({ seq, eventId: `${this.system}-evt-${seq}`, externalId, kind, at: new Date().toISOString(), by, detail });
  }
  tick(externalId: string, by = "person@tool.example") { const t = this.tasks.get(externalId)!; t.payload.status = "done"; this.emit(externalId, "completed", by); }
  reopen(externalId: string, by = "person@tool.example") { const t = this.tasks.get(externalId)!; t.payload.status = "open"; this.emit(externalId, "reopened", by); }
  moveDate(externalId: string, dueDate: string, by = "person@tool.example") { this.tasks.get(externalId)!.payload.dueDate = dueDate; this.emit(externalId, "date_changed", by, { dueDate }); }
  rename(externalId: string, title: string, by = "person@tool.example") { this.tasks.get(externalId)!.payload.title = title; this.emit(externalId, "renamed", by, { title }); }
  reassign(externalId: string, ownerEmail: string, by = "person@tool.example") { this.tasks.get(externalId)!.payload.ownerEmail = ownerEmail; this.emit(externalId, "reassigned", by, { ownerEmail }); }
  remove(externalId: string, by = "person@tool.example") { this.tasks.get(externalId)!.deleted = true; this.emit(externalId, "deleted", by); }
  /** A change for a task this platform never created (someone's own task in the same tool). */
  strangerEvent(by = "someone@tool.example") { this.emit("someone-elses-task", "completed", by); }
}
