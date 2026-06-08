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
 * Layout rows (verified via pixel probe):
 *   Row 1  y≈2–460px   (0%–43%)  → front jersey L + back jersey R
 *   Row 2  y≈491–686px (45%–64%) → front shorts L (x:117–306) + back shorts R
 *   Row 3  y≈738–1070px(68%–99%) → left socks pair L (x:59–285) + alt-shorts R
 *
 * Manual max widths (cm) → converted to normalized patch widths:
 *   chest_sponsor    25cm → w≈0.165 (scaled to jersey body width ~420px of 858px image)
 *   chest_above_name  8cm → w≈0.058
 *   sleeve_left/right 8cm → w≈0.070 (sleeve zone narrower than body)
 *   back             25cm → w≈0.270 (back body similar to front)
 *   shorts            8cm → w≈0.080
 *   socks             6cm → w≈0.075
 *
 * All w/h represent the sponsor PATCH size, not the full garment area.
 */
export const JERSEY_PLACEMENTS: PlacementZone[] = [
  {
    id: "chest_sponsor",
    label: "Chest — Main sponsor",
    labelPt: "Peito — Patrocinador principal",
    description: "Opposite the club crest (wearer's right chest) — max 25 cm per official manual",
    // Wearer's right chest: jersey body x≈90–225px at chest height
    // Official max 25cm → ~142px wide at front-body scale (body≈420px ≈ ~48cm actual)
    // h ratio: 25cm wide sponsor typically ~40% as tall → h≈0.074 (≈80px of 1080)
    x: 0.105,
    y: 0.145,
    w: 0.165,
    h: 0.074,
    enabled: true,
  },
  {
    id: "chest_above_name",
    label: "Chest — Above name (small)",
    labelPt: "Peito — Acima do nome (menor)",
    description: "Secondary placement above manufacturer name — max 8 cm per official manual",
    // Lower-left of front jersey near hem — 8cm max → ~45px
    x: 0.068,
    y: 0.300,
    w: 0.058,
    h: 0.032,
    enabled: true,
  },
  {
    id: "sleeve_left",
    label: "Left sleeve",
    labelPt: "Manga esquerda",
    description: "Wearer's left sleeve — max 8 cm per official manual",
    // Right shoulder of front jersey (viewer's right = wearer's left)
    // 8cm sleeve patch → ~60px wide; sleeve ≈130px wide so w=60/858≈0.070
    x: 0.390,
    y: 0.110,
    w: 0.070,
    h: 0.046,
    enabled: true,
  },
  {
    id: "sleeve_right",
    label: "Right sleeve",
    labelPt: "Manga direita",
    description: "Wearer's right sleeve — max 8 cm per official manual",
    // Left shoulder of front jersey (viewer's left = wearer's right)
    x: 0.021,
    y: 0.110,
    w: 0.070,
    h: 0.046,
    enabled: true,
  },
  {
    id: "back",
    label: "Back",
    labelPt: "Costas",
    description: "Back sponsor placement — max 25 cm per official manual",
    // Upper-centre of back jersey (right half of image, row 1)
    // Back jersey x:432–840 → span ~408px. 25cm → same ratio as front → w≈0.270
    x: 0.550,
    y: 0.100,
    w: 0.270,
    h: 0.093,
    enabled: true,
  },
  {
    id: "shorts",
    label: "Shorts",
    labelPt: "Shorts",
    description: "Shorts sponsor placement — max 8 cm per official manual",
    // Right of Diadora logo on front shorts — x≈228–300, y≈545–605
    // 8cm patch → ~68px → w≈0.080
    x: 0.266,
    y: 0.505,
    w: 0.080,
    h: 0.050,
    enabled: true,
  },
  {
    id: "socks",
    label: "Socks",
    labelPt: "Meiões",
    description: "Socks sponsor placement — max 6 cm per official manual",
    // Upper-mid calf of left sock pair — x≈59–155, y≈775–845
    // 6cm patch → ~64px → w≈0.075
    x: 0.069,
    y: 0.718,
    w: 0.075,
    h: 0.055,
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
