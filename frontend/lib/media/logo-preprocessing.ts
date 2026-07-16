import { createHash } from "crypto";
import { isIP } from "net";
import sharp from "sharp";

const MAX_LOGO_BYTES = 25 * 1024 * 1024;
const MIN_LOGO_LONG_EDGE = 1536;
const LOGO_CACHE_LIMIT = Math.max(1, Number(process.env.IMAGE_LOGO_CACHE_ENTRIES ?? "24") || 24);
const processedLogoCache = new Map<string, PreparedLogo>();

export type PreparedLogo = {
  original: Buffer;
  processed: Buffer;
  originalMimeType: string;
  processedMimeType: "image/png";
  originalWidth: number;
  originalHeight: number;
  width: number;
  height: number;
  hadTransparency: boolean;
  backgroundRemoved: boolean;
  upscaled: boolean;
  originalSha256: string;
  processedSha256: string;
};

function clonePreparedLogo(logo: PreparedLogo): PreparedLogo {
  return {
    ...logo,
    original: Buffer.from(logo.original),
    processed: Buffer.from(logo.processed),
  };
}

function cachePreparedLogo(key: string, logo: PreparedLogo): void {
  processedLogoCache.delete(key);
  processedLogoCache.set(key, clonePreparedLogo(logo));
  while (processedLogoCache.size > LOGO_CACHE_LIMIT) {
    const oldest = processedLogoCache.keys().next().value as string | undefined;
    if (!oldest) break;
    processedLogoCache.delete(oldest);
  }
}

function sha256(buffer: Buffer): string {
  return createHash("sha256").update(buffer).digest("hex");
}

function mimeForFormat(format?: string): string {
  if (format === "png") return "image/png";
  if (format === "webp") return "image/webp";
  if (format === "gif") return "image/gif";
  if (format === "svg") return "image/svg+xml";
  return "image/jpeg";
}

function colorDistance(
  r: number,
  g: number,
  b: number,
  bgR: number,
  bgG: number,
  bgB: number,
): number {
  // Weighted RGB distance. Green receives more weight to better approximate
  // perceptual distance while leaving source RGB values completely untouched.
  const dr = r - bgR;
  const dg = g - bgG;
  const db = b - bgB;
  return Math.sqrt(0.3 * dr * dr + 0.59 * dg * dg + 0.11 * db * db);
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)] ?? 255;
}

function borderSamples(
  data: Buffer,
  width: number,
  height: number,
  channels: number,
): Array<[number, number, number]> {
  const samples: Array<[number, number, number]> = [];
  const step = Math.max(1, Math.floor(Math.min(width, height) / 128));
  const add = (x: number, y: number) => {
    const offset = (y * width + x) * channels;
    samples.push([data[offset], data[offset + 1], data[offset + 2]]);
  };

  for (let x = 0; x < width; x += step) {
    add(x, 0);
    if (height > 1) add(x, height - 1);
  }
  for (let y = step; y < height - 1; y += step) {
    add(0, y);
    if (width > 1) add(width - 1, y);
  }
  return samples;
}

function removeConnectedBackground(
  data: Buffer,
  width: number,
  height: number,
): { data: Buffer; removed: boolean } {
  const samples = borderSamples(data, width, height, 4);
  const bgR = median(samples.map((sample) => sample[0]));
  const bgG = median(samples.map((sample) => sample[1]));
  const bgB = median(samples.map((sample) => sample[2]));
  const borderDistances = samples
    .map(([r, g, b]) => colorDistance(r, g, b, bgR, bgG, bgB))
    .sort((a, b) => a - b);
  const p90 = borderDistances[Math.floor(borderDistances.length * 0.9)] ?? 255;

  // Any uniform border color counts as a "solid background" per spec (white
  // or colored) — the flood fill below still only removes connected regions
  // matched to that exact sampled color, so intentional colored artwork in
  // the interior of the logo remains untouched.
  if (p90 > 24) {
    return { data, removed: false };
  }

  const pixelCount = width * height;
  const visited = new Uint8Array(pixelCount);
  const queue = new Uint32Array(pixelCount);
  let read = 0;
  let write = 0;
  let removedPixels = 0;
  const coreThreshold = Math.max(8, p90 + 5);
  const featherThreshold = Math.min(64, coreThreshold + 42);

  const enqueue = (index: number) => {
    if (!visited[index]) {
      visited[index] = 1;
      queue[write++] = index;
    }
  };

  for (let x = 0; x < width; x++) {
    enqueue(x);
    enqueue((height - 1) * width + x);
  }
  for (let y = 1; y < height - 1; y++) {
    enqueue(y * width);
    enqueue(y * width + width - 1);
  }

  while (read < write) {
    const index = queue[read++];
    const offset = index * 4;
    const distance = colorDistance(data[offset], data[offset + 1], data[offset + 2], bgR, bgG, bgB);
    if (distance > featherThreshold) continue;

    // Only alpha changes. Original RGB values are never blurred, softened, or
    // recolored. The ramp retains anti-aliased edge coverage.
    const alpha =
      distance <= coreThreshold
        ? 0
        : Math.round((255 * (distance - coreThreshold)) / (featherThreshold - coreThreshold));
    if (alpha < data[offset + 3]) {
      data[offset + 3] = alpha;
      removedPixels++;
    }

    const x = index % width;
    const y = Math.floor(index / width);
    if (x > 0) enqueue(index - 1);
    if (x + 1 < width) enqueue(index + 1);
    if (y > 0) enqueue(index - width);
    if (y + 1 < height) enqueue(index + width);
  }

  return {
    data,
    removed: removedPixels > Math.max(16, pixelCount * 0.005),
  };
}

export async function preprocessSponsorLogo(logoBuffer: Buffer): Promise<PreparedLogo> {
  if (logoBuffer.length < 100) throw new Error("Sponsor logo file is empty");
  if (logoBuffer.length > MAX_LOGO_BYTES) {
    throw new Error("Sponsor logo exceeds the 25 MB production limit");
  }
  const cacheKey = sha256(logoBuffer);
  const cached = processedLogoCache.get(cacheKey);
  if (cached) return clonePreparedLogo(cached);

  const originalMeta = await sharp(logoBuffer, {
    failOn: "error",
    limitInputPixels: 100_000_000,
  }).metadata();
  const originalWidth = originalMeta.width ?? 0;
  const originalHeight = originalMeta.height ?? 0;
  if (!originalWidth || !originalHeight) {
    throw new Error("Sponsor logo dimensions could not be read");
  }

  const stats = originalMeta.hasAlpha ? await sharp(logoBuffer).ensureAlpha().stats() : null;
  const hadTransparency =
    Boolean(originalMeta.hasAlpha) && Boolean(stats?.channels[3] && stats.channels[3].min < 255);

  let pngBuffer: Buffer;
  let backgroundRemoved = false;

  if (hadTransparency) {
    // Preserve an already transparent PNG byte-for-byte unless the mandatory
    // minimum-resolution rule requires upscaling below.
    pngBuffer =
      originalMeta.format === "png"
        ? logoBuffer
        : await sharp(logoBuffer).png({ compressionLevel: 9 }).toBuffer();
  } else {
    const decoded = await sharp(logoBuffer)
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    const result = removeConnectedBackground(
      Buffer.from(decoded.data),
      decoded.info.width,
      decoded.info.height,
    );
    backgroundRemoved = result.removed;
    pngBuffer = await sharp(result.data, {
      raw: {
        width: decoded.info.width,
        height: decoded.info.height,
        channels: 4,
      },
    })
      .png({ compressionLevel: 9 })
      .toBuffer();
  }

  const longEdge = Math.max(originalWidth, originalHeight);
  const upscaled = longEdge < MIN_LOGO_LONG_EDGE;
  if (upscaled) {
    const scale = MIN_LOGO_LONG_EDGE / longEdge;
    pngBuffer = await sharp(pngBuffer)
      .resize({
        width: Math.round(originalWidth * scale),
        height: Math.round(originalHeight * scale),
        fit: "fill",
        kernel: sharp.kernel.lanczos3,
        withoutEnlargement: false,
      })
      .png({ compressionLevel: 9 })
      .toBuffer();
  }

  const processedMeta = await sharp(pngBuffer).metadata();
  const prepared: PreparedLogo = {
    original: logoBuffer,
    processed: pngBuffer,
    originalMimeType: mimeForFormat(originalMeta.format),
    processedMimeType: "image/png",
    originalWidth,
    originalHeight,
    width: processedMeta.width ?? originalWidth,
    height: processedMeta.height ?? originalHeight,
    hadTransparency,
    backgroundRemoved,
    upscaled,
    originalSha256: sha256(logoBuffer),
    processedSha256: sha256(pngBuffer),
  };
  cachePreparedLogo(cacheKey, prepared);
  return prepared;
}

export async function fetchSponsorLogo(url: string): Promise<Buffer> {
  const parsed = new URL(url);
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    throw new Error("Sponsor logo URL must use HTTPS or HTTP");
  }
  const host = parsed.hostname.toLowerCase();
  const privateIpv4 = /^(127\.|10\.|0\.|169\.254\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(
    host,
  );
  if (
    host === "localhost" ||
    host.endsWith(".local") ||
    privateIpv4 ||
    (isIP(host) === 6 && (host === "::1" || host.startsWith("fc") || host.startsWith("fd")))
  ) {
    throw new Error("Sponsor logo URL cannot target a private network");
  }

  const response = await fetch(parsed, {
    signal: AbortSignal.timeout(20_000),
    headers: { "User-Agent": "Coritiba-Sponsorship-Platform/2.0" },
    redirect: "error",
  });
  if (!response.ok) {
    throw new Error(`Sponsor logo fetch failed: HTTP ${response.status}`);
  }
  const contentLength = Number(response.headers.get("content-length") ?? "0");
  if (contentLength > MAX_LOGO_BYTES) {
    throw new Error("Sponsor logo exceeds the 25 MB production limit");
  }

  const buffer = Buffer.from(await response.arrayBuffer());
  if (buffer.length > MAX_LOGO_BYTES) {
    throw new Error("Sponsor logo exceeds the 25 MB production limit");
  }
  return buffer;
}
