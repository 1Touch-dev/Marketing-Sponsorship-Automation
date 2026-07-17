import { createHash, randomUUID } from "crypto";
import sharp from "sharp";
import type { PreparedLogo } from "./logo-preprocessing";
import { ImageRendererError, type ImageRenderer } from "./image-renderer";
import { OpenAIRenderer } from "./openai-renderer";
import type { ImageOutputQuality, ImageOutputSize } from "./image-renderer";
import type { ImageDebugArtifact } from "./image-debug";

export type { ImageOutputSize, ImageOutputQuality };

export type ImagePipelineResult = {
  buffer: Buffer;
  width: number;
  height: number;
  model: string;
  quality: ImageOutputQuality;
  size: ImageOutputSize;
  generationId: string;
  generationMs: number;
  debug: ImageDebugArtifact;
};

function sha256(buffer: Buffer): string {
  return createHash("sha256").update(buffer).digest("hex");
}

let defaultRenderer: ImageRenderer | null = null;
function getDefaultRenderer(apiKey: string): ImageRenderer {
  if (!defaultRenderer) defaultRenderer = new OpenAIRenderer(apiKey);
  return defaultRenderer;
}

/**
 * OpenAI's gpt-image models occasionally return a fully (or near-)black frame
 * with a valid 200 response — a known, intermittent provider-side bug (roughly
 * 1 in 15 generations per OpenAI's own developer community reports), unrelated
 * to prompt or input quality. A near-zero mean brightness across all channels
 * combined with near-zero variance means the frame carries no real image
 * content, so we treat it as a degenerate output worth silently retrying
 * rather than showing the sponsor a black mockup.
 */
async function isDegenerateOutput(buffer: Buffer): Promise<boolean> {
  const stats = await sharp(buffer, { failOn: "error" }).stats();
  return stats.channels.slice(0, 3).every((channel) => channel.mean < 4 && channel.stdev < 4);
}

const MAX_RENDER_ATTEMPTS = 3;

/**
 * Single-pass sponsor image edit. One prompt, one OpenAI Images Edit call per
 * attempt, one PNG returned — no QA, no correction prompts, the model performs
 * the edit naturally, exactly like ChatGPT image editing. The only retry logic
 * here guards against the provider returning a degenerate (all-black/blank)
 * frame; a genuine API failure is still surfaced directly on the first error.
 */
export async function runSponsorImageEdit(input: {
  baseImage: Buffer;
  baseFilename: string;
  baseMimeType: string;
  sponsorLogo: PreparedLogo;
  sponsorName: string;
  placement: string;
  prompt: string;
  size: ImageOutputSize;
  quality?: ImageOutputQuality;
  renderer?: ImageRenderer;
}): Promise<ImagePipelineResult> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY not configured on server");

  const renderer = input.renderer ?? getDefaultRenderer(apiKey);
  const model = process.env.OPENAI_IMAGE_MODEL ?? "gpt-image-2";
  const quality = input.quality ?? "high";
  const generationId = randomUUID();
  const startedAt = Date.now();

  let result: Awaited<ReturnType<ImageRenderer["render"]>> | null = null;
  let outputMeta: sharp.Metadata | null = null;
  let degenerateAttempts = 0;

  for (let attempt = 1; attempt <= MAX_RENDER_ATTEMPTS; attempt++) {
    const attemptResult = await renderer.render({
      baseImage: input.baseImage,
      baseFilename: input.baseFilename,
      baseMimeType: input.baseMimeType,
      sponsorLogo: input.sponsorLogo.processed,
      prompt: input.prompt,
      size: input.size,
      quality,
    });

    const meta = await sharp(attemptResult.buffer, { failOn: "error" }).metadata();
    if (meta.format !== "png") {
      throw new ImageRendererError(
        `Renderer returned ${meta.format ?? "unknown"} instead of PNG`,
        false,
      );
    }

    if (await isDegenerateOutput(attemptResult.buffer)) {
      degenerateAttempts++;
      if (attempt < MAX_RENDER_ATTEMPTS) continue;
      throw new ImageRendererError(
        `OpenAI returned a blank/black image ${degenerateAttempts} time(s) in a row — this is a known intermittent provider issue. Please try Regenerate.`,
        true,
      );
    }

    result = attemptResult;
    outputMeta = meta;
    break;
  }

  if (!result || !outputMeta) {
    throw new ImageRendererError("Image generation failed after retries", true);
  }

  const baseMetadata = await sharp(input.baseImage, { failOn: "error" }).metadata();

  return {
    buffer: result.buffer,
    width: outputMeta.width ?? Number(input.size.split("x")[0]),
    height: outputMeta.height ?? Number(input.size.split("x")[1]),
    model,
    quality,
    size: input.size,
    generationId,
    generationMs: Date.now() - startedAt,
    debug: {
      generationId,
      originalLogo: input.sponsorLogo.original,
      processedLogo: input.sponsorLogo.processed,
      prompt: input.prompt,
      request: {
        model,
        endpoint: "https://api.openai.com/v1/images/edits",
        size: input.size,
        quality,
        inputFidelity: model === "gpt-image-2" ? "automatic" : "high",
        outputFormat: "png",
        imageOrder: ["Image 1: base photograph", "Image 2: sponsor artwork"],
        baseFilename: input.baseFilename,
        baseMimeType: input.baseMimeType,
        baseBytes: input.baseImage.length,
        baseSha256: sha256(input.baseImage),
        baseWidth: baseMetadata.width ?? 0,
        baseHeight: baseMetadata.height ?? 0,
        logoBytes: input.sponsorLogo.processed.length,
        logoSha256: input.sponsorLogo.processedSha256,
        logoWidth: input.sponsorLogo.width,
        logoHeight: input.sponsorLogo.height,
      },
      attempts: [
        {
          requestId: result.requestId,
          created: result.created,
          generationMs: Date.now() - startedAt,
          outputWidth: outputMeta.width,
          outputHeight: outputMeta.height,
          outputBytes: result.buffer.length,
          usage: result.usage,
          degenerateRetries: degenerateAttempts,
        },
      ],
    },
  };
}
