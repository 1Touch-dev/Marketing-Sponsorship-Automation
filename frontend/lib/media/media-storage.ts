import type { ImageDebugArtifact } from "./image-debug";
import { supabaseAdmin } from "@/lib/supabase/server";

const STORAGE_BUCKET = "campaign-assets";

export async function storeGeneratedPng(path: string, buffer: Buffer): Promise<string> {
  const storage = supabaseAdmin().storage.from(STORAGE_BUCKET);
  const { data, error } = await storage.upload(path, buffer, {
    contentType: "image/png",
    cacheControl: "31536000",
    upsert: false,
  });
  if (error) {
    throw new Error(`Generated image upload failed: ${error.message}`);
  }
  return storage.getPublicUrl(data.path).data.publicUrl;
}

export async function persistImageDebugArtifacts(input: {
  category: "jersey" | "stadium" | "campaign";
  debug: ImageDebugArtifact;
  width: number;
  height: number;
  generationMs: number;
  force?: boolean;
}): Promise<string | null> {
  if (!input.force && process.env.IMAGE_PIPELINE_DEBUG !== "true") return null;

  const prefix = `image-debug/${input.category}/${input.debug.generationId}`;
  const storage = supabaseAdmin().storage.from(STORAGE_BUCKET);
  const metadata = {
    generation_id: input.debug.generationId,
    prompt: input.debug.prompt,
    request: input.debug.request,
    response_metadata: input.debug.attempts,
    resolution: { width: input.width, height: input.height },
    generation_ms: input.generationMs,
    captured_at: new Date().toISOString(),
  };

  const uploads = await Promise.all([
    storage.upload(`${prefix}/original-logo.bin`, input.debug.originalLogo, {
      contentType: "application/octet-stream",
      upsert: false,
    }),
    storage.upload(`${prefix}/processed-logo.png`, input.debug.processedLogo, {
      contentType: "image/png",
      upsert: false,
    }),
    storage.upload(
      `${prefix}/request-response.json`,
      Buffer.from(JSON.stringify(metadata, null, 2)),
      {
        contentType: "application/json",
        upsert: false,
      },
    ),
  ]);

  if (uploads.some((upload) => upload.error)) return null;
  return prefix;
}
