import fs from "fs/promises";
import path from "path";
import sharp from "sharp";
import type { CampaignSceneType } from "./image-prompts";
import type { JerseyPlacementId } from "./jersey-placements";
import type { StadiumBaseId } from "./stadium-placements";

export type SourceImageAsset = {
  buffer: Buffer;
  absolutePath: string;
  filename: string;
  mimeType: "image/jpeg" | "image/png";
  width: number;
  height: number;
};

// One fixed, real base photograph per kit type. The primary path is the
// full-resolution source in assets/; the public/ copy is the guaranteed
// fallback so the app never depends on the assets/ folder at runtime.
const JERSEY_SOURCES: Record<string, string[]> = {
  // Full-body match photo (shirt + shorts + socks all visible) — real photo,
  // replaces the old technical-drawing flat lay.
  flat: ["assets/jerseys/shorts/DSCF8523.jpg", "frontend/public/mockups/coritiba-jersey-flat.jpg"],
  home: ["assets/jerseys/home/DSCF4975.jpg", "frontend/public/mockups/coritiba-jersey-home.jpg"],
  training: [
    "assets/jerseys/training/DSCF2843.jpg",
    "frontend/public/mockups/coritiba-jersey-training.jpg",
  ],
  goalkeeper: [
    "assets/jerseys/goalkeeper/DSCF5278.jpg",
    "frontend/public/mockups/coritiba-jersey-goalkeeper.jpg",
  ],
};

/**
 * Per-(kit, placement) base photo overrides.
 *
 * The default kit photo (JERSEY_SOURCES) is a front, waist-up shot that only
 * shows the chest and sleeves. Placements on other body parts (back, number,
 * shorts, socks) need a real photo that actually shows that zone, otherwise the
 * model has nothing to place the logo onto. Each entry below is a real match
 * photograph of the SAME kit where the target zone is clearly visible.
 *
 * Only combinations backed by a real photo are listed. Placements not listed
 * here fall back to the default kit photo; placements with no real photo at all
 * are kept disabled per-kit in jersey-placements.ts (JERSEY_KIT_PLACEMENTS).
 */
const JERSEY_PLACEMENT_SOURCES: Partial<
  Record<string, Partial<Record<JerseyPlacementId, string[]>>>
> = {
  home: {
    // Back panel / number — rear full-body match photo (number 7 visible).
    back: ["assets/jerseys/home/DSCF6251.jpg", "frontend/public/mockups/coritiba-jersey-home-back.jpg"],
    number: [
      "assets/jerseys/home/DSCF6251.jpg",
      "frontend/public/mockups/coritiba-jersey-home-back.jpg",
    ],
    // Shorts / socks — front full-body match photo (white shorts + socks visible).
    shorts: [
      "assets/jerseys/shorts/CFC-45.jpg.jpeg",
      "frontend/public/mockups/coritiba-jersey-home-lower.jpg",
    ],
    socks: [
      "assets/jerseys/shorts/CFC-45.jpg.jpeg",
      "frontend/public/mockups/coritiba-jersey-home-lower.jpg",
    ],
  },
  goalkeeper: {
    // Shorts / socks — full-body GK photo (green shorts + socks visible).
    shorts: [
      "assets/jerseys/goalkeeper/DSCF8484.jpg",
      "frontend/public/mockups/coritiba-jersey-goalkeeper-lower.jpg",
    ],
    socks: [
      "assets/jerseys/goalkeeper/DSCF8484.jpg",
      "frontend/public/mockups/coritiba-jersey-goalkeeper-lower.jpg",
    ],
  },
};

const STADIUM_SOURCES: Record<StadiumBaseId, string[]> = {
  matchday: ["frontend/public/mockups/stadium/couto-pereira-matchday.jpg"],
  aerial_day: ["frontend/public/mockups/stadium/couto-pereira-aerial-day.jpg"],
  night: ["frontend/public/mockups/stadium/couto-pereira-night.jpg"],
  overhead: ["frontend/public/mockups/stadium/couto-pereira-overhead.jpg"],
};

const CAMPAIGN_SOURCES: Record<CampaignSceneType, string[]> = {
  matchday_street: [
    "assets/stadium/fans/DSC02958.JPG",
    "frontend/public/mockups/coritiba-jersey-home.jpg",
  ],
  training_ground: [
    "assets/jerseys/training/DSCF2843.jpg",
    "frontend/public/mockups/coritiba-jersey-training.jpg",
  ],
  fan_lifestyle: [
    "assets/stadium/fans/DSC05256.JPG",
    "frontend/public/mockups/coritiba-jersey-home.jpg",
  ],
};

function repositoryRoot(): string {
  return path.basename(process.cwd()) === "frontend"
    ? path.resolve(process.cwd(), "..")
    : process.cwd();
}

/**
 * Maximum long-edge size for a base photo sent to the OpenAI edit API.
 *
 * The whole photograph is preserved (aspect ratio kept, no cropping/reframing);
 * we only shrink oversized images. Very large multi-megabyte bases push the edit
 * request past the timeout, so bounding the long edge keeps generations fast and
 * reliable while staying well above the model's effective working resolution.
 */
const MAX_BASE_LONG_EDGE = 1536;

/**
 * Downscales a base photo so its longest side is at most MAX_BASE_LONG_EDGE.
 * Only ever shrinks — never enlarges — and preserves the full frame and aspect
 * ratio. Returns the original buffer/metadata untouched when already small.
 */
async function boundBaseImage(asset: SourceImageAsset): Promise<SourceImageAsset> {
  const longEdge = Math.max(asset.width, asset.height);
  if (longEdge <= MAX_BASE_LONG_EDGE) return asset;

  const resized = await sharp(asset.buffer, { failOn: "error", limitInputPixels: 100_000_000 })
    .rotate()
    .resize({
      width: asset.width >= asset.height ? MAX_BASE_LONG_EDGE : undefined,
      height: asset.height > asset.width ? MAX_BASE_LONG_EDGE : undefined,
      fit: "inside",
      withoutEnlargement: true,
    })
    .jpeg({ quality: 92 })
    .toBuffer({ resolveWithObject: true });

  return {
    ...asset,
    buffer: resized.data,
    mimeType: "image/jpeg",
    filename: asset.filename.replace(/\.(png|jpe?g)$/i, "") + ".jpg",
    width: resized.info.width,
    height: resized.info.height,
  };
}

async function readHighestResolution(relativeCandidates: string[]): Promise<SourceImageAsset> {
  const candidates: SourceImageAsset[] = [];
  for (const relativePath of relativeCandidates) {
    const absolutePath = path.join(repositoryRoot(), relativePath);
    try {
      const buffer = await fs.readFile(absolutePath);
      const metadata = await sharp(buffer, {
        failOn: "error",
        limitInputPixels: 100_000_000,
      }).metadata();
      if (!metadata.width || !metadata.height) continue;
      candidates.push({
        buffer,
        absolutePath,
        filename: path.basename(absolutePath),
        mimeType: metadata.format === "png" ? "image/png" : "image/jpeg",
        width: metadata.width,
        height: metadata.height,
      });
    } catch {
      // Try the next production asset candidate.
    }
  }

  if (!candidates.length) {
    throw new Error(`No source photograph found: ${relativeCandidates.join(", ")}`);
  }
  candidates.sort((a, b) => b.width * b.height - a.width * a.height);
  return boundBaseImage(candidates[0]);
}

export function loadJerseySource(
  kitType: string,
  placement?: JerseyPlacementId,
): Promise<SourceImageAsset> {
  const placementOverride = placement
    ? JERSEY_PLACEMENT_SOURCES[kitType]?.[placement]
    : undefined;
  const candidates = placementOverride ?? JERSEY_SOURCES[kitType] ?? JERSEY_SOURCES.flat;
  return readHighestResolution(candidates);
}

export function loadStadiumSource(baseId: StadiumBaseId): Promise<SourceImageAsset> {
  return readHighestResolution(STADIUM_SOURCES[baseId]);
}

export function loadCampaignSource(scene: CampaignSceneType): Promise<SourceImageAsset> {
  return readHighestResolution(CAMPAIGN_SOURCES[scene]);
}

const MAX_CUSTOM_BASE_BYTES = 25 * 1024 * 1024;

async function fetchCustomBaseBuffer(source: string): Promise<Buffer> {
  if (source.startsWith("data:")) {
    const comma = source.indexOf(",");
    if (comma === -1) throw new Error("Invalid base image data URL");
    const meta = source.slice(5, comma);
    if (!meta.includes(";base64")) throw new Error("Base image data URL must be base64 encoded");
    const buffer = Buffer.from(source.slice(comma + 1), "base64");
    if (buffer.length > MAX_CUSTOM_BASE_BYTES) {
      throw new Error("Uploaded base image exceeds the 25 MB limit");
    }
    return buffer;
  }

  const parsed = new URL(source);
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    throw new Error("Base image URL must use HTTPS or HTTP");
  }
  const host = parsed.hostname.toLowerCase();
  const privateIpv4 = /^(127\.|10\.|0\.|169\.254\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(host);
  if (host === "localhost" || host.endsWith(".local") || privateIpv4) {
    throw new Error("Base image URL cannot target a private network");
  }
  const response = await fetch(parsed, {
    signal: AbortSignal.timeout(20_000),
    headers: { "User-Agent": "Coritiba-Sponsorship-Platform/2.0" },
    redirect: "error",
  });
  if (!response.ok) throw new Error(`Base image fetch failed: HTTP ${response.status}`);
  const buffer = Buffer.from(await response.arrayBuffer());
  if (buffer.length > MAX_CUSTOM_BASE_BYTES) {
    throw new Error("Uploaded base image exceeds the 25 MB limit");
  }
  return buffer;
}

/**
 * Loads a user-provided base image (http/https URL or base64 data URL) into a
 * SourceImageAsset. Used when the operator uploads their own jersey/stadium photo
 * instead of the built-in Coritiba bases. The image is sent to the model as-is;
 * it is never cropped or reframed here.
 */
export async function loadCustomBase(source: string): Promise<SourceImageAsset> {
  const buffer = await fetchCustomBaseBuffer(source);
  const metadata = await sharp(buffer, { failOn: "error", limitInputPixels: 100_000_000 }).metadata();
  if (!metadata.width || !metadata.height) {
    throw new Error("Uploaded base image dimensions could not be read");
  }
  const isPng = metadata.format === "png";
  const asset: SourceImageAsset = {
    buffer,
    absolutePath: "custom-upload",
    filename: isPng ? "custom-base.png" : "custom-base.jpg",
    mimeType: isPng ? "image/png" : "image/jpeg",
    width: metadata.width,
    height: metadata.height,
  };
  // Uploaded phone photos are often huge; bound the long edge so the edit
  // request stays within the timeout. The full frame is preserved.
  return boundBaseImage(asset);
}
