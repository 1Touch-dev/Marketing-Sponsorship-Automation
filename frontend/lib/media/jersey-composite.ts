import type { JerseyPlacementId } from "./jersey-placements";
import { isPlacementVisibleForKit } from "./jersey-placements";
import { loadJerseySource, loadCustomBase } from "./image-assets";
import { buildJerseyPlacementPrompt } from "./jersey-placement-prompts";
import { fetchSponsorLogo, preprocessSponsorLogo, type PreparedLogo } from "./logo-preprocessing";
import { runSponsorImageEdit, type ImageOutputQuality } from "./openai-image-pipeline";
import type { ImageDebugArtifact } from "./image-debug";
import type { ImageOutputSize } from "./image-renderer";

export type CompositeJerseyInput = {
  sponsorName: string;
  sponsorLogoUrl?: string | null;
  placement?: JerseyPlacementId;
  kitType?: "flat" | "home" | "training" | "goalkeeper";
  /** Optional operator-uploaded base photo (URL or data URL). Overrides the built-in kit photo. */
  customBaseUrl?: string | null;
  quality?: ImageOutputQuality;
};

export type CompositeJerseyResult = {
  buffer: Buffer;
  width: number;
  height: number;
  placement: JerseyPlacementId;
  usedLogo: boolean;
  kitType: string;
  model: string;
  quality: ImageOutputQuality;
  generationId: string;
  generationMs: number;
  logo: Pick<
    PreparedLogo,
    | "originalWidth"
    | "originalHeight"
    | "width"
    | "height"
    | "hadTransparency"
    | "backgroundRemoved"
    | "upscaled"
  >;
  debug: ImageDebugArtifact;
};

/**
 * Renders a jersey sponsor placement in a single pass through the OpenAI Images
 * Edit API (`gpt-image-2`). Loads the original Coritiba photo and the sponsor
 * logo, builds one concise prompt, and returns the PNG — no QA, retries, or
 * aspect-ratio conditioning.
 */
export async function compositeJerseyMockup(
  input: CompositeJerseyInput,
): Promise<CompositeJerseyResult> {
  const placement = input.placement ?? "chest_sponsor";
  const kitType = input.kitType ?? "flat";
  const outputSize: ImageOutputSize = "1024x1536";

  if (!input.customBaseUrl && !isPlacementVisibleForKit(placement, kitType)) {
    throw new Error(`Placement "${placement}" is not visible in the ${kitType} source photograph`);
  }

  if (!input.sponsorLogoUrl) {
    throw new Error(
      "No sponsor logo uploaded. Upload a logo in Brand Assets before generating a jersey mockup.",
    );
  }

  const [base, rawLogo] = await Promise.all([
    input.customBaseUrl ? loadCustomBase(input.customBaseUrl) : loadJerseySource(kitType, placement),
    fetchSponsorLogo(input.sponsorLogoUrl),
  ]);
  const logo = await preprocessSponsorLogo(rawLogo);

  const result = await runSponsorImageEdit({
    baseImage: base.buffer,
    baseFilename: base.filename,
    baseMimeType: base.mimeType,
    sponsorLogo: logo,
    sponsorName: input.sponsorName,
    placement: `jersey ${placement}`,
    prompt: buildJerseyPlacementPrompt({ placement, kitType }),
    size: outputSize,
    quality: input.quality ?? "high",
  });

  return {
    ...result,
    placement,
    usedLogo: true,
    kitType,
    logo: {
      originalWidth: logo.originalWidth,
      originalHeight: logo.originalHeight,
      width: logo.width,
      height: logo.height,
      hadTransparency: logo.hadTransparency,
      backgroundRemoved: logo.backgroundRemoved,
      upscaled: logo.upscaled,
    },
  };
}
