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
 * Coordinate reference for coritiba-jersey-base.jpg (858×1080 flat kit layout):
 *   Row 1  y 1%–43%   → front jersey (left half) + back jersey (right half)
 *   Row 2  y 46%–68%  → front shorts (left half) + back shorts (right half)
 *   Row 3  y 70%–99%  → left socks pair (left ~35%) + shorts alt (right ~55%)
 *   Left half  x 0–50%  = front/viewer view
 *   Right half x 50–100% = back view
 */
export const JERSEY_PLACEMENTS: PlacementZone[] = [
  {
    id: "chest_sponsor",
    label: "Chest — Main sponsor",
    labelPt: "Peito — Patrocinador principal",
    description: "Opposite the club crest (wearer's right chest)",
    // Centre-left of front jersey body — wearer's right, viewer's left
    x: 0.05,
    y: 0.17,
    w: 0.24,
    h: 0.13,
    enabled: true,
  },
  {
    id: "chest_above_name",
    label: "Chest — Above name (small)",
    labelPt: "Peito — Acima do nome (menor)",
    description: "Secondary placement above manufacturer name",
    // Lower-left of front jersey, above hem
    x: 0.07,
    y: 0.31,
    w: 0.18,
    h: 0.06,
    enabled: true,
  },
  {
    id: "sleeve_left",
    label: "Left sleeve",
    labelPt: "Manga esquerda",
    description: "Wearer's left sleeve",
    // Right shoulder of front jersey (viewer's right = wearer's left)
    x: 0.35,
    y: 0.13,
    w: 0.12,
    h: 0.09,
    enabled: true,
  },
  {
    id: "sleeve_right",
    label: "Right sleeve",
    labelPt: "Manga direita",
    description: "Wearer's right sleeve",
    // Left shoulder of front jersey (viewer's left = wearer's right)
    x: 0.02,
    y: 0.13,
    w: 0.12,
    h: 0.09,
    enabled: true,
  },
  {
    id: "back",
    label: "Back",
    labelPt: "Costas",
    description: "Back sponsor placement (LoRA v2 — James kit assets)",
    // Upper-centre of back jersey (right half of image, row 1)
    x: 0.55,
    y: 0.11,
    w: 0.34,
    h: 0.14,
    enabled: true,
  },
  {
    id: "shorts",
    label: "Shorts",
    labelPt: "Shorts",
    description: "Shorts sponsor placement (LoRA v2 — UNIFORM kit)",
    // Centre-right of front shorts (left half of image, row 2)
    x: 0.18,
    y: 0.52,
    w: 0.20,
    h: 0.12,
    enabled: true,
  },
  {
    id: "socks",
    label: "Socks",
    labelPt: "Meiões",
    description: "Socks sponsor placement (LoRA v2 — UNIFORM kit)",
    // Upper calf area of left sock pair (bottom-left of image, row 3)
    x: 0.02,
    y: 0.71,
    w: 0.14,
    h: 0.12,
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
