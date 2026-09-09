/**
 * POST /api/media/replicate — Generate a jersey mockup image using the
 * trained Coritiba LoRA model on Replicate.
 *
 * Body:
 *   prompt        string  (required) — describe the scene; trigger word auto-injected
 *   num_outputs   number  (default 1, max 4)
 *   aspect_ratio  string  (default "1:1")
 *   lora_scale    number  (default 1.0)
 *   proposal_id   string  (optional) — link generated image to a proposal
 *   company_id    string  (optional)
 *
 * GET /api/media/replicate?prediction_id=xxx — poll status of an async prediction
 */

import { NextResponse } from "next/server";
import { generateImage, getPrediction, estimateCost, JERSEY_TRIGGER_WORD } from "@/lib/replicate/client";
import { checkRateLimit, rateLimitHeaders } from "@/lib/rate-limit";
import { recordAudit } from "@/lib/audit/log";
import { requirePermission } from "@/lib/auth/server-permission";

export const maxDuration = 120;

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const predictionId = searchParams.get("prediction_id");

  if (!predictionId) {
    return NextResponse.json({ error: "prediction_id required" }, { status: 400 });
  }

  try {
    const prediction = await getPrediction(predictionId);
    return NextResponse.json({
      id: prediction.id,
      status: prediction.status,
      output: prediction.output,
      error: prediction.error,
      duration_ms: prediction.metrics?.predict_time
        ? Math.round(prediction.metrics.predict_time * 1000)
        : null,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Poll failed" },
      { status: 500 }
    );
  }
}

export async function POST(req: Request) {
  const auth = await requirePermission("generate_images");
  if ("error" in auth) return auth.error;

  // Rate limit: 10 generations per minute per IP
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  const rl = checkRateLimit({ key: `replicate-gen:${ip}`, limit: 10, windowSec: 60 });
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Rate limit exceeded. Try again in 60 seconds." },
      { status: 429, headers: rateLimitHeaders(rl) }
    );
  }

  if (!process.env.REPLICATE_API_TOKEN) {
    return NextResponse.json(
      { error: "Replicate not configured — REPLICATE_API_TOKEN missing" },
      { status: 503 }
    );
  }

  try {
    const body = (await req.json()) as {
      prompt: string;
      num_outputs?: number;
      aspect_ratio?: "1:1" | "16:9" | "4:5" | "3:4" | "9:16";
      lora_scale?: number;
      proposal_id?: string;
      company_id?: string;
      async?: boolean;
    };

    if (!body.prompt || body.prompt.trim().length < 5) {
      return NextResponse.json({ error: "prompt required (min 5 chars)" }, { status: 400 });
    }

    const numOutputs = Math.min(Math.max(body.num_outputs ?? 1, 1), 4);
    const estimatedCost = estimateCost(numOutputs);

    // Cost guard — hard cap at $0.50 per request
    if (estimatedCost > 0.5) {
      return NextResponse.json(
        { error: `Request would cost $${estimatedCost} — exceeds per-request cap of $0.50` },
        { status: 400 }
      );
    }

    const startMs = Date.now();

    const { urls, predictionId, durationMs } = await generateImage({
      prompt: body.prompt,
      num_outputs: numOutputs,
      aspect_ratio: body.aspect_ratio ?? "1:1",
      lora_scale: body.lora_scale ?? 1,
    });

    await recordAudit({
      action: "replicate.image_generated",
      entity_type: "image_generation_job",
      entity_id: predictionId,
      metadata: {
        prompt: body.prompt,
        trigger_word: JERSEY_TRIGGER_WORD,
        num_outputs: numOutputs,
        duration_ms: durationMs,
        estimated_cost_usd: estimatedCost,
        proposal_id: body.proposal_id ?? null,
        company_id: body.company_id ?? null,
      },
    });

    return NextResponse.json({
      success: true,
      prediction_id: predictionId,
      output_urls: urls,
      num_images: urls.length,
      duration_ms: durationMs,
      estimated_cost_usd: estimatedCost,
      trigger_word: JERSEY_TRIGGER_WORD,
      provider: "replicate",
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Image generation failed";

    // Classify error for better client feedback
    const isTimeout = message.includes("timed out");
    const isConfig = message.includes("not configured");

    return NextResponse.json(
      {
        error: message,
        error_type: isTimeout ? "timeout" : isConfig ? "configuration" : "generation_failed",
        provider: "replicate",
      },
      { status: isConfig ? 503 : 500 }
    );
  }
}
