/**
 * Sponsor placement zones on the official Coritiba jersey base photo.
 * Base: public/mockups/coritiba-jersey-base.jpg (858×1080, front view).
 *
 * Convention (facing the jersey):
 * - Club crest stays on wearer's LEFT chest (viewer RIGHT) — baked into photo, never composited.
 * - Sponsor is composited on wearer's RIGHT chest (viewer LEFT) unless placement says otherwise.
 *
 * Dimensions grounded in official Coritiba FC Manual de Aplicação Patrocinadores (2026):
 *   chest_sponsor   : max 25 cm wide
 *   chest_above_name: max 8 cm wide
 *   sleeve_left/right: max 8 cm wide
 *   back            : max 25 cm wide
 *   shorts          : max 8 cm wide
 *   socks           : max 6 cm wide
 *
 * All normalized (0–1) values are derived from pixel measurements on the 858×1080 base image,
 * then cross-validated against the real-world cm ratios from the manual.
 */

export type JerseyPlacementId =
  | "chest_sponsor"
  | "chest_above_name"
  | "sleeve_left"
  | "sleeve_right"
  | "back"
  | "number"
  | "shorts"
  | "socks";

export type PlacementZone = {
  id: JerseyPlacementId;
  label: string;
  labelPt: string;
  description: string;
  /** Normalized 0–1 relative to image width/height */
  x: number;
  y: number;
  w: number;
  h: number;
  enabled: boolean;
  comingSoon?: boolean;
};

export const JERSEY_BASE_PUBLIC_PATH = "/mockups/coritiba-jersey-base.jpg";

/**
 * Pixel-calibrated zones for coritiba-jersey-base.jpg (858×1080 flat kit layout).
 * Used for kit_type = "flat".
 *
 * Layout: front jersey on left panel, back jersey on right panel.
 * Club crest at approx x=215–285, y=100–185 on the front panel.
 */
export const JERSEY_PLACEMENTS: PlacementZone[] = [
  {
    id: "chest_sponsor",
    label: "Chest — Main sponsor",
    labelPt: "Peito — Patrocinador principal",
    description: "Opposite the club crest (wearer's right chest) — max 25 cm per official manual",
    // Pixel-verified: crest at x=215-285. Sponsor zone clears crest completely.
    // Front panel left area: x=78-198 (120px wide) → w=120/858=0.140
    // Chest height: y=155-240 (85px tall) → h=85/1080=0.079
    x: 0.091,
    y: 0.144,
    w: 0.14,
    h: 0.079,
    enabled: true,
  },
  {
    id: "chest_above_name",
    label: "Chest — Above name (small)",
    labelPt: "Peito — Acima do nome (menor)",
    description: "Secondary placement above manufacturer name — max 8 cm per official manual",
    // Lower-left of front jersey near hem: x≈91-150, y≈330-365
    x: 0.106,
    y: 0.306,
    w: 0.068,
    h: 0.034,
    enabled: true,
  },
  {
    id: "sleeve_left",
    label: "Left sleeve",
    labelPt: "Manga esquerda",
    description:
      "Wearer's left sleeve (viewer's right shoulder on front panel) — max 8 cm per official manual",
    // Pixel-verified: right shoulder of front jersey x=309-394, y=60-155
    // w=85/858=0.099, h=95/1080=0.088
    x: 0.361,
    y: 0.056,
    w: 0.099,
    h: 0.088,
    enabled: true,
  },
  {
    id: "sleeve_right",
    label: "Right sleeve",
    labelPt: "Manga direita",
    description:
      "Wearer's right sleeve (viewer's left shoulder on front panel) — max 8 cm per official manual",
    // Pixel-verified: left shoulder of front jersey x=49-129, y=60-155
    // w=80/858=0.093, h=95/1080=0.088
    x: 0.057,
    y: 0.056,
    w: 0.093,
    h: 0.088,
    enabled: true,
  },
  {
    id: "back",
    label: "Back",
    labelPt: "Costas",
    description: "Back sponsor placement — max 25 cm per official manual",
    // Pixel-verified: back jersey panel x=334-767. Upper-centre: x=470-740, y=110-199
    // w=270/858=0.315, h=89/1080=0.082
    x: 0.548,
    y: 0.102,
    w: 0.315,
    h: 0.082,
    enabled: true,
  },
  {
    id: "number",
    label: "Back — Number",
    labelPt: "Costas — Número",
    description:
      "Sponsor placement on the player number on the back panel — max 10 cm per official manual",
    // Pixel-verified: back jersey panel x=334-767. Number sits centre-upper-back.
    // Number zone: x=490-660 (170px wide) → w=170/858=0.198
    // Number height: y=215-310 (95px tall) → h=95/1080=0.088
    x: 0.571,
    y: 0.199,
    w: 0.198,
    h: 0.088,
    enabled: true,
  },
  {
    id: "shorts",
    label: "Shorts",
    labelPt: "Shorts",
    description: "Shorts sponsor placement — max 8 cm per official manual",
    // Pixel-verified: front shorts upper area x=147-229, y=524-589
    // w=82/858=0.096, h=65/1080=0.060
    x: 0.171,
    y: 0.485,
    w: 0.096,
    h: 0.06,
    enabled: true,
  },
  {
    id: "socks",
    label: "Socks",
    labelPt: "Meiões",
    description: "Socks sponsor placement — max 6 cm per official manual",
    // Pixel-verified: upper calf of left sock pair x=74-147, y=770-840
    // w=73/858=0.085, h=70/1080=0.065
    x: 0.086,
    y: 0.713,
    w: 0.085,
    h: 0.065,
    enabled: true,
  },
];

export function getPlacement(id: JerseyPlacementId): PlacementZone | undefined {
  return JERSEY_PLACEMENTS.find((p) => p.id === id);
}

export function isPlacementAvailable(id: JerseyPlacementId): boolean {
  const p = getPlacement(id);
  return Boolean(p?.enabled);
}

export const JERSEY_KIT_PLACEMENTS: Record<
  "flat" | "home" | "training" | "goalkeeper",
  readonly JerseyPlacementId[]
> = {
  flat: [
    "chest_sponsor",
    "chest_above_name",
    "sleeve_left",
    "sleeve_right",
    "back",
    "number",
    "shorts",
    "socks",
  ],
  // Home has real match photos for every zone (front, back, shorts, socks).
  home: [
    "chest_sponsor",
    "chest_above_name",
    "sleeve_left",
    "sleeve_right",
    "back",
    "number",
    "shorts",
    "socks",
  ],
  // Training only has front waist-up photos — no real back/shorts/socks photo,
  // so those zones stay disabled (operators can upload their own base for them).
  training: ["chest_sponsor", "chest_above_name", "sleeve_left", "sleeve_right"],
  // Goalkeeper has front + full-body photos (chest, sleeves, shorts, socks) but
  // no clean rear view, so back/number stay disabled (upload-your-own available).
  goalkeeper: [
    "chest_sponsor",
    "chest_above_name",
    "sleeve_left",
    "sleeve_right",
    "shorts",
    "socks",
  ],
};

export function isPlacementVisibleForKit(
  id: JerseyPlacementId,
  kitType: "flat" | "home" | "training" | "goalkeeper",
): boolean {
  return JERSEY_KIT_PLACEMENTS[kitType].includes(id);
}

/**
 * Per-kit overrides for PLAYER PHOTO bases (home, training, goalkeeper).
 * These photos are portrait-oriented, waist-up, player facing camera.
 *
 * Pixel-calibrated from actual photos (858×1080):
 *
 * HOME KIT (DSCF4975.jpg):
 *   White fabric:      x=0.30–0.69, y=0.57–0.68 (above green stripe)
 *   White below stripe:x=0.30–0.74, y=0.74–0.98
 *   CFC badge center:  ≈x=0.52, y=0.64
 *   SPONSOR zone:      x=0.33–0.53, y=0.58–0.67 (left of badge, white fabric only)
 *
 * TRAINING/GK KIT (DSCF2843/DSCF5278.jpg):
 *   Chest fabric:      x=0.10–0.35, y=0.60–0.75 (left of badge, grey/green zone)
 *   Sleeve-left (view right): barely visible — badge placed in background zone
 */
export const JERSEY_PLAYER_PLACEMENTS: Partial<
  Record<JerseyPlacementId, { x: number; y: number; w: number; h: number }>
> = {
  // chest_sponsor: on white jersey fabric, left of CFC badge (wearer's right chest)
  // White panel left of badge: x=0.28–0.50, y=0.55–0.65
  chest_sponsor: { x: 0.28, y: 0.56, w: 0.2, h: 0.09 },
  // chest_above_name: white area above existing "Master Cargas" text but below green stripe
  // Target zone: x=0.28–0.55, y=0.68–0.72 (narrow strip between green stripe and main sponsor)
  chest_above_name: { x: 0.28, y: 0.68, w: 0.18, h: 0.05 },
  // sleeve_left (viewer's right = wearer's left): green sleeve band on right side of image
  // Green sleeve cap at x≈0.61–0.78, y≈0.47–0.57 — place in centre of sleeve cap
  sleeve_left: { x: 0.62, y: 0.48, w: 0.15, h: 0.07 },
  // sleeve_right (viewer's left = wearer's right): left arm visible on left side
  // Arm visible at x≈0.01–0.17, y≈0.58–0.73 — sleeve cap area (where badge sits on real jerseys)
  sleeve_right: { x: 0.01, y: 0.59, w: 0.15, h: 0.07 },
};

/**
 * Training/goalkeeper kit overrides — sponsor sits on the main chest fabric panel.
 * Both kits have dark raglan sleeves with grey/green body.
 * CFC badge is on viewer's right (~x=0.50). Diadora logo viewer's left (~x=0.20).
 * Sponsor zone fits between these two marks.
 */
export const JERSEY_TRAINING_PLACEMENTS: Partial<
  Record<JerseyPlacementId, { x: number; y: number; w: number; h: number }>
> = {
  // chest_sponsor: between Diadora logo and CFC badge — centre-left of chest
  chest_sponsor: { x: 0.3, y: 0.7, w: 0.24, h: 0.07 },
  // chest_above_name: lower-left of main body panel
  chest_above_name: { x: 0.2, y: 0.76, w: 0.2, h: 0.07 },
  // sleeve_right (viewer's left = wearer's right): arm hanging down left side
  sleeve_right: { x: 0.03, y: 0.66, w: 0.11, h: 0.07 },
  // sleeve_left (viewer's right = wearer's left): black sleeve barely visible on right
  sleeve_left: { x: 0.8, y: 0.62, w: 0.1, h: 0.06 },
};

/**
 * Returns the zone coordinates for a given kit type and placement.
 * Player-photo kits (home/training/goalkeeper) use JERSEY_PLAYER_PLACEMENTS overrides.
 * Training and goalkeeper use JERSEY_TRAINING_PLACEMENTS for tighter chest area.
 * Falls back to JERSEY_PLACEMENTS (flat kit) for any zone not in the override map.
 */
export function getPlacementForKit(
  id: JerseyPlacementId,
  kitType?: string,
): PlacementZone | undefined {
  const basePlacement = JERSEY_PLACEMENTS.find((p) => p.id === id);
  if (!basePlacement) return undefined;

  if (kitType && kitType !== "flat") {
    if (kitType === "training" || kitType === "goalkeeper") {
      const override = JERSEY_TRAINING_PLACEMENTS[id];
      if (override) return { ...basePlacement, ...override };
    }
    const override = JERSEY_PLAYER_PLACEMENTS[id];
    if (override) return { ...basePlacement, ...override };
  }
  return basePlacement;
}
