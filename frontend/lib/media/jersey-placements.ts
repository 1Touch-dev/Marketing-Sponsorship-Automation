/**
 * Sponsor placement zones on the official Coritiba jersey base photo.
 * Base: public/mockups/coritiba-jersey-base.jpg (858×1080, front view).
 *
 * Convention (facing the jersey):
 * - Club crest stays on wearer's LEFT chest (viewer RIGHT) — baked into photo, never composited.
 * - Sponsor is composited on wearer's RIGHT chest (viewer LEFT) unless placement says otherwise.
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
 * Pixel-calibrated zones for coritiba-jersey-base.jpg (858×1080 flat kit layout).
 *
 * Layout rows (verified via pixel probe):
 *   Row 1  y≈2–460px   (0%–43%)  → front jersey L + back jersey R
 *   Row 2  y≈491–686px (45%–64%) → front shorts L (x:117–306) + back shorts R
 *   Row 3  y≈738–1070px(68%–99%) → left socks pair L (x:59–285) + alt-shorts R
 *
 * Elements inside front shorts (pixel scan):
 *   CFC crest:   x≈90–155, y≈540–640
 *   Diadora "+": x≈205–225, y≈590–640
 *   Sponsor zone (right of Diadora): x≈228–300, y≈545–605
 *
 * All w/h represent the sponsor PATCH size, not the full garment area.
 */
export const JERSEY_PLACEMENTS: PlacementZone[] = [
  {
    id: "chest_sponsor",
    label: "Chest — Main sponsor",
    labelPt: "Peito — Patrocinador principal",
    description: "Opposite the club crest (wearer's right chest)",
    // Wearer's right chest body — jersey body starts at ~x=90px at chest height
    // CFC crest is at x≈225–295, so we have x=90–215 for sponsor (~125px × 80px)
    x: 0.105,
    y: 0.145,
    w: 0.145,
    h: 0.074,
    enabled: true,
  },
  {
    id: "chest_above_name",
    label: "Chest — Above name (small)",
    labelPt: "Peito — Acima do nome (menor)",
    description: "Secondary placement above manufacturer name",
    // Lower-left of front jersey near hem — small badge ~90×38px
    x: 0.068,
    y: 0.300,
    w: 0.105,
    h: 0.035,
    enabled: true,
  },
  {
    id: "sleeve_left",
    label: "Left sleeve",
    labelPt: "Manga esquerda",
    description: "Wearer's left sleeve",
    // Right shoulder of front jersey (viewer's right = wearer's left) ~55×50px
    x: 0.390,
    y: 0.110,
    w: 0.064,
    h: 0.046,
    enabled: true,
  },
  {
    id: "sleeve_right",
    label: "Right sleeve",
    labelPt: "Manga direita",
    description: "Wearer's right sleeve",
    // Left shoulder of front jersey (viewer's left = wearer's right) ~55×50px
    x: 0.021,
    y: 0.110,
    w: 0.064,
    h: 0.046,
    enabled: true,
  },
  {
    id: "back",
    label: "Back",
    labelPt: "Costas",
    description: "Back sponsor placement (LoRA v2 — James kit assets)",
    // Upper-centre of back jersey (right half of image, row 1)
    // Back jersey x:432–840 → span ~220px centred at x=636
    x: 0.550,
    y: 0.100,
    w: 0.257,
    h: 0.093,
    enabled: true,
  },
  {
    id: "shorts",
    label: "Shorts",
    labelPt: "Shorts",
    description: "Shorts sponsor placement (LoRA v2 — UNIFORM kit)",
    // Right of Diadora logo on front shorts — x≈228–300, y≈545–605
    // ~72×60px patch — proportionate sponsor badge on thigh
    x: 0.266,
    y: 0.505,
    w: 0.084,
    h: 0.056,
    enabled: true,
  },
  {
    id: "socks",
    label: "Socks",
    labelPt: "Meiões",
    description: "Socks sponsor placement (LoRA v2 — UNIFORM kit)",
    // Upper-mid calf of left sock pair — x≈59–155, y≈775–845
    // Slightly lower than cuff to land on the white sock body (more visible)
    x: 0.069,
    y: 0.718,
    w: 0.112,
    h: 0.060,
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
