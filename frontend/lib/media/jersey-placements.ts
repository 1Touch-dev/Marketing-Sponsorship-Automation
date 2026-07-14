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
 * Pixel-calibrated zones for coritiba-jersey-base.jpg (858×1080 flat kit layout),
 * cross-validated against official manual cm maximums.
 *
 * Layout (pixel-probed on actual image):
 *   Front jersey : x≈91–333px  (left panel)
 *   Back jersey  : x≈334–767px (right panel)
 *   Front shorts : x≈106–310px, y≈491–640px
 *   Socks        : x≈56–285px,  y≈738–1070px
 *
 * Club crest (CFC badge) is at approx x=215–285, y=100–185 on the front jersey panel.
 * chest_sponsor is OPPOSITE the crest: wearer's right = viewer's left of front panel.
 *
 * All w/h represent the sponsor PATCH size, not the full garment area.
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
    w: 0.140,
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
    description: "Wearer's left sleeve (viewer's right shoulder on front panel) — max 8 cm per official manual",
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
    description: "Wearer's right sleeve (viewer's left shoulder on front panel) — max 8 cm per official manual",
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
    description: "Sponsor placement on the player number on the back panel — max 10 cm per official manual",
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
    h: 0.060,
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
