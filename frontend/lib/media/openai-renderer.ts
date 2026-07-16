import {
  ImageRendererError,
  type ImageRenderer,
  type ImageRenderRequest,
  type ImageRenderResponse,
} from "./image-renderer";

const EDIT_ENDPOINT = "https://api.openai.com/v1/images/edits";
const REQUEST_TIMEOUT_MS = 180_000;

function toFile(buffer: Buffer, filename: string, type: string): File {
  return new File([new Uint8Array(buffer)], filename, { type });
}

/**
 * Current production `ImageRenderer` implementation: OpenAI's Images Edit API
 * (`gpt-image-2`). Sends the base photograph and sponsor logo as two ordered
 * input images (never concatenated/flattened into one file) so the model can
 * use each at high input fidelity, per OpenAI's multi-image edit support.
 */
export class OpenAIRenderer implements ImageRenderer {
  readonly name = "openai-images-edit";

  constructor(
    private readonly apiKey: string,
    private readonly model: string = process.env.OPENAI_IMAGE_MODEL ?? "gpt-image-2",
  ) {}

  async render(request: ImageRenderRequest): Promise<ImageRenderResponse> {
    const form = new FormData();
    form.append("model", this.model);
    form.append("prompt", request.prompt);
    form.append("size", request.size);
    form.append("quality", request.quality);
    form.append("output_format", "png");
    form.append("background", "opaque");
    if (this.model !== "gpt-image-2") {
      form.append("input_fidelity", "high");
    }

    // Ordering is intentional and contractually important: Image 1 is the
    // immutable base photo, Image 2 is the exact sponsor artwork source of truth.
    form.append("image[]", toFile(request.baseImage, request.baseFilename, request.baseMimeType));
    form.append("image[]", toFile(request.sponsorLogo, "sponsor-source.png", "image/png"));

    let response: Response;
    try {
      response = await fetch(EDIT_ENDPOINT, {
        method: "POST",
        headers: { Authorization: `Bearer ${this.apiKey}` },
        body: form,
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
    } catch (error) {
      throw new ImageRendererError(
        `OpenAI image edit request failed: ${error instanceof Error ? error.message : "network error"}`,
        true,
      );
    }

    if (!response.ok) {
      const body = (await response.json().catch(() => ({}))) as {
        error?: { message?: string };
      };
      throw new ImageRendererError(
        `OpenAI image edit failed: ${body.error?.message ?? `HTTP ${response.status}`}`,
        response.status === 408 ||
          response.status === 409 ||
          response.status === 429 ||
          response.status >= 500,
      );
    }

    const payload = (await response.json()) as {
      created?: number;
      data?: Array<{ b64_json?: string }>;
      usage?: unknown;
    };
    const encoded = payload.data?.[0]?.b64_json;
    if (!encoded) {
      throw new ImageRendererError("OpenAI image edit returned no base64 image data", true);
    }

    return {
      buffer: Buffer.from(encoded, "base64"),
      requestId: response.headers.get("x-request-id") ?? undefined,
      created: payload.created,
      usage: payload.usage,
    };
  }
}
