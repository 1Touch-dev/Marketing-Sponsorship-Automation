import { enqueuePipedriveSync } from "../pipedrive/sync";
import { enqueueTwentySync, isTwentyConfigured } from "../twenty/sync";
import type { PushContext } from "../pipedrive/adapter";
import type { CrmSyncOpts, CrmSyncResult } from "./types";

export type { CrmSyncOpts, CrmSyncResult };

/**
 * The entry point the rest of the app uses when a record changed. Pipedrive is always offered the change first (today's
 * behaviour). Twenty is a second, independent push when `TWENTY_API_KEY` is set. A Twenty failure never changes the
 * Pipedrive result or throws to the caller.
 */
export async function enqueueCrmSync(opts: CrmSyncOpts, ctx: PushContext): Promise<CrmSyncResult & { twenty_result?: CrmSyncResult }> {
  const pipedrive = await enqueuePipedriveSync(opts, ctx);
  if (!isTwentyConfigured()) return pipedrive;
  try {
    const twenty_result = await enqueueTwentySync(opts, ctx);
    return { ...pipedrive, twenty_result };
  } catch (e) {
    return { ...pipedrive, twenty_result: { sync_status: "failed", result: { error: e instanceof Error ? e.message : String(e) } } };
  }
}
