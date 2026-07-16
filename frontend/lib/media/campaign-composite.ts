import { loadCampaignSource } from "./image-assets";
import { buildCampaignPrompt, type CampaignSceneType } from "./image-prompts";
import { fetchSponsorLogo, preprocessSponsorLogo, type PreparedLogo } from "./logo-preprocessing";
import { runSponsorImageEdit, type ImageOutputQuality } from "./openai-image-pipeline";
import type { ImageDebugArtifact } from "./image-debug";

export type CompositeCampaignResult = {
  buffer: Buffer;
  width: number;
  height: number;
  model: string;
  quality: ImageOutputQuality;
  generationId: string;
  generationMs: number;
  scene: CampaignSceneType;
  sourceFilename: string;
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

export async function compositeCampaignCreative(input: {
  sponsorName: string;
  sponsorLogoUrl?: string | null;
  scene: CampaignSceneType;
  quality?: ImageOutputQuality;
}): Promise<CompositeCampaignResult> {
  if (!input.sponsorLogoUrl) {
    throw new Error(
      "No sponsor logo uploaded. Upload exact sponsor artwork before generating a campaign creative.",
    );
  }

  const [base, rawLogo] = await Promise.all([
    loadCampaignSource(input.scene),
    fetchSponsorLogo(input.sponsorLogoUrl),
  ]);
  const logo = await preprocessSponsorLogo(rawLogo);

  const result = await runSponsorImageEdit({
    baseImage: base.buffer,
    baseFilename: base.filename,
    baseMimeType: base.mimeType,
    sponsorLogo: logo,
    sponsorName: input.sponsorName,
    placement: `campaign ${input.scene}`,
    prompt: buildCampaignPrompt(input.scene),
    size: base.width >= base.height ? "1536x1024" : "1024x1536",
    quality: input.quality ?? "high",
  });

  return {
    ...result,
    scene: input.scene,
    sourceFilename: base.filename,
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
