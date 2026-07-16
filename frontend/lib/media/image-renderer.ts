/**
 * Renderer-agnostic contract for turning (base photo + sponsor logo + prompt)
 * into a finished PNG in a single pass. `OpenAIRenderer` is the only
 * implementation today, but every call site depends only on this interface —
 * never on the OpenAI SDK/HTTP shape directly. Swapping in a future renderer
 * means implementing `ImageRenderer.render()` and changing one construction
 * site, with no changes to prompts or callers.
 */

export type ImageOutputSize = "1024x1024" | "1024x1536" | "1536x1024";
export type ImageOutputQuality = "low" | "medium" | "high";

export type ImageRenderRequest = {
  /** Immutable base photograph — Image 1 / source of truth for everything except the sponsor mark. */
  baseImage: Buffer;
  baseFilename: string;
  baseMimeType: string;
  /** Preprocessed sponsor artwork — Image 2 / source of truth for the mark itself. */
  sponsorLogo: Buffer;
  prompt: string;
  size: ImageOutputSize;
  quality: ImageOutputQuality;
};

export type ImageRenderResponse = {
  buffer: Buffer;
  requestId?: string;
  created?: number;
  usage?: unknown;
};

export class ImageRendererError extends Error {
  constructor(
    message: string,
    readonly retryable: boolean,
  ) {
    super(message);
    this.name = "ImageRendererError";
  }
}

export interface ImageRenderer {
  readonly name: string;
  render(request: ImageRenderRequest): Promise<ImageRenderResponse>;
}
