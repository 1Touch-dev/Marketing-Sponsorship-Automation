/**
 * Sponsor placement zones on Couto Pereira stadium base photos.
 *
 * All base images are 1920×1080 (resized from 4000×2250 original drone/match photos).
 * Coordinates are normalized (0–1) relative to image width/height.
 *
 * Stadium base images (public/mockups/stadium/):
 *   couto-pereira-matchday.jpg   — pitch-side interior, packed crowd, LED boards, floodlights
 *   couto-pereira-aerial-day.jpg — aerial daytime, perimeter boards visible
 *   couto-pereira-night.jpg      — night aerial, exterior LED facade
 *   couto-pereira-overhead.jpg   — overhead drone, CFC crest tifo visible
 */

export type StadiumPlacementId =
  | "led_board_main"
  | "led_board_near_goal"
  | "main_stand_facade"
  | "exterior_facade"
  | "scoreboard";

export type StadiumBaseId = "matchday" | "aerial_day" | "night" | "overhead";

export type StadiumZone = {
  id: StadiumPlacementId;
  label: string;
  labelPt: string;
  description: string;
  /** Which base photo this zone applies to */
  basePhoto: StadiumBaseId;
  /** Normalized 0–1 zone coords on that base photo */
  x: number;
  y: number;
  w: number;
  h: number;
  /** Whether to render logo on a dark band or transparent overlay */
  overlayStyle: "led_band" | "banner_white" | "facade_dark";
  enabled: boolean;
};

export const STADIUM_BASES: Record<
  StadiumBaseId,
  { filename: string; label: string; labelPt: string }
> = {
  matchday: {
    filename: "couto-pereira-matchday.jpg",
    label: "Match Day — Pitch-side LED Boards",
    labelPt: "Dia de Jogo — Placa LED à Beira do Campo",
  },
  aerial_day: {
    filename: "couto-pereira-aerial-day.jpg",
    label: "Aerial — Perimeter Boards (Day)",
    labelPt: "Vista Aérea — Placas Perimetrais (Dia)",
  },
  night: {
    filename: "couto-pereira-night.jpg",
    label: "Night — Stadium Exterior LED Facade",
    labelPt: "Noite — Fachada LED Exterior do Estádio",
  },
  overhead: {
    filename: "couto-pereira-overhead.jpg",
    label: "Drone — Overhead Crowd View",
    labelPt: "Drone — Vista Aérea com Torcida",
  },
};

/**
 * Pixel-calibrated placement zones.
 *
 * MATCHDAY (couto-pereira-matchday.jpg, 1920×1080):
 *   Green LED perimeter boards at pitch level span the FULL width of the stand.
 *   Full board: x=0, y=800–870 (bottom band), spans entire image width.
 *   Main stand "CORITIBA FOOT BALL CLUB" text: ~x=530–1400, y=680–720.
 *   White facade wall below lights: x=400–1500, y=645–685.
 *
 * AERIAL_DAY (couto-pereira-aerial-day.jpg, 1920×1080):
 *   Near-side perimeter boards: x=55–510, y=600–640.
 *
 * NIGHT (couto-pereira-night.jpg, 1920×1080):
 *   Exterior LED facade ring: x=300–1050, y=580–640.
 */
export const STADIUM_PLACEMENTS: StadiumZone[] = [
  {
    id: "led_board_main",
    label: "LED Board — Full Pitch-side (Centre)",
    labelPt: "Placa LED — Beira do Campo (Centro)",
    description: "Full-width sponsor LED board running the entire pitch-side during match day",
    basePhoto: "matchday",
    x: 0.0, // full width from left edge
    y: 0.918, // bottom band where LED boards are
    w: 1.0, // full image width for maximum impact
    h: 0.082, // taller band for clearer branding
    overlayStyle: "led_band",
    enabled: true,
  },
  {
    id: "led_board_near_goal",
    label: "LED Board — Left Goal End",
    labelPt: "Placa LED — Extremo do Gol",
    description: "Sponsor LED board at the left goal end of the pitch-side boards",
    basePhoto: "matchday",
    x: 0.0,
    y: 0.918,
    w: 0.3, // left 30% of image — near-goal section
    h: 0.082,
    overlayStyle: "led_band",
    enabled: true,
  },
  {
    id: "main_stand_facade",
    label: "Main Stand — Facade Banner",
    labelPt: "Tribuna Principal — Banner na Fachada",
    description:
      "Sponsor banner on the main stand white facade wall between the lights and CORITIBA FOOT BALL CLUB text",
    basePhoto: "matchday",
    // Upper white facade fascia above the floodlights, clear of the club-name lettering.
    x: 0.28,
    y: 0.5,
    w: 0.44,
    h: 0.055,
    overlayStyle: "banner_white",
    enabled: true,
  },
  {
    id: "exterior_facade",
    label: "Exterior Facade — LED Ring (Night)",
    labelPt: "Fachada Exterior — Painel LED (Noite)",
    description:
      "Sponsor brand on the exterior stadium LED facade ring visible in the night aerial shot",
    basePhoto: "night",
    // Night image: Green LED ring around exterior stadium at ~y=0.60-0.71
    // Ring spans from left to center: x=0.10-0.65, y=0.62-0.70
    x: 0.12, // start from left side of visible ring
    y: 0.63, // where the green LED band runs
    w: 0.5, // cover the visible portion of the ring
    h: 0.055, // height of the LED ring
    overlayStyle: "led_band",
    enabled: true,
  },
  {
    id: "scoreboard",
    label: "Scoreboard / Perimeter (Aerial)",
    labelPt: "Placar / Perimetral (Vista Aérea)",
    description: "Sponsor on the near-side perimeter boards visible from the aerial daytime shot",
    basePhoto: "aerial_day",
    // Aerial day: near-side perimeter boards are the GREEN strips on left side of pitch
    // The green boards run horizontally: x=0.01-0.28, y=0.52-0.57
    x: 0.01, // from left edge
    y: 0.52, // where green perimeter boards are visible
    w: 0.26, // width of visible near-side boards
    h: 0.048, // height of the perimeter board band
    overlayStyle: "led_band",
    enabled: true,
  },
];

export function getStadiumPlacement(id: StadiumPlacementId): StadiumZone | undefined {
  return STADIUM_PLACEMENTS.find((p) => p.id === id);
}

export function getPlacementsForBase(baseId: StadiumBaseId): StadiumZone[] {
  return STADIUM_PLACEMENTS.filter((p) => p.basePhoto === baseId && p.enabled);
}
