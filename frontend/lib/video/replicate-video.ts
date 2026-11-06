/**
 * Image-to-video through Replicate (ported from the 1Touch AI Studio pipeline, lib/video/*).
 *
 * Replicate is asynchronous: one call starts a "prediction", a second call asks how it is going. So nothing here
 * waits for the render. The job code (lib/video/jobs.ts) stores the prediction id and checks back later.
 * Plain fetch, no SDK, so deploying needs no `npm install`.
 *
 * Settings: REPLICATE_API_TOKEN (already used for the jersey LoRA), VIDEO_MODEL (optional, one of VIDEO_MODELS).
 */

const REPLICATE_API_BASE = "https://api.replicate.com/v1";

export type VideoRenderRequest = {
  /** Public address of the still to animate. Replicate fetches it by URL. */
  imageUrl: string;
  prompt: string;
  /** Seconds. Kling takes 5 or 10; see ALLOWED_DURATIONS. */
  durationS: number;
};

export type VideoPredictionStatus = "starting" | "processing" | "succeeded" | "failed" | "canceled";

export type VideoPrediction = {
  id: string;
  status: VideoPredictionStatus;
  outputUrl?: string;
  error?: string;
};

export class VideoRendererError extends Error {
  constructor(
    message: string,
    readonly retryable: boolean,
  ) {
    super(message);
    this.name = "VideoRendererError";
  }
}

export type VideoModelSpec = {
  id: string;
  label: string;
  /** List-price ESTIMATE in USD per second of video. Replicate does not return the bill per call; check replicate.com. */
  costPerSecondUsd: number;
  hasAudio: boolean;
  buildInput: (req: VideoRenderRequest) => Record<string, unknown>;
};

/** What every clip must not contain, whichever model makes it. */
export const NEGATIVE_PROMPT = "text overlays, subtitles, watermark, distorted logo, melted or changing letters, extra limbs, morphing faces";

export const ALLOWED_DURATIONS = [5, 10] as const;
export const DEFAULT_DURATION_S = 5;

/**
 * Adding a model is adding an entry here: the lifecycle (create, check, download) is the same for all of them,
 * only the names of the input fields differ.
 */
export const VIDEO_MODELS: Record<string, VideoModelSpec> = {
  "kwaivgi/kling-v2.5-turbo-pro": {
    id: "kwaivgi/kling-v2.5-turbo-pro",
    label: "Kling 2.5 Turbo Pro",
    costPerSecondUsd: 0.07,
    hasAudio: false,
    buildInput: (r) => ({
      start_image: r.imageUrl,
      prompt: r.prompt,
      duration: r.durationS,
      negative_prompt: NEGATIVE_PROMPT,
    }),
  },
  "kwaivgi/kling-v2.1": {
    id: "kwaivgi/kling-v2.1",
    label: "Kling 2.1 (Studio default)",
    costPerSecondUsd: 0.05,
    hasAudio: false,
    buildInput: (r) => ({ start_image: r.imageUrl, prompt: r.prompt, mode: "standard", duration: r.durationS }),
  },
  "bytedance/seedance-2.0-fast": {
    id: "bytedance/seedance-2.0-fast",
    label: "Seedance 2.0 Fast (with sound)",
    costPerSecondUsd: 0.15,
    hasAudio: true,
    buildInput: (r) => ({
      image: r.imageUrl,
      prompt: r.prompt,
      duration: r.durationS,
      resolution: "720p",
      aspect_ratio: "adaptive",
      generate_audio: true,
    }),
  },
};

export const DEFAULT_VIDEO_MODEL = "kwaivgi/kling-v2.5-turbo-pro";

export function videoModelId(): string {
  const wanted = process.env.VIDEO_MODEL?.trim();
  return wanted && VIDEO_MODELS[wanted] ? wanted : DEFAULT_VIDEO_MODEL;
}

export function isVideoGenerationConfigured(): boolean {
  return !!process.env.REPLICATE_API_TOKEN?.trim();
}

export function normalizeDuration(value: unknown): number {
  const n = Number(value);
  return (ALLOWED_DURATIONS as readonly number[]).includes(n) ? n : DEFAULT_DURATION_S;
}

/** Estimated cost of one clip, for the spend ledger and the spend cap. */
export function estimateVideoCostUsd(modelId: string, durationS: number): number {
  const spec = VIDEO_MODELS[modelId] ?? VIDEO_MODELS[DEFAULT_VIDEO_MODEL];
  return Math.round(spec.costPerSecondUsd * durationS * 10000) / 10000;
}

type ReplicateResponse = {
  id: string;
  status: VideoPredictionStatus;
  output: string | string[] | null;
  error: string | null;
};

export function toVideoPrediction(res: ReplicateResponse): VideoPrediction {
  const output = Array.isArray(res.output) ? res.output[0] : res.output;
  return { id: res.id, status: res.status, outputUrl: output ?? undefined, error: res.error ?? undefined };
}

type Fetch = typeof fetch;

function token(): string {
  const t = process.env.REPLICATE_API_TOKEN?.trim();
  if (!t) throw new VideoRendererError("REPLICATE_API_TOKEN is not configured", false);
  return t;
}

const MAX_CREATE_ATTEMPTS = 3;

/** Starts a render. Retries a busy or flaky Replicate (network error, 429, 5xx) up to three times. */
export async function createVideoPrediction(
  modelId: string,
  request: VideoRenderRequest,
  doFetch: Fetch = fetch,
  retryDelayMs = 2000,
): Promise<VideoPrediction> {
  const spec = VIDEO_MODELS[modelId];
  if (!spec) throw new VideoRendererError(`No input mapping for video model "${modelId}"`, false);

  for (let attempt = 1; ; attempt++) {
    try {
      let response: Response;
      try {
        response = await doFetch(`${REPLICATE_API_BASE}/models/${modelId}/predictions`, {
          method: "POST",
          headers: { Authorization: `Bearer ${token()}`, "Content-Type": "application/json" },
          body: JSON.stringify({ input: spec.buildInput(request) }),
          signal: AbortSignal.timeout(30_000),
        });
      } catch (error) {
        if (error instanceof VideoRendererError) throw error;
        throw new VideoRendererError(
          `Replicate request failed: ${error instanceof Error ? error.message : "network error"}`,
          true,
        );
      }
      if (!response.ok) {
        const body = (await response.json().catch(() => ({}))) as { detail?: string };
        throw new VideoRendererError(
          `Replicate rejected the request: ${body.detail ?? `HTTP ${response.status}`}`,
          response.status === 429 || response.status >= 500,
        );
      }
      return toVideoPrediction((await response.json()) as ReplicateResponse);
    } catch (err) {
      const canRetry = err instanceof VideoRendererError && err.retryable && attempt < MAX_CREATE_ATTEMPTS;
      if (!canRetry) throw err;
      await new Promise((r) => setTimeout(r, retryDelayMs * attempt));
    }
  }
}

export async function getVideoPrediction(predictionId: string, doFetch: Fetch = fetch): Promise<VideoPrediction> {
  const response = await doFetch(`${REPLICATE_API_BASE}/predictions/${encodeURIComponent(predictionId)}`, {
    headers: { Authorization: `Bearer ${token()}` },
    cache: "no-store",
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) throw new VideoRendererError(`Replicate status check failed: HTTP ${response.status}`, true);
  return toVideoPrediction((await response.json()) as ReplicateResponse);
}
