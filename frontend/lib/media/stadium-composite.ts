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

function truncateLabel(name: string, max = 28): string {
  const t = name.trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max - 1)}…`;
}

/**
 * Build a full-width LED board panel SVG.
 * The sponsor brand fills the ENTIRE width of the board — no tiny stamps.
 * Includes pixel-grid effect and subtle glow for realism.
 */
function buildLedBoardSvg(sponsorName: string, zoneW: number, zoneH: number): string {
  const label = escapeXml(truncateLabel(sponsorName.toUpperCase()));
  // Font size fills ~60% of the band height
  const fontSize = Math.max(10, Math.min(Math.floor(zoneH * 0.58), 48));
  // Pixel grid cell size (smaller = more realistic LED grid texture)
  const cell = Math.max(2, Math.floor(zoneH / 10));

  return `<svg width="${zoneW}" height="${zoneH}" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <!-- LED pixel grid pattern -->
      <pattern id="ledgrid" width="${cell}" height="${cell}" patternUnits="userSpaceOnUse">
        <rect width="${cell}" height="${cell}" fill="transparent"/>
        <rect x="0.5" y="0.5" width="${cell - 1}" height="${cell - 1}" rx="1"
          fill="rgba(0,0,0,0.18)"/>
      </pattern>
      <!-- Subtle horizontal glow gradient -->
      <linearGradient id="glow" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="rgba(0,180,0,0.15)"/>
        <stop offset="50%" stop-color="rgba(0,0,0,0)"/>
        <stop offset="100%" stop-color="rgba(0,180,0,0.10)"/>
      </linearGradient>
      <!-- White glow for text -->
      <filter id="textglow" x="-5%" y="-30%" width="110%" height="160%">
        <feGaussianBlur stdDeviation="1.5" result="blur"/>
        <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
      </filter>
    </defs>
    <!-- Base: dark green, matches real Coritiba LED boards -->
    <rect x="0" y="0" width="${zoneW}" height="${zoneH}" fill="#001a00"/>
    <!-- Slight green glow overlay -->
    <rect x="0" y="0" width="${zoneW}" height="${zoneH}" fill="url(#glow)"/>
    <!-- LED pixel grid texture -->
    <rect x="0" y="0" width="${zoneW}" height="${zoneH}" fill="url(#ledgrid)"/>
    <!-- Top highlight strip (bright LED row) -->
    <rect x="0" y="0" width="${zoneW}" height="2" fill="rgba(0,255,60,0.35)"/>
    <!-- Bottom highlight strip -->
    <rect x="0" y="${zoneH - 2}" width="${zoneW}" height="2" fill="rgba(0,255,60,0.25)"/>
    <!-- Sponsor name — full width, white, bold -->
    <text x="${zoneW / 2}" y="${zoneH / 2}"
      dominant-baseline="middle" text-anchor="middle"
      font-family="Arial Black, Impact, Arial, Helvetica, sans-serif"
      font-weight="900" font-size="${fontSize}"
      letter-spacing="${Math.max(1, Math.floor(fontSize * 0.08))}"
      fill="#ffffff"
      filter="url(#textglow)">${label}</text>
  </svg>`;
}

/**
 * Build a facade banner SVG — sponsor on a clean white banner with Coritiba green accents.
 * No tiny logo stamp — the brand name fills the full banner width.
 */
function buildFacadeBannerSvg(sponsorName: string, zoneW: number, zoneH: number): string {
  const label = escapeXml(truncateLabel(sponsorName.toUpperCase()));
  const fontSize = Math.max(10, Math.min(Math.floor(zoneH * 0.52), 44));
  const accentH = Math.max(3, Math.floor(zoneH * 0.08));

  return `<svg width="${zoneW}" height="${zoneH}" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <filter id="shadow" x="-2%" y="-10%" width="104%" height="120%">
        <feDropShadow dx="0" dy="1" stdDeviation="2" flood-color="rgba(0,0,0,0.3)"/>
      </filter>
    </defs>
    <!-- White banner background -->
    <rect x="0" y="0" width="${zoneW}" height="${zoneH}" fill="rgba(255,255,255,0.93)" filter="url(#shadow)"/>
    <!-- Green accent top bar -->
    <rect x="0" y="0" width="${zoneW}" height="${accentH}" fill="#006B3F"/>
    <!-- Green accent bottom bar -->
    <rect x="0" y="${zoneH - accentH}" width="${zoneW}" height="${accentH}" fill="#006B3F"/>
    <!-- Sponsor name — Coritiba green, full width -->
    <text x="${zoneW / 2}" y="${zoneH / 2}"
      dominant-baseline="middle" text-anchor="middle"
      font-family="Arial Black, Impact, Arial, Helvetica, sans-serif"
      font-weight="900" font-size="${fontSize}"
      letter-spacing="${Math.max(1, Math.floor(fontSize * 0.06))}"
      fill="#006B3F">${label}</text>
  </svg>`;
}

/**
 * When a logo image is available, build a composite overlay where the logo
 * fills the full width of the zone (not padded down to a tiny stamp).
 *
 * Strategy:
 * - For LED bands: logo is resized to fill the full HEIGHT of the band (max size),
 *   centered horizontally. Text name placed beside it if there's room.
 * - For white banners: logo fills the height with adequate margin, centered.
 */
async function buildLogoOverlay(
  logoBuf: Buffer,
  sponsorName: string,
  zoneW: number,
  zoneH: number,
  style: "led_band" | "banner_white" | "facade_dark"
): Promise<Buffer> {
  // Get logo dimensions to preserve aspect ratio
  const logoMeta = await sharp(logoBuf).metadata();
  const logoAspect = (logoMeta.width ?? 1) / (logoMeta.height ?? 1);

  // Target: logo fills as much height as possible with minimal padding
  const padV = Math.max(3, Math.floor(zoneH * 0.08));
  const maxLogoH = zoneH - padV * 2;
  const maxLogoW = Math.round(maxLogoH * logoAspect);

  // If logo is very wide (e.g. horizontal brand), constrain to 40% of zone width
  const constrainedW = Math.min(maxLogoW, Math.floor(zoneW * 0.40));
  const constrainedH = Math.round(constrainedW / logoAspect);
  const finalLogoH = Math.min(constrainedH, maxLogoH);
  const finalLogoW = Math.round(finalLogoH * logoAspect);

  const isDark = style === "led_band" || style === "facade_dark";
  const logoBg = isDark
    ? { r: 0, g: 26, b: 0, alpha: 0 }
    : { r: 255, g: 255, b: 255, alpha: 0 };

  // For dark backgrounds: negate dark logos so they appear white/bright
  let processedLogo = await sharp(logoBuf)
    .resize(finalLogoW, finalLogoH, { fit: "contain", background: logoBg })
    .png()
    .toBuffer();

  // Build background band
  const bgSvg = style === "banner_white"
    ? buildFacadeBannerSvg(sponsorName, zoneW, zoneH)
    : buildLedBoardSvg(sponsorName, zoneW, zoneH);

  const bgBuf = await sharp(Buffer.from(bgSvg)).png().toBuffer();

  // Logo horizontal position: centered. If logo takes < 30% of width, left-align with padding.
  const logoLeft = Math.round((zoneW - finalLogoW) / 2);
  const logoTop = Math.round((zoneH - finalLogoH) / 2);

  return sharp(bgBuf)
    .composite([{ input: processedLogo, left: logoLeft, top: logoTop, blend: "over" }])
    .png()
    .toBuffer();
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
  const zoneW = Math.max(120, Math.round(zone.w * imgW));
  const zoneH = Math.max(24, Math.round(zone.h * imgH));

  let overlayPng: Buffer;
  let usedLogo = false;

  if (!input.sponsorLogoUrl) {
    if (!input.allowTextFallback) {
      throw new Error(
        "No sponsor logo uploaded. Upload a logo in Brand Assets before generating a stadium mockup."
      );
    }
    // Text-only: full-width LED board or banner with sponsor name
    const svg = zone.overlayStyle === "banner_white"
      ? buildFacadeBannerSvg(input.sponsorName, zoneW, zoneH)
      : buildLedBoardSvg(input.sponsorName, zoneW, zoneH);
    overlayPng = await sharp(Buffer.from(svg)).png().toBuffer();
  } else {
    const logoBuf = await fetchLogoBuffer(input.sponsorLogoUrl);
    if (!logoBuf) {
      if (!input.allowTextFallback) {
        throw new Error("Could not load sponsor logo. Please re-upload in Brand Assets.");
      }
      const svg = zone.overlayStyle === "banner_white"
        ? buildFacadeBannerSvg(input.sponsorName, zoneW, zoneH)
        : buildLedBoardSvg(input.sponsorName, zoneW, zoneH);
      overlayPng = await sharp(Buffer.from(svg)).png().toBuffer();
    } else {
      overlayPng = await buildLogoOverlay(logoBuf, input.sponsorName, zoneW, zoneH, zone.overlayStyle);
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
    placement: input.placement,
    basePhoto: zone.basePhoto,
    usedLogo,
  };
}
