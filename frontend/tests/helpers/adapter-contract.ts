import assert from "node:assert/strict";
import type { TaskPayload, TaskSourceAdapter } from "../../lib/tasks/adapter";

/**
 * The contract every task-source adapter must keep. Whoever implements an adapter for a real tool (Pipedrive Projects,
 * Plane...) runs these against it, with a harness that can play "a person in the tool" through that tool's own API.
 * They check exactly the behaviours the platform's sync relies on: a create that is safe to repeat, an update that fails
 * loudly for a task that is gone, and a change feed with stable event ids that can be read again.
 */
export interface ContractHarness {
  adapter: TaskSourceAdapter;
  /** What a person does in the tool. */
  person: { complete(externalId: string): Promise<void>; moveDate(externalId: string, dueDate: string): Promise<void> };
}

export const samplePayload = (n: number, over: Partial<TaskPayload> = {}): TaskPayload => ({
  obligationId: `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`, title: `Install LED ${n}`, description: null, dueDate: "2026-12-01", ownerEmail: "owner@club.com",
  contractNumber: "C-1", companyName: "Sponsor SA", quantity: 1, unit: "per_season", status: "open", ...over,
});

export function adapterContractCases(make: () => Promise<ContractHarness> | ContractHarness): Array<{ name: string; run: () => Promise<void> }> {
  return [
    { name: "creating a task returns the tool's id, and creating it again with the same key returns the same task", run: async () => {
      const { adapter } = await make();
      const a = await adapter.createTask(samplePayload(1), "create:1");
      assert.ok(a.externalId && a.externalId.length > 0);
      const again = await adapter.createTask(samplePayload(1), "create:1");
      assert.equal(again.externalId, a.externalId, "the same key must never make a second task");
    } },
    { name: "different keys make different tasks", run: async () => {
      const { adapter } = await make();
      const a = await adapter.createTask(samplePayload(1), "create:1");
      const b = await adapter.createTask(samplePayload(2), "create:2");
      assert.notEqual(a.externalId, b.externalId);
    } },
    { name: "an update is repeatable with the same key, and an update to a task that no longer exists fails loudly", run: async () => {
      const { adapter } = await make();
      const a = await adapter.createTask(samplePayload(1), "create:1");
      await adapter.updateTask(a.externalId, { dueDate: "2026-12-15" }, "update:1:h1");
      await adapter.updateTask(a.externalId, { dueDate: "2026-12-15" }, "update:1:h1");
      await assert.rejects(() => adapter.updateTask("this-task-does-not-exist", { title: "x" }, "update:x:h"), "a missing task must be an error, not a silent no-op");
    } },
    { name: "what a person does in the tool shows up in the change feed, with a stable id for each event", run: async () => {
      const h = await make();
      const a = await h.adapter.createTask(samplePayload(1), "create:1");
      const before = await h.adapter.pullChanges(null);
      await h.person.complete(a.externalId);
      const first = await h.adapter.pullChanges(before.cursor);
      const completed = first.changes.filter((c) => c.externalId === a.externalId && c.kind === "completed");
      assert.equal(completed.length, 1, "one completion, one event");
      assert.ok(completed[0].eventId && !Number.isNaN(Date.parse(completed[0].at)));
      // reading from the beginning again must show the SAME event with the SAME id
      const all = await h.adapter.pullChanges(null);
      assert.ok(all.changes.some((c) => c.eventId === completed[0].eventId), "an event keeps its id when it is read again");
    } },
    { name: "the cursor moves forward: reading from it again returns nothing new", run: async () => {
      const h = await make();
      const a = await h.adapter.createTask(samplePayload(1), "create:1");
      await h.person.moveDate(a.externalId, "2027-01-10");
      const first = await h.adapter.pullChanges(null);
      assert.ok(first.changes.some((c) => c.kind === "date_changed" && c.detail.dueDate === "2027-01-10"), "a date change carries the new date");
      const next = await h.adapter.pullChanges(first.cursor);
      assert.equal(next.changes.length, 0);
    } },
    { name: "different events have different ids", run: async () => {
      const h = await make();
      const a = await h.adapter.createTask(samplePayload(1), "create:1");
      await h.person.moveDate(a.externalId, "2027-01-10");
      await h.person.complete(a.externalId);
      const { changes } = await h.adapter.pullChanges(null);
      const ids = changes.map((c) => c.eventId);
      assert.equal(new Set(ids).size, ids.length);
      assert.ok(ids.length >= 2);
    } },
  ];
}
