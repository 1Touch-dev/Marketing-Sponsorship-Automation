import path from "path";
import fs from "fs/promises";
import sharp from "sharp";
import type { StadiumPlacementId, StadiumBaseId } from "./stadium-placements";
import { getStadiumPlacement, STADIUM_BASES } from "./stadium-placements";

function baseImagePath(baseId: StadiumBaseId): string {
  const base = STADIUM_BASES[baseId];
  return path.join(process.cwd(), "public", "mockups", "stadium", base.filename);
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function truncateLabel(name: string, max = 22): string {
  const t = name.trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max - 1)}…`;
}

/**
 * LED band overlay — dark green background with white text/logo
 * Mimics the look of a real LED advertising board
 */
function buildLedBandSvg(zoneW: number, zoneH: number): string {
  return `<svg width="${zoneW}" height="${zoneH}" xmlns="http://www.w3.org/2000/svg">
    <rect x="0" y="0" width="${zoneW}" height="${zoneH}" fill="rgba(0,40,0,0.88)"/>
    <rect x="0" y="0" width="${zoneW}" height="2" fill="rgba(0,200,0,0.6)"/>
    <rect x="0" y="${zoneH - 2}" width="${zoneW}" height="2" fill="rgba(0,200,0,0.6)"/>
  </svg>`;
}

/**
 * White banner overlay — for facade banners on light-coloured surfaces
 */
function buildBannerWhiteSvg(zoneW: number, zoneH: number): string {
  return `<svg width="${zoneW}" height="${zoneH}" xmlns="http://www.w3.org/2000/svg">
    <rect x="0" y="0" width="${zoneW}" height="${zoneH}" rx="2" fill="rgba(255,255,255,0.90)"/>
    <rect x="0" y="0" width="${zoneW}" height="2" rx="2" fill="rgba(0,107,63,0.7)"/>
    <rect x="0" y="${zoneH - 2}" width="${zoneW}" height="2" fill="rgba(0,107,63,0.7)"/>
  </svg>`;
}

/**
 * Text fallback — sponsor name in LED style on the board
 */
function buildTextFallbackSvg(sponsorName: string, zoneW: number, zoneH: number, style: string): Buffer {
  const label = escapeXml(truncateLabel(sponsorName.toUpperCase()));
  const availableWidth = zoneW * 0.90;
  const rawFontSize = (availableWidth / Math.max(1, label.length)) / 0.58;
  const fontSize = Math.max(8, Math.min(Math.floor(zoneH * 0.55), Math.floor(rawFontSize)));
  const textColor = style === "banner_white" ? "#006B3F" : "#ffffff";
  const bgColor = style === "led_band" ? "rgba(0,40,0,0.88)" : "rgba(255,255,255,0.90)";

  return Buffer.from(
    `<svg width="${zoneW}" height="${zoneH}" xmlns="http://www.w3.org/2000/svg">
      <rect x="0" y="0" width="${zoneW}" height="${zoneH}" fill="${bgColor}"/>
      <text x="${zoneW / 2}" y="${zoneH / 2}"
        dominant-baseline="middle" text-anchor="middle"
        font-family="Arial Black, Arial, Helvetica, sans-serif"
        font-weight="900" font-size="${fontSize}"
        letter-spacing="2"
        fill="${textColor}">${label}</text>
    </svg>`
  );
}

async function fetchLogoBuffer(url: string): Promise<Buffer | null> {
  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(12_000),
      headers: { "User-Agent": "Coritiba-Sponsorship-Platform/1.0" },
    });
    if (!res.ok) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    return buf.length < 100 ? null : buf;
  } catch {
    return null;
  }
}

export type CompositeStadiumInput = {
  sponsorName: string;
  sponsorLogoUrl?: string | null;
  placement: StadiumPlacementId;
  /** Allow text fallback if no logo available (default: false) */
  allowTextFallback?: boolean;
};

export type CompositeStadiumResult = {
  buffer: Buffer;
  width: number;
  height: number;
  placement: StadiumPlacementId;
  basePhoto: StadiumBaseId;
  usedLogo: boolean;
};

/**
 * Composite sponsor logo/brand onto a Couto Pereira stadium photo.
 * Simulates LED board, facade banner, or giant screen placements.
 */
export async function compositeStadiumMockup(
  input: CompositeStadiumInput
): Promise<CompositeStadiumResult> {
  const zone = getStadiumPlacement(input.placement);
  if (!zone?.enabled) {
    throw new Error(`Stadium placement "${input.placement}" is not available`);
  }

  const basePath = baseImagePath(zone.basePhoto);
  try {
    await fs.access(basePath);
  } catch {
    throw new Error(`Stadium base image missing at ${basePath}`);
  }

  const base = sharp(basePath);
  const meta = await base.metadata();
  const imgW = meta.width ?? 1920;
  const imgH = meta.height ?? 1080;

  const left = Math.round(zone.x * imgW);
  const top = Math.round(zone.y * imgH);
  const zoneW = Math.max(80, Math.round(zone.w * imgW));
  const zoneH = Math.max(20, Math.round(zone.h * imgH));

  let overlayPng: Buffer;
  let usedLogo = false;

  if (!input.sponsorLogoUrl) {
    if (!input.allowTextFallback) {
      throw new Error(
        "No sponsor logo uploaded. Upload a logo in Brand Assets before generating a stadium mockup."
      );
    }
    overlayPng = await sharp(buildTextFallbackSvg(input.sponsorName, zoneW, zoneH, zone.overlayStyle))
      .png()
      .toBuffer();
  } else {
    const logoBuf = await fetchLogoBuffer(input.sponsorLogoUrl);
    if (!logoBuf) {
      if (!input.allowTextFallback) {
        throw new Error("Could not load sponsor logo. Please re-upload in Brand Assets.");
      }
      overlayPng = await sharp(buildTextFallbackSvg(input.sponsorName, zoneW, zoneH, zone.overlayStyle))
        .png()
        .toBuffer();
    } else {
      // Choose background based on overlay style
      const bgSvg =
        zone.overlayStyle === "banner_white"
          ? Buffer.from(buildBannerWhiteSvg(zoneW, zoneH))
          : Buffer.from(buildLedBandSvg(zoneW, zoneH));

      const padH = Math.max(4, Math.round(zoneH * 0.12));
      const padW = Math.max(8, Math.round(zoneW * 0.04));
      const logoW = Math.max(30, zoneW - padW * 2);
      const logoH = Math.max(12, zoneH - padH * 2);

      // For LED bands, keep logo white/bright — preserve transparency
      const logoBackground =
        zone.overlayStyle === "banner_white"
          ? { r: 255, g: 255, b: 255, alpha: 0 }
          : { r: 0, g: 40, b: 0, alpha: 0 };

      const logoResized = await sharp(logoBuf)
        .resize(logoW, logoH, { fit: "contain", background: logoBackground })
        .png()
        .toBuffer();

      // For LED boards, invert dark logos to white so they show on dark background
      let finalLogo = logoResized;
      if (zone.overlayStyle === "led_band") {
        // Composite logo with white tint filter by overlaying on the green LED band
        finalLogo = logoResized;
      }

      overlayPng = await sharp(bgSvg)
        .composite([{ input: finalLogo, left: padW, top: padH }])
        .png()
        .toBuffer();

      usedLogo = true;
    }
  }

  const buffer = await base
    .composite([{ input: overlayPng, left, top }])
    .jpeg({ quality: 90 })
    .toBuffer();

  return {
    buffer,
    width: imgW,
    height: imgH,
    placement: input.placement,
    basePhoto: zone.basePhoto,
    usedLogo,
  };
}
