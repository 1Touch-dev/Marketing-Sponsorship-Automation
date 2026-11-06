/**
 * AI video intro (turns one of a proposal's generated images into a short video).
 *
 * GET  /api/media/video?proposal_id=…   the proposal's usable images and its past videos
 * POST /api/media/video                 { proposal_id, image_job_id, prompt?, duration_s? } start a video
 * GET  /api/media/video/:id             check on one video (see [id]/route.ts)
 */
import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/auth/server-permission";
import { userActor } from "@/lib/identity/actor";
import { checkRateLimit, rateLimitHeaders } from "@/lib/rate-limit";
import {
  createVideoJob,
  listProposalImages,
  listVideoJobs,
  syncVideoJob,
  VideoJobError,
} from "@/lib/video/jobs";
import {
  ALLOWED_DURATIONS,
  isVideoGenerationConfigured,
  VIDEO_MODELS,
  videoModelId,
  estimateVideoCostUsd,
} from "@/lib/video/replicate-video";
import { MAX_CUSTOM_PROMPT_CHARS } from "@/lib/video/motion-prompts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function failure(err: unknown) {
  if (err instanceof VideoJobError) return NextResponse.json({ error: err.message }, { status: err.status });
  console.error("[video]", err instanceof Error ? err.message : err);
  return NextResponse.json({ error: "Something went wrong with the video. Try again." }, { status: 500 });
}

export async function GET(req: Request) {
  const auth = await requirePermission("generate_images");
  if ("error" in auth) return auth.error;

  const proposalId = new URL(req.url).searchParams.get("proposal_id") ?? "";
  if (!UUID.test(proposalId)) return NextResponse.json({ error: "proposal_id is required" }, { status: 400 });

  try {
    const tenantId = auth.user.tenant_id;
    const [images, videos] = await Promise.all([listProposalImages(tenantId, proposalId), listVideoJobs(tenantId, proposalId)]);

    // Anything still rendering gets checked now, so a video that finished while the page was closed shows up.
    const actor = userActor(auth.user);
    const checked = await Promise.all(
      videos.map((v) => (v.status === "processing" || v.status === "queued" ? syncVideoJob(tenantId, v.id, actor).then((j) => j ?? v) : v)),
    );

    const model = videoModelId();
    return NextResponse.json({
      configured: isVideoGenerationConfigured(),
      images,
      videos: checked,
      options: {
        durations: ALLOWED_DURATIONS,
        model_label: VIDEO_MODELS[model].label,
        has_audio: VIDEO_MODELS[model].hasAudio,
        estimated_cost_usd: Object.fromEntries(ALLOWED_DURATIONS.map((d) => [d, estimateVideoCostUsd(model, d)])),
        max_prompt_chars: MAX_CUSTOM_PROMPT_CHARS,
      },
    });
  } catch (err) {
    return failure(err);
  }
}

export async function POST(req: Request) {
  const auth = await requirePermission("generate_images");
  if ("error" in auth) return auth.error;

  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  const rl = checkRateLimit({ key: `video-gen:${auth.user.tenant_id}:${ip}`, limit: 6, windowSec: 60 });
  if (!rl.allowed) {
    return NextResponse.json({ error: "Too many requests. Try again in a minute." }, { status: 429, headers: rateLimitHeaders(rl) });
  }

  if (!isVideoGenerationConfigured()) {
    return NextResponse.json({ error: "Video generation is not set up yet. Ask an admin to finish setup." }, { status: 503 });
  }

  const body = (await req.json().catch(() => null)) as {
    proposal_id?: string;
    image_job_id?: string;
    prompt?: string;
    duration_s?: number;
  } | null;
  if (!body || !UUID.test(body.proposal_id ?? "") || !UUID.test(body.image_job_id ?? "")) {
    return NextResponse.json({ error: "proposal_id and image_job_id are required" }, { status: 400 });
  }

  try {
    const job = await createVideoJob({
      tenantId: auth.user.tenant_id,
      proposalId: body.proposal_id!,
      imageJobId: body.image_job_id!,
      customPrompt: typeof body.prompt === "string" ? body.prompt : null,
      durationS: body.duration_s,
      createdBy: auth.user.email,
      actor: userActor(auth.user),
    });
    return NextResponse.json({ job }, { status: 201 });
  } catch (err) {
    return failure(err);
  }
}
