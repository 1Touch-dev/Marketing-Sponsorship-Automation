import type { TaskSourceAdapter } from "../adapter";
import { NO_EXTERNAL_TASKS } from "../adapter";

/** No outside task tool is connected (the situation until X-13 is decided): obligations are the task list. */
export const noExternalTasks: TaskSourceAdapter = {
  system: NO_EXTERNAL_TASKS,
  async createTask() { throw new Error("No outside task system is connected."); },
  async updateTask() { throw new Error("No outside task system is connected."); },
  async pullChanges() { return { changes: [], cursor: null }; },
};
