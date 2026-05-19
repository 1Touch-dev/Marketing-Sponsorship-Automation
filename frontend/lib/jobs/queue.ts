/**
 * Background job queue abstraction.
 * Currently backed by Supabase. Can be swapped for BullMQ/Inngest in production.
 */
import { supabaseAdmin } from "@/lib/supabase/server";
import { logger } from "@/lib/monitoring/logger";

export type JobType =
  | "intelligence_scrape"
  | "image_generate"
  | "proposal_generate"
  | "logo_fetch"
  | "campaign_generate"
  | "crm_sync";

export type JobStatus = "queued" | "running" | "done" | "failed" | "retrying";

export type Job = {
  id: string;
  type: JobType;
  payload: Record<string, unknown>;
  status: JobStatus;
  attempts: number;
  max_attempts: number;
  error?: string;
  result?: Record<string, unknown>;
  created_at: string;
  started_at?: string;
  completed_at?: string;
};

const MAX_RETRIES = 3;

/**
 * Queue a job for background processing.
 * Returns the job ID for tracking.
 */
export async function enqueueJob(type: JobType, payload: Record<string, unknown>): Promise<string> {
  const sb = supabaseAdmin();
  const { data, error } = await sb.from("crm_sync_queue" as "companies").insert({
    entity_type: type,
    entity_id: payload.company_id ?? payload.proposal_id ?? "system",
    operation: type,
    payload,
    status: "queued",
    attempts: 0,
    max_attempts: MAX_RETRIES,
  }).select("id").single();

  if (error) {
    logger.error(`Failed to enqueue job: ${type}`, { error: error.message, ...payload as Record<string, string> });
    throw error;
  }

  logger.info(`Job queued: ${type}`, { job_id: (data as Record<string,string>).id, ...payload as Record<string, string> });
  return (data as Record<string,string>).id;
}

/**
 * Process a job with retry logic.
 */
export async function processJob<T>(
  jobId: string,
  handler: () => Promise<T>,
): Promise<T> {
  const sb = supabaseAdmin();
  const startTime = Date.now();

  await sb.from("crm_sync_queue" as "companies")
    .update({ status: "running", started_at: new Date().toISOString() } as unknown as Record<string, unknown>)
    .eq("id", jobId);

  try {
    const result = await handler();
    const duration = Date.now() - startTime;

    await sb.from("crm_sync_queue" as "companies")
      .update({
        status: "synced",
        completed_at: new Date().toISOString(),
        result: result as Record<string, unknown>,
      } as unknown as Record<string, unknown>)
      .eq("id", jobId);

    logger.info(`Job completed`, { job_id: jobId, duration_ms: duration });
    return result;
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    const duration = Date.now() - startTime;

    await sb.from("crm_sync_queue" as "companies")
      .update({
        status: "failed",
        error: errorMsg,
        completed_at: new Date().toISOString(),
      } as unknown as Record<string, unknown>)
      .eq("id", jobId);

    logger.error(`Job failed`, { job_id: jobId, error: errorMsg, duration_ms: duration });
    throw err;
  }
}

/**
 * Get queue statistics.
 */
export async function getQueueStats() {
  const sb = supabaseAdmin();
  const { data } = await sb.from("crm_sync_queue" as "companies")
    .select("status")
    .gte("created_at", new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString());

  const stats: Record<string, number> = {};
  for (const row of (data ?? []) as Array<Record<string,string>>) {
    stats[row.status] = (stats[row.status] ?? 0) + 1;
  }
  return stats;
}
