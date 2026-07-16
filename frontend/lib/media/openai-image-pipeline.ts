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
 * Single-pass sponsor image edit. One prompt, one OpenAI Images Edit call, one
 * PNG returned. No QA, no retries, no correction prompts — the model performs
 * the edit naturally, exactly like ChatGPT image editing. If the API fails the
 * error is surfaced directly.
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

  const result = await renderer.render({
    baseImage: input.baseImage,
    baseFilename: input.baseFilename,
    baseMimeType: input.baseMimeType,
    sponsorLogo: input.sponsorLogo.processed,
    prompt: input.prompt,
    size: input.size,
    quality,
  });

  const outputMeta = await sharp(result.buffer, { failOn: "error" }).metadata();
  if (outputMeta.format !== "png") {
    throw new ImageRendererError(
      `Renderer returned ${outputMeta.format ?? "unknown"} instead of PNG`,
      false,
    );
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
        },
      ],
    },
  };
}
