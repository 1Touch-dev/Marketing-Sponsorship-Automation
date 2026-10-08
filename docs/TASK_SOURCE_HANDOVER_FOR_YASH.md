# Task source of truth: what is built, what you decide, what you implement

For Yash. Covers task 22 (canonical task adapter) and decision X-13.

## The short version

- **Obligations stay canonical in the sponsorship platform, whichever tool you choose.** An obligation is a promised, owned, dated deliverable linked to its proof. The outside tool (Pipedrive Projects, Plane) holds a *working copy* the delivery team ticks off. It never decides what was sold, when it is due, or whether it was delivered.
- **The platform side is built and tested.** You do not touch obligations, sync state, ownership rules or the inbox. You write one file that talks to your tool.
- **What you decide (X-13):** which tool. What you build: its adapter, about 100 to 200 lines, plus running a provided test suite against it.
- Until you do, `TASK_SOURCE_SYSTEM` is `none`: nothing leaves, nothing comes in, obligations are the only task list.

## What is already built (do not rebuild)

| Piece | Where | What it does |
|---|---|---|
| Adapter contract | `frontend/lib/tasks/adapter.ts` | The interface you implement. |
| Push | `lib/tasks/sync.ts` `pushObligations` | Sends signed, in-force deliverables to your adapter. Finds existing tasks by stable link, never creates twice, skips unchanged ones, survives a timeout after your tool created the task, reports each failure by obligation. |
| Pull | `lib/tasks/sync.ts` `pullChanges` | Reads your change feed into an inbox. Dedupes by your event id, keeps a cursor, stores events for tasks it never made as "unmapped" and creates nothing. |
| Inbox | `task_sync_inbox` (migration 0072), `/api/task-sync/inbox` | What your tool reported, for a person to read. A person applies a completion (it becomes a *delivered* mark under their name, and someone else still has to accept it with proof) or dismisses with a reason. |
| Stable links | `external_refs` (migration 0069), `lib/sync/external-refs.ts` | obligation id ↔ your task id. One live link per task and per obligation; unlinking needs a reason. |
| Field ownership | `lib/sync/field-ownership.ts` | Every field of an obligation is the platform's. A date, title or owner change reported by your tool is recorded with the reason it is refused, never applied. |
| Guards | `tests/db/task-sync.test.ts` | Fail the build if a task-like table appears, if an adapter imports anything that can write an obligation, or if the sync changes an obligation anywhere except applying a person-confirmed completion. |
| Routes | `/api/task-sync/{status,push,pull,inbox,inbox/<id>/apply,inbox/<id>/dismiss}` | Permission `manage_obligations`. |

## Why the inbox, and not "just sync it back"

If a tool can mark an obligation done, then "done" means whatever someone clicked, and the platform's promise (delivery is proven by attached evidence that a *second* person accepted) is gone. So an inbound change is a *report*, not a write. A completion becomes a delivered mark only when a named person confirms it, and acceptance still needs a different person plus proof. Date and name changes are made on the platform's own screens, which ask for a reason and show which other work depends on the date (task 17).

## What you decide: X-13

| | Pipedrive Projects | Plane | Custom (no outside tool) |
|---|---|---|---|
| Fit | Same system as the CRM, one login for the sales team. | Purpose-built task tool; self-hostable. | Obligations only, delivery team works inside the platform. |
| Idempotent create | To verify: Pipedrive does not take an idempotency key. The adapter must keep our key in a custom field and look it up before creating. | To verify in the current API: issues carry `external_id` and `external_source` fields, which would make "create with our key" natural. | Not needed. |
| Change feed | To verify: webhooks or polling the changes endpoints. | To verify: webhooks or polling `updated_at`. | None. |
| Risk | A second place that looks like a task list. The guards above are there for exactly this. | One more system to run and back up. | Delivery team has no external tool. |

Whatever you pick, the interface is the same. The platform does not care.

Please check the "to verify" cells against the vendors' current API documentation before relying on them; they are my reading of what to look for, not tested facts.

## What you implement

`frontend/lib/tasks/adapter.ts`:

```ts
interface TaskSourceAdapter {
  readonly system: string;                                         // "pipedrive" | "plane"
  createTask(task: TaskPayload, idempotencyKey: string): Promise<{ externalId: string; url?: string | null }>;
  updateTask(externalId: string, patch: TaskUpdate, idempotencyKey: string): Promise<void>;
  pullChanges(cursor: string | null): Promise<{ changes: ExternalChange[]; cursor: string | null }>;
}
```

Behaviours the platform relies on (the contract tests check each):

1. **`createTask` is idempotent on the key.** Same key twice returns the same `externalId` and creates nothing. We *will* repeat a create whose answer we never saw.
2. **`updateTask` is repeatable with the same key, and fails loudly if the task is gone.** No silent no-op.
3. **`pullChanges` returns events oldest first, each with a stable `eventId`** (the same event read again has the same id), an ISO `at`, `by` as the tool names the person, and the new value in `detail` (`{ dueDate }`, `{ title }`, `{ ownerEmail }`). Return a cursor to pass next time. Returning an event more than once is fine; changing its id is not.
4. Event kinds: `completed`, `reopened`, `date_changed`, `renamed`, `reassigned`, `deleted`.
5. **Do not import anything from `lib/obligations`, `lib/projects`, `lib/schedule`, `lib/contracts`, `lib/allocations` or the Supabase server client.** An adapter talks to your tool and nothing else. A test enforces this.

What the platform sends (`TaskPayload`): obligation id, title, description, the due date in force, owner email, contract number, company name, quantity and unit, and `status` (`open` or `done`). `done` means *the platform* has it delivered; your tool does not decide it.

## How to add it

1. Write `frontend/lib/tasks/adapters/<tool>.ts` implementing `TaskSourceAdapter`. `lib/tasks/adapters/memory.ts` is a complete reference implementation to copy the shape from.
2. Add it to `ADAPTERS` in `frontend/lib/tasks/registry.ts`.
3. Run the contract suite against it: `adapterContractCases(...)` in `frontend/tests/helpers/adapter-contract.ts`. You supply a small harness that can complete a task and move a date *through the tool's own API* (see `memoryHarness` in `tests/db/task-sync.test.ts`). Run it against a sandbox project of the real tool, not a mock.
4. Set `TASK_SOURCE_SYSTEM=<tool>`, then `POST /api/task-sync/push`, then check `GET /api/task-sync/status`.
5. Schedule push and pull (they are safe to repeat). There is no scheduler on the platform yet; the same job that needs to run the other sweeps (see register T20-05, T25-01).

## What is still open, and whose it is

- **X-13 itself.** Yours.
- **Screens.** The inbox needs a page: pending items, what the tool said, what was refused and why, Apply (completions only) and Dismiss (with a reason). A "linked task" chip on each obligation (from `external_refs`) is useful too. All routes exist.
- **Who runs the schedule, and how often.** Not decided.
- **Deleted in the tool.** A `deleted` event lands in the inbox; the platform never deletes an obligation because a task was deleted. A person decides whether to unlink (`/api/external-refs/<id>/unlink`, reason required) and whether the next push should recreate the task.
- **Backfill.** The first push creates a task for every in-force deliverable. Decide whether the delivery team wants the whole history or only open items before you connect a live tool (`pushObligations` takes a `limit`; filtering to open items is a one-line change in `lib/tasks/sync.ts`).
