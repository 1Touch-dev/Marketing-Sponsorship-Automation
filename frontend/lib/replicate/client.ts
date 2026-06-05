/**
 * Replicate client — FLUX LoRA jersey/stadium image generation
 *
 * Model: abhishek9302/coritiba-jersey-lora (v2 trained 5 Jun 2026 — James Coto Coxa kit)
 * Trigger word: coritiba_jersey
 * Version: 76169e0ab5d4effa7c6eb4ce9bfc2e7ac739e4e38a855a26943b67800d2eaf9e
 */

const REPLICATE_API_BASE = "https://api.replicate.com/v1";

/** Pinned trained model version */
export const CORITIBA_JERSEY_MODEL_VERSION =
  "abhishek9302/coritiba-jersey-lora:76169e0ab5d4effa7c6eb4ce9bfc2e7ac739e4e38a855a26943b67800d2eaf9e";

/** Trigger word that activates the jersey LoRA */
export const JERSEY_TRIGGER_WORD = "coritiba_jersey";

export interface ReplicatePredictionInput {
  prompt: string;
  num_outputs?: number;
  aspect_ratio?: "1:1" | "16:9" | "4:5" | "3:4" | "9:16";
  lora_scale?: number;
  guidance_scale?: number;
  num_inference_steps?: number;
  output_format?: "webp" | "jpg" | "png";
  output_quality?: number;
}

export interface ReplicatePrediction {
  id: string;
  status: "starting" | "processing" | "succeeded" | "failed" | "canceled";
  output: string[] | null;
  error: string | null;
  created_at: string;
  started_at?: string;
  completed_at?: string;
  metrics?: { predict_time?: number };
  urls: { get: string; cancel: string };
}

function getToken(): string {
  const token = process.env.REPLICATE_API_TOKEN;
  if (!token) throw new Error("REPLICATE_API_TOKEN not configured");
  return token;
}

/** Start a prediction. Returns immediately with prediction id + status=starting. */
export async function startPrediction(
  input: ReplicatePredictionInput
): Promise<ReplicatePrediction> {
  const token = getToken();

  // Ensure trigger word is in every prompt
  const prompt = input.prompt.includes(JERSEY_TRIGGER_WORD)
    ? input.prompt
    : `${JERSEY_TRIGGER_WORD} ${input.prompt}`;

  const body = {
    version: CORITIBA_JERSEY_MODEL_VERSION,
    input: {
      prompt,
      num_outputs: input.num_outputs ?? 1,
      aspect_ratio: input.aspect_ratio ?? "1:1",
      lora_scale: input.lora_scale ?? 1,
      guidance_scale: input.guidance_scale ?? 3,
      num_inference_steps: input.num_inference_steps ?? 28,
      output_format: input.output_format ?? "webp",
      output_quality: input.output_quality ?? 80,
    },
  };

  const res = await fetch(`${REPLICATE_API_BASE}/predictions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Prefer: "wait", // ask Replicate to wait up to 60s for completion
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({})) as { detail?: string };
    throw new Error(`Replicate API error ${res.status}: ${err.detail ?? res.statusText}`);
  }

  return res.json() as Promise<ReplicatePrediction>;
}

/** Poll a prediction by id. */
export async function getPrediction(id: string): Promise<ReplicatePrediction> {
  const token = getToken();

  const res = await fetch(`${REPLICATE_API_BASE}/predictions/${id}`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });

  if (!res.ok) {
    throw new Error(`Replicate poll error ${res.status}`);
  }

  return res.json() as Promise<ReplicatePrediction>;
}

/**
 * Start a prediction and wait for it to complete (polling).
 * Times out after `timeoutMs` ms (default 120s).
 */
export async function generateImage(
  input: ReplicatePredictionInput,
  opts: { timeoutMs?: number; pollIntervalMs?: number } = {}
): Promise<{ urls: string[]; predictionId: string; durationMs: number }> {
  const { timeoutMs = 120_000, pollIntervalMs = 3_000 } = opts;
  const start = Date.now();

  let prediction = await startPrediction(input);

  // If Replicate's `Prefer: wait` already resolved it synchronously
  if (prediction.status === "succeeded" && prediction.output) {
    return {
      urls: prediction.output,
      predictionId: prediction.id,
      durationMs: Date.now() - start,
    };
  }

  if (prediction.status === "failed") {
    throw new Error(`Replicate prediction failed immediately: ${prediction.error ?? "unknown"}`);
  }

  // Poll until done
  while (Date.now() - start < timeoutMs) {
    await sleep(pollIntervalMs);
    prediction = await getPrediction(prediction.id);

    if (prediction.status === "succeeded") {
      return {
        urls: prediction.output ?? [],
        predictionId: prediction.id,
        durationMs: Date.now() - start,
      };
    }

    if (prediction.status === "failed" || prediction.status === "canceled") {
      throw new Error(
        `Replicate prediction ${prediction.status}: ${prediction.error ?? "unknown error"}`
      );
    }
  }

  throw new Error(`Replicate prediction timed out after ${timeoutMs}ms (id: ${prediction.id})`);
}

/** Cost estimate in USD for a single image generation (~25s at $0.001525/sec) */
export function estimateCost(numImages = 1): number {
  return Math.round(numImages * 25 * 0.001525 * 100) / 100;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
