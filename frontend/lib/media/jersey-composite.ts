import path from "path";
import fs from "fs/promises";
import sharp from "sharp";
import type { JerseyPlacementId } from "./jersey-placements";
import { getPlacement } from "./jersey-placements";

const BASE_FILENAME = "coritiba-jersey-base.jpg";

function baseImagePath(): string {
  return path.join(process.cwd(), "public", "mockups", BASE_FILENAME);
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
  // Scale font to fit zone — tighter fit than before
  const fontSize = Math.max(11, Math.min(38, Math.floor(width / (label.length * 0.62))));
  const pad = Math.max(4, Math.round(height * 0.12));
  // Coritiba green badge — works on both dark jersey and white shorts
  return Buffer.from(
    `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <filter id="dropshadow" x="-10%" y="-10%" width="120%" height="120%">
          <feDropShadow dx="0" dy="1" stdDeviation="2" flood-color="rgba(0,0,0,0.55)"/>
        </filter>
      </defs>
      <!-- Outer shadow glow for depth -->
      <rect x="1" y="1" width="${width - 2}" height="${height - 2}" rx="5"
        fill="rgba(0,0,0,0.35)" filter="url(#dropshadow)"/>
      <!-- Badge background — Coritiba dark green -->
      <rect x="0" y="0" width="${width}" height="${height}" rx="5"
        fill="rgba(18,58,30,0.88)"/>
      <!-- Inner highlight line at top -->
      <rect x="0" y="0" width="${width}" height="2" rx="5"
        fill="rgba(255,255,255,0.25)"/>
      <!-- Sponsor text — white, bold -->
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
    if (!res.ok) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length < 100) return null;
    return buf;
  } catch {
    return null;
  }
}

export type CompositeJerseyInput = {
  sponsorName: string;
  sponsorLogoUrl?: string | null;
  placement?: JerseyPlacementId;
};

export type CompositeJerseyResult = {
  buffer: Buffer;
  width: number;
  height: number;
  placement: JerseyPlacementId;
  usedLogo: boolean;
};

/**
 * Composite sponsor onto official kit photo. Club crest in base image is never modified.
 */
export async function compositeJerseyMockup(
  input: CompositeJerseyInput
): Promise<CompositeJerseyResult> {
  const placementId = input.placement ?? "chest_sponsor";
  const zone = getPlacement(placementId);
  if (!zone?.enabled) {
    throw new Error(`Placement "${placementId}" is not available yet`);
  }

  const basePath = baseImagePath();
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

  let overlay: sharp.Sharp;
  let usedLogo = false;

  const logoBuf = input.sponsorLogoUrl ? await fetchLogoBuffer(input.sponsorLogoUrl) : null;
  if (logoBuf) {
    overlay = sharp(logoBuf).resize(zoneW, zoneH, {
      fit: "contain",
      background: { r: 255, g: 255, b: 255, alpha: 0 },
    });
    usedLogo = true;
  } else {
    overlay = sharp(buildTextOverlaySvg(input.sponsorName, zoneW, zoneH));
  }

  const overlayPng = await overlay.png().toBuffer();

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
  };
}
