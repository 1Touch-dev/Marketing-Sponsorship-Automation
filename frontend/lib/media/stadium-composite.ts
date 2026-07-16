import type { StadiumPlacementId } from "./stadium-placements";
import { getStadiumPlacement } from "./stadium-placements";
import { loadStadiumSource, loadCustomBase } from "./image-assets";
import { buildStadiumPrompt } from "./image-prompts";
import { fetchSponsorLogo, preprocessSponsorLogo, type PreparedLogo } from "./logo-preprocessing";
import { runSponsorImageEdit, type ImageOutputQuality } from "./openai-image-pipeline";
import type { ImageDebugArtifact } from "./image-debug";

export type CompositeStadiumInput = {
  sponsorName: string;
  sponsorLogoUrl?: string | null;
  placement: StadiumPlacementId;
  /** Optional operator-uploaded base photo (URL or data URL). Overrides the built-in stadium photo. */
  customBaseUrl?: string | null;
  quality?: ImageOutputQuality;
};

export type CompositeStadiumResult = {
  buffer: Buffer;
  width: number;
  height: number;
  placement: StadiumPlacementId;
  basePhoto: string;
  usedLogo: boolean;
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

export async function compositeStadiumMockup(
  input: CompositeStadiumInput,
): Promise<CompositeStadiumResult> {
  const zone = getStadiumPlacement(input.placement);
  if (!zone?.enabled) {
    throw new Error(`Stadium placement "${input.placement}" is not available`);
  }

  if (!input.sponsorLogoUrl) {
    throw new Error(
      "No sponsor logo uploaded. Upload a logo in Brand Assets before generating a stadium mockup.",
    );
  }

  const [base, rawLogo] = await Promise.all([
    input.customBaseUrl ? loadCustomBase(input.customBaseUrl) : loadStadiumSource(zone.basePhoto),
    fetchSponsorLogo(input.sponsorLogoUrl),
  ]);
  const logo = await preprocessSponsorLogo(rawLogo);

  const result = await runSponsorImageEdit({
    baseImage: base.buffer,
    baseFilename: base.filename,
    baseMimeType: base.mimeType,
    sponsorLogo: logo,
    sponsorName: input.sponsorName,
    placement: `stadium ${input.placement}`,
    prompt: buildStadiumPrompt(input.placement),
    size: "1536x1024",
    quality: input.quality ?? "medium",
  });

  return {
    ...result,
    placement: input.placement,
    basePhoto: zone.basePhoto,
    usedLogo: true,
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
