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

export const JERSEY_PLACEMENTS: PlacementZone[] = [
  {
    id: "chest_sponsor",
    label: "Chest — Main sponsor",
    labelPt: "Peito — Patrocinador principal",
    description: "Opposite the club crest (wearer's right chest)",
    x: 0.1,
    y: 0.34,
    w: 0.36,
    h: 0.14,
    enabled: true,
  },
  {
    id: "chest_above_name",
    label: "Chest — Above name (small)",
    labelPt: "Peito — Acima do nome (menor)",
    description: "Secondary placement above manufacturer name",
    x: 0.28,
    y: 0.48,
    w: 0.22,
    h: 0.06,
    enabled: true,
  },
  {
    id: "sleeve_left",
    label: "Left sleeve",
    labelPt: "Manga esquerda",
    description: "Wearer's left sleeve",
    x: 0.04,
    y: 0.38,
    w: 0.12,
    h: 0.1,
    enabled: true,
  },
  {
    id: "sleeve_right",
    label: "Right sleeve",
    labelPt: "Manga direita",
    description: "Wearer's right sleeve",
    x: 0.84,
    y: 0.38,
    w: 0.12,
    h: 0.1,
    enabled: true,
  },
  {
    id: "back",
    label: "Back",
    labelPt: "Costas",
    description: "Back placement (uses back template when available)",
    x: 0.3,
    y: 0.35,
    w: 0.4,
    h: 0.12,
    enabled: false,
    comingSoon: true,
  },
  {
    id: "shorts",
    label: "Shorts",
    labelPt: "Shorts",
    description: "Requires kit photos + LoRA retrain",
    x: 0,
    y: 0,
    w: 0,
    h: 0,
    enabled: false,
    comingSoon: true,
  },
  {
    id: "socks",
    label: "Socks",
    labelPt: "Meiões",
    description: "Requires kit photos + LoRA retrain",
    x: 0,
    y: 0,
    w: 0,
    h: 0,
    enabled: false,
    comingSoon: true,
  },
];

export function getPlacement(id: JerseyPlacementId): PlacementZone | undefined {
  return JERSEY_PLACEMENTS.find((p) => p.id === id);
}

export function isPlacementAvailable(id: JerseyPlacementId): boolean {
  const p = getPlacement(id);
  return Boolean(p?.enabled);
}
