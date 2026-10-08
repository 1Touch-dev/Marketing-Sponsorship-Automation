import type { TaskSourceAdapter } from "./adapter";
import { NO_EXTERNAL_TASKS } from "./adapter";
import { noExternalTasks } from "./adapters/none";

/**
 * Which adapter the platform uses. Chosen by TASK_SOURCE_SYSTEM; until the club decides (X-13) it is "none", and obligations
 * are the only task list. To connect a real tool: write its adapter (lib/tasks/adapters/<tool>.ts, implementing
 * TaskSourceAdapter, passing tests/helpers/adapter-contract.ts), add it to ADAPTERS below, and set TASK_SOURCE_SYSTEM.
 * See docs/TASK_SOURCE_HANDOVER_FOR_YASH.md.
 */
export const ADAPTERS: Record<string, () => TaskSourceAdapter> = {
  [NO_EXTERNAL_TASKS]: () => noExternalTasks,
};

export function configuredSystem(): string {
  return (process.env.TASK_SOURCE_SYSTEM || NO_EXTERNAL_TASKS).trim().toLowerCase();
}

export function adapterFor(system = configuredSystem()): { ok: true; adapter: TaskSourceAdapter } | { ok: false; error: string } {
  const make = ADAPTERS[system];
  if (!make) return { ok: false, error: `The task system "${system}" is selected, but no adapter for it has been written yet. Obligations stay the only task list until it is (decision X-13).` };
  return { ok: true, adapter: make() };
}
