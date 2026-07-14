import path from "path";
import fs from "fs/promises";
import sharp from "sharp";
import type { JerseyPlacementId } from "./jersey-placements";
import { getPlacement } from "./jersey-placements";

const KIT_FILENAMES: Record<string, string> = {
  flat: "coritiba-jersey-base.jpg",
  home: "coritiba-jersey-home.jpg",
  training: "coritiba-jersey-training.jpg",
  goalkeeper: "coritiba-jersey-goalkeeper.jpg",
};

function baseImagePath(kitType?: string): string {
  const filename = KIT_FILENAMES[kitType ?? "flat"] ?? KIT_FILENAMES.flat;
  return path.join(process.cwd(), "public", "mockups", filename);
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function truncateLabel(name: string, max = 28): string {
  const t = name.trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max - 1)}…`;
}

function buildTextOverlaySvg(
  sponsorName: string,
  width: number,
  height: number
): Buffer {
  const label = escapeXml(truncateLabel(sponsorName.toUpperCase()));
  const availableWidth = width * 0.92;
  const rawFontSize = (availableWidth / label.length - 1) / 0.58;
  const fontSize = Math.max(9, Math.min(38, Math.floor(rawFontSize)));
  const pad = Math.max(4, Math.round(height * 0.12));
  return Buffer.from(
    `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <filter id="dropshadow" x="-10%" y="-10%" width="120%" height="120%">
          <feDropShadow dx="0" dy="1" stdDeviation="2" flood-color="rgba(0,0,0,0.55)"/>
        </filter>
      </defs>
      <rect x="1" y="1" width="${width - 2}" height="${height - 2}" rx="5"
        fill="rgba(0,0,0,0.35)" filter="url(#dropshadow)"/>
      <rect x="0" y="0" width="${width}" height="${height}" rx="5"
        fill="rgba(18,58,30,0.88)"/>
      <rect x="0" y="0" width="${width}" height="2" rx="5"
        fill="rgba(255,255,255,0.25)"/>
      <text x="${width / 2}" y="${height / 2 + pad * 0.15}"
        dominant-baseline="middle" text-anchor="middle"
        font-family="Arial Black, Arial, Helvetica, sans-serif"
        font-weight="900" font-size="${fontSize}"
        letter-spacing="1"
        fill="#ffffff">${label}</text>
    </svg>`
  );
}

async function fetchLogoBuffer(url: string): Promise<Buffer | null> {
  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(12_000),
      headers: { "User-Agent": "Coritiba-Sponsorship-Platform/1.0" },
    });
    if (!res.ok) {
      console.warn(`[jersey-composite] Logo fetch failed: HTTP ${res.status} for ${url}`);
      return null;
    }
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length < 100) {
      console.warn(`[jersey-composite] Logo buffer too small (${buf.length} bytes) — falling back to text`);
      return null;
    }
    return buf;
  } catch (err) {
    console.warn(`[jersey-composite] Logo fetch error: ${err instanceof Error ? err.message : err}`);
    return null;
  }
}

/**
 * White badge background so the logo is always visible on the dark green jersey fabric.
 */
function buildLogoBadgeSvg(zoneW: number, zoneH: number): string {
  return `<svg width="${zoneW}" height="${zoneH}" xmlns="http://www.w3.org/2000/svg">
    <rect x="0" y="0" width="${zoneW}" height="${zoneH}" rx="5"
      fill="rgba(255,255,255,0.92)"/>
    <rect x="0" y="${zoneH - 2}" width="${zoneW}" height="2" rx="0"
      fill="rgba(18,58,30,0.5)"/>
  </svg>`;
}

export type CompositeJerseyInput = {
  sponsorName: string;
  sponsorLogoUrl?: string | null;
  placement?: JerseyPlacementId;
  kitType?: "flat" | "home" | "training" | "goalkeeper";
  /**
   * When true, fall back to a text badge if the logo can't be fetched.
   * Default: false — logo is REQUIRED; a missing/broken logo throws an error
   * so the caller knows exactly what happened instead of silently changing the image.
   */
  allowTextFallback?: boolean;
};

export type CompositeJerseyResult = {
  buffer: Buffer;
  width: number;
  height: number;
  placement: JerseyPlacementId;
  usedLogo: boolean;
  kitType: string;
};

/**
 * Composite sponsor onto official kit photo.
 * The club crest baked into the base image is NEVER modified.
 * The sponsor logo is ALWAYS the one uploaded by the user — generation fails
 * if no logo is available (unless allowTextFallback is explicitly set).
 */
export async function compositeJerseyMockup(
  input: CompositeJerseyInput
): Promise<CompositeJerseyResult> {
  const placementId = input.placement ?? "chest_sponsor";
  const zone = getPlacement(placementId);
  if (!zone?.enabled) {
    throw new Error(`Placement "${placementId}" is not available yet`);
  }

  const basePath = baseImagePath(input.kitType);
  try {
    await fs.access(basePath);
  } catch {
    throw new Error(`Jersey base image missing at ${basePath}`);
  }

  const base = sharp(basePath);
  const meta = await base.metadata();
  const imgW = meta.width ?? 858;
  const imgH = meta.height ?? 1080;

  const left = Math.round(zone.x * imgW);
  const top = Math.round(zone.y * imgH);
  const zoneW = Math.max(40, Math.round(zone.w * imgW));
  const zoneH = Math.max(24, Math.round(zone.h * imgH));

  let overlayPng: Buffer;
  let usedLogo = false;

  if (!input.sponsorLogoUrl) {
    if (!input.allowTextFallback) {
      throw new Error(
        "No sponsor logo uploaded. Upload a logo in Brand Assets before generating a jersey mockup."
      );
    }
    overlayPng = await sharp(buildTextOverlaySvg(input.sponsorName, zoneW, zoneH))
      .png()
      .toBuffer();
  } else {
    const logoBuf = await fetchLogoBuffer(input.sponsorLogoUrl);
    if (!logoBuf) {
      if (!input.allowTextFallback) {
        throw new Error(
          "Could not load the sponsor logo from its URL. Please re-upload the logo in Brand Assets and try again."
        );
      }
      // allowTextFallback: degrade gracefully
      overlayPng = await sharp(buildTextOverlaySvg(input.sponsorName, zoneW, zoneH))
        .png()
        .toBuffer();
    } else {
      // Composite logo onto a white badge background so it's always visible on dark fabric
      const padPx = 8;
      const logoW = Math.max(20, zoneW - padPx * 2);
      const logoH = Math.max(14, zoneH - padPx * 2);

      const badgeSvg = Buffer.from(buildLogoBadgeSvg(zoneW, zoneH));

      const logoResized = await sharp(logoBuf)
        .resize(logoW, logoH, { fit: "contain", background: { r: 255, g: 255, b: 255, alpha: 0 } })
        .png()
        .toBuffer();

      overlayPng = await sharp(badgeSvg)
        .composite([{ input: logoResized, left: padPx, top: padPx }])
        .png()
        .toBuffer();

      usedLogo = true;
    }
  }

  const buffer = await base
    .composite([{ input: overlayPng, left, top }])
    .jpeg({ quality: 92 })
    .toBuffer();

  return {
    buffer,
    width: imgW,
    height: imgH,
    placement: placementId,
    usedLogo,
    kitType: input.kitType ?? "flat",
  };
}
