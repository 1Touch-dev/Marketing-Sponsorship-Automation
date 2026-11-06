/**
 * Video intro jobs: start a render from one of the proposal's generated images, check on it, and when it is done
 * copy the finished file into our own storage (Replicate's links expire) and record what it cost.
 *
 * Every function takes the tenant id and filters on it, so one tenant can never see or start work on another's data.
 */
import { supabaseAdmin } from "@/lib/supabase/server";
import { recordAudit } from "@/lib/audit/log";
import { recordSpend, checkDailySpendCap } from "@/lib/monitoring/spend-guard";
import type { Actor } from "@/lib/identity/actor";
import { resolveJobImageUrl, type ImageJobRow } from "@/lib/proposals/proposal-images";
import { buildMotionPrompt } from "./motion-prompts";
import {
  createVideoPrediction,
  getVideoPrediction,
  estimateVideoCostUsd,
  normalizeDuration,
  videoModelId,
  VideoRendererError,
} from "./replicate-video";

const STORAGE_BUCKET = "campaign-assets";
/** A render that is still "processing" after this long is treated as lost, so the screen never spins forever. */
export const STALE_AFTER_MS = 20 * 60 * 1000;
const MAX_VIDEO_BYTES = 100 * 1024 * 1024;
/** Videos being rendered at the same time for one tenant. Each one costs money, so this is a brake on a stuck button. */
export const MAX_OPEN_JOBS_PER_TENANT = 4;

export type VideoJob = {
  id: string;
  proposal_id: string | null;
  company_id: string | null;
  source_image_job_id: string | null;
  source_image_url: string;
  prompt: string;
  model: string;
  duration_s: number;
  status: "queued" | "processing" | "completed" | "failed";
  output_url: string | null;
  error_message: string | null;
  cost_estimate_usd: number | null;
  created_at: string;
  completed_at: string | null;
};

const JOB_COLUMNS =
  "id, proposal_id, company_id, source_image_job_id, source_image_url, prompt, model, duration_s, status, output_url, error_message, cost_estimate_usd, created_at, completed_at";

// The new tables are not in the generated Supabase types yet, so queries on them go through `any` (as elsewhere).
const db = () => supabaseAdmin() as any;

export class VideoJobError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "VideoJobError";
  }
}

/** True when a job has been "processing" for longer than we are willing to wait. */
export function isStale(job: Pick<VideoJob, "status" | "created_at">, now = Date.now()): boolean {
  return (job.status === "processing" || job.status === "queued") && now - new Date(job.created_at).getTime() > STALE_AFTER_MS;
}

export type ProposalImage = { id: string; url: string; job_type: string; label: string };

/** The proposal's own generated images (ones with a usable web address), newest first. */
export async function listProposalImages(tenantId: string, proposalId: string): Promise<ProposalImage[]> {
  const { data, error } = await db()
    .from("image_generation_jobs")
    .select("id, job_type, status, prompt, output_urls, selected_url, display_label, inventory_label, created_at")
    .eq("tenant_id", tenantId)
    .eq("proposal_id", proposalId)
    .in("status", ["completed", "pending_approval"])
    .order("created_at", { ascending: false })
    .limit(40);
  if (error) throw new VideoJobError(error.message, 500);

  const out: ProposalImage[] = [];
  for (const row of (data ?? []) as Array<ImageJobRow & { display_label?: string | null; inventory_label?: string | null }>) {
    const url = resolveJobImageUrl(row);
    if (!url) continue;
    out.push({ id: row.id, url, job_type: row.job_type, label: row.display_label || row.inventory_label || row.job_type.replace(/_/g, " ") });
  }
  return out;
}

export async function listVideoJobs(tenantId: string, proposalId: string): Promise<VideoJob[]> {
  const { data, error } = await db()
    .from("video_jobs")
    .select(JOB_COLUMNS)
    .eq("tenant_id", tenantId)
    .eq("proposal_id", proposalId)
    .order("created_at", { ascending: false })
    .limit(20);
  if (error) {
    // Table not created yet (migration 0078 not applied): say so instead of a bare database error.
    if (/video_jobs/.test(error.message) && /(does not exist|schema cache)/.test(error.message)) {
      throw new VideoJobError("Video generation is not set up yet. Ask an admin to finish setup.", 503);
    }
    throw new VideoJobError(error.message, 500);
  }
  return (data ?? []) as VideoJob[];
}

export async function createVideoJob(input: {
  tenantId: string;
  proposalId: string;
  imageJobId: string;
  customPrompt?: string | null;
  durationS?: unknown;
  createdBy: string;
  actor: Actor;
}): Promise<VideoJob> {
  const sb = db();

  const { data: proposal } = await sb
    .from("proposals")
    .select("id, company_id")
    .eq("id", input.proposalId)
    .eq("tenant_id", input.tenantId)
    .maybeSingle();
  if (!proposal) throw new VideoJobError("Proposal not found", 404);

  const { data: imageJob } = await sb
    .from("image_generation_jobs")
    .select("id, job_type, status, prompt, output_urls, selected_url, proposal_id")
    .eq("id", input.imageJobId)
    .eq("tenant_id", input.tenantId)
    .maybeSingle();
  if (!imageJob || imageJob.proposal_id !== input.proposalId) throw new VideoJobError("Image not found on this proposal", 404);
  const imageUrl = resolveJobImageUrl(imageJob as ImageJobRow);
  if (!imageUrl) throw new VideoJobError("That image has no public address yet. Pick a finished image.", 409);

  const { count: openCount } = await sb
    .from("video_jobs")
    .select("id", { count: "exact", head: true })
    .eq("tenant_id", input.tenantId)
    .in("status", ["queued", "processing"]);
  if ((openCount ?? 0) >= MAX_OPEN_JOBS_PER_TENANT) {
    throw new VideoJobError("Several videos are already being made. Wait for one to finish, then try again.", 429);
  }

  const cap = await checkDailySpendCap();
  if (!cap.ok) {
    throw new VideoJobError("The daily AI spending limit has been reached. Try again tomorrow or ask an admin to raise it.", 429);
  }

  const model = videoModelId();
  const durationS = normalizeDuration(input.durationS);
  const prompt = buildMotionPrompt(imageJob.job_type, input.customPrompt);
  const cost = estimateVideoCostUsd(model, durationS);

  const { data: row, error: insertErr } = await sb
    .from("video_jobs")
    .insert({
      tenant_id: input.tenantId,
      proposal_id: input.proposalId,
      company_id: proposal.company_id ?? null,
      source_image_job_id: imageJob.id,
      source_image_url: imageUrl,
      prompt,
      model,
      duration_s: durationS,
      status: "queued",
      cost_estimate_usd: cost,
      created_by: input.createdBy,
    })
    .select(JOB_COLUMNS)
    .single();
  if (insertErr || !row) {
    if (insertErr && /video_jobs/.test(insertErr.message) && /(does not exist|schema cache)/.test(insertErr.message)) {
      throw new VideoJobError("Video generation is not set up yet. Ask an admin to finish setup.", 503);
    }
    throw new VideoJobError(insertErr?.message ?? "Could not save the video job", 500);
  }

  try {
    const prediction = await createVideoPrediction(model, { imageUrl, prompt, durationS });
    const { data: updated } = await sb
      .from("video_jobs")
      .update({ status: "processing", provider_prediction_id: prediction.id, updated_at: new Date().toISOString() })
      .eq("id", row.id)
      .select(JOB_COLUMNS)
      .single();
    await recordAudit({
      entity_type: "video_job",
      entity_id: row.id,
      action: "video.created",
      actor: input.actor,
      tenant_id: input.tenantId,
      metadata: { proposal_id: input.proposalId, image_job_id: imageJob.id, model, duration_s: durationS },
    });
    return (updated ?? row) as VideoJob;
  } catch (err) {
    const message = err instanceof Error ? err.message : "Could not start the video";
    await sb
      .from("video_jobs")
      .update({ status: "failed", error_message: message.slice(0, 500), updated_at: new Date().toISOString() })
      .eq("id", row.id);
    throw new VideoJobError(
      err instanceof VideoRendererError && err.retryable
        ? "The video service is busy right now. Try again in a minute."
        : "The video could not be started. Try again, or tell an admin if it keeps happening.",
      err instanceof VideoRendererError && err.retryable ? 503 : 502,
    );
  }
}

async function downloadVideo(url: string): Promise<Buffer> {
  const res = await fetch(url, { signal: AbortSignal.timeout(90_000) });
  if (!res.ok) throw new Error(`Could not download the finished video (HTTP ${res.status})`);
  const length = Number(res.headers.get("content-length") ?? 0);
  if (length > MAX_VIDEO_BYTES) throw new Error("The finished video is larger than 100 MB");
  const buffer = Buffer.from(await res.arrayBuffer());
  if (buffer.length > MAX_VIDEO_BYTES) throw new Error("The finished video is larger than 100 MB");
  if (buffer.length < 1000) throw new Error("The finished video file is empty");
  return buffer;
}

/**
 * Asks Replicate how a job is going and updates our row. Safe to call from several places at once: the file is
 * saved under a fixed name, and the row is only switched to "completed" by one caller, who alone records the cost.
 */
export async function syncVideoJob(tenantId: string, jobId: string, actor: Actor): Promise<VideoJob | null> {
  const sb = db();
  const { data: job } = await sb
    .from("video_jobs")
    .select(`${JOB_COLUMNS}, provider_prediction_id, tenant_id`)
    .eq("id", jobId)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (!job) return null;
  if (job.status !== "processing" && job.status !== "queued") return job as VideoJob;

  const fail = async (message: string) => {
    const { data } = await sb
      .from("video_jobs")
      .update({ status: "failed", error_message: message.slice(0, 500), updated_at: new Date().toISOString() })
      .eq("id", jobId)
      .in("status", ["queued", "processing"])
      .select(JOB_COLUMNS)
      .maybeSingle();
    return (data ?? { ...job, status: "failed", error_message: message }) as VideoJob;
  };

  if (!job.provider_prediction_id) {
    return isStale(job) ? fail("The video never started. Please try again.") : (job as VideoJob);
  }

  let prediction;
  try {
    prediction = await getVideoPrediction(job.provider_prediction_id);
  } catch {
    // A failed status check is not a failed video: Replicate may just be slow to answer. Keep waiting, up to the limit.
    return isStale(job) ? fail("The video took too long and was cancelled. Please try again.") : (job as VideoJob);
  }

  if (prediction.status === "failed" || prediction.status === "canceled") {
    return fail(prediction.error ? `The video could not be made: ${prediction.error}` : "The video could not be made.");
  }

  if (prediction.status !== "succeeded" || !prediction.outputUrl) {
    return isStale(job) ? fail("The video took too long and was cancelled. Please try again.") : (job as VideoJob);
  }

  let publicUrl: string;
  try {
    const buffer = await downloadVideo(prediction.outputUrl);
    const path = `videos/${tenantId}/${jobId}.mp4`;
    const storage = sb.storage.from(STORAGE_BUCKET);
    const { error: upErr } = await storage.upload(path, buffer, { contentType: "video/mp4", cacheControl: "31536000", upsert: true });
    if (upErr) throw new Error(`Saving the video failed: ${upErr.message}`);
    publicUrl = storage.getPublicUrl(path).data.publicUrl;
  } catch (err) {
    const message = err instanceof Error ? err.message : "Saving the video failed";
    // The render itself worked; saving can be retried on the next check until the time limit.
    return isStale(job) ? fail(message) : (job as VideoJob);
  }

  const { data: done } = await sb
    .from("video_jobs")
    .update({ status: "completed", output_url: publicUrl, completed_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq("id", jobId)
    .in("status", ["queued", "processing"])
    .select(JOB_COLUMNS)
    .maybeSingle();

  if (done) {
    // Only the caller that actually flipped the row records the cost and the audit entry.
    await recordSpend({
      category: "video_generation",
      provider: "replicate",
      amountUsd: Number(job.cost_estimate_usd ?? estimateVideoCostUsd(job.model, job.duration_s)),
      entityType: "company",
      entityId: job.company_id ?? null,
      metadata: { video_job_id: jobId, model: job.model, duration_s: job.duration_s, estimate: true },
    });
    await recordAudit({
      entity_type: "video_job",
      entity_id: jobId,
      action: "video.completed",
      actor,
      tenant_id: tenantId,
      metadata: { proposal_id: job.proposal_id, model: job.model },
    });
    return done as VideoJob;
  }

  // Someone else finished it first; return the stored result.
  const { data: latest } = await sb.from("video_jobs").select(JOB_COLUMNS).eq("id", jobId).eq("tenant_id", tenantId).maybeSingle();
  return (latest ?? job) as VideoJob;
}
