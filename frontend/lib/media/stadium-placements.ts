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

export type StadiumBaseId =
  | "matchday"
  | "aerial_day"
  | "night"
  | "overhead";

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

export const STADIUM_BASES: Record<StadiumBaseId, { filename: string; label: string; labelPt: string }> = {
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
    // Full-width green LED boards at the bottom of the stands: x=0–1920, y=810–876
    x: 0.0,     // 0/1920 — starts at left edge
    y: 0.750,   // 810/1080
    w: 1.0,     // full width 1920/1920
    h: 0.061,   // 66/1080
    overlayStyle: "led_band",
    enabled: true,
  },
  {
    id: "led_board_near_goal",
    label: "LED Board — Left Goal End",
    labelPt: "Placa LED — Extremo do Gol",
    description: "Sponsor LED board at the left goal end of the pitch-side boards",
    basePhoto: "matchday",
    // Left section of the LED boards: x=0–480, y=810–876
    x: 0.0,     // 0/1920
    y: 0.750,   // 810/1080
    w: 0.250,   // 480/1920
    h: 0.061,   // 66/1080
    overlayStyle: "led_band",
    enabled: true,
  },
  {
    id: "main_stand_facade",
    label: "Main Stand — Facade Banner",
    labelPt: "Tribuna Principal — Banner na Fachada",
    description: "Sponsor banner on the main stand white facade wall between the lights and CORITIBA FOOT BALL CLUB text",
    basePhoto: "matchday",
    // White facade wall between lights and "CORITIBA FOOT BALL CLUB": x=430–1490, y=648–686
    x: 0.2240,  // 430/1920
    y: 0.6000,  // 648/1080
    w: 0.5521,  // 1060/1920
    h: 0.0352,  // 38/1080
    overlayStyle: "banner_white",
    enabled: true,
  },
  {
    id: "exterior_facade",
    label: "Exterior Facade — LED Ring (Night)",
    labelPt: "Fachada Exterior — Painel LED (Noite)",
    description: "Sponsor brand on the exterior stadium LED facade ring visible in the night aerial shot",
    basePhoto: "night",
    // Exterior LED ring: x=300–1050, y=582–636
    x: 0.1563,  // 300/1920
    y: 0.5389,  // 582/1080
    w: 0.3906,  // 750/1920
    h: 0.0500,  // 54/1080
    overlayStyle: "led_band",
    enabled: true,
  },
  {
    id: "scoreboard",
    label: "Scoreboard / Perimeter (Aerial)",
    labelPt: "Placar / Perimetral (Vista Aérea)",
    description: "Sponsor on the near-side perimeter boards visible from the aerial daytime shot",
    basePhoto: "aerial_day",
    // Near-side perimeter boards in aerial: x=55–510, y=600–640
    x: 0.0286,  // 55/1920
    y: 0.5556,  // 600/1080
    w: 0.2370,  // 455/1920
    h: 0.0370,  // 40/1080
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
