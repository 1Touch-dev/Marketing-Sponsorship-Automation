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
 *   Lower portion of frame shows the green LED perimeter boards at pitch level.
 *   The boards run horizontally across ~x=60–1860, y=730–810 in the resized image.
 *   The main stand "CORITIBA FOOT BALL CLUB" text is at ~x=600–1350, y=420–480.
 *
 * AERIAL_DAY (couto-pereira-aerial-day.jpg, 1920×1080):
 *   Perimeter boards visible around pitch edge at ~x=80–500, y=610–660 (near side).
 *
 * NIGHT (couto-pereira-night.jpg, 1920×1080):
 *   Exterior LED facade "ESTÁDIO MAJOR ANTÔNIO COUTO PEREIRA" at ~x=500–1000, y=590–650.
 *
 * OVERHEAD (couto-pereira-overhead.jpg, 1920×1080):
 *   Near-side perimeter boards at ~x=55–500, y=590–640.
 */
export const STADIUM_PLACEMENTS: StadiumZone[] = [
  {
    id: "led_board_main",
    label: "LED Board — Centre Pitch-side",
    labelPt: "Placa LED — Centro à Beira do Campo",
    description: "Main sponsor LED board on the pitch-side advertising boards during match",
    basePhoto: "matchday",
    // LED boards in matchday: horizontal band y≈730-810, centre section x≈600-1320
    x: 0.3125,  // 600/1920
    y: 0.6759,  // 730/1080
    w: 0.375,   // 720/1920
    h: 0.0741,  // 80/1080
    overlayStyle: "led_band",
    enabled: true,
  },
  {
    id: "led_board_near_goal",
    label: "LED Board — Near Goal",
    labelPt: "Placa LED — Próximo ao Gol",
    description: "Sponsor LED board near the goal post area during match day",
    basePhoto: "matchday",
    // Left section of boards: x≈80-500, y≈730-810
    x: 0.0417,  // 80/1920
    y: 0.6759,  // 730/1080
    w: 0.2188,  // 420/1920
    h: 0.0741,  // 80/1080
    overlayStyle: "led_band",
    enabled: true,
  },
  {
    id: "main_stand_facade",
    label: "Main Stand — Facade Banner",
    labelPt: "Tribuna Principal — Banner na Fachada",
    description: "Sponsor banner on the main stand facade between the lights and the CORITIBA FOOT BALL CLUB text",
    basePhoto: "matchday",
    // Between roof edge and "CORITIBA FOOT BALL CLUB" text: x≈430-1420, y≈590-635
    x: 0.2240,  // 430/1920
    y: 0.5463,  // 590/1080
    w: 0.5156,  // 990/1920
    h: 0.0417,  // 45/1080
    overlayStyle: "banner_white",
    enabled: true,
  },
  {
    id: "exterior_facade",
    label: "Exterior Facade — LED Sign",
    labelPt: "Fachada Exterior — Painel LED",
    description: "Sponsor brand on the exterior stadium LED facade (night shot)",
    basePhoto: "night",
    // Exterior LED sign on stadium perimeter at night: x≈430-1050, y≈572-645
    x: 0.2240,  // 430/1920
    y: 0.5296,  // 572/1080
    w: 0.3229,  // 620/1920
    h: 0.0676,  // 73/1080
    overlayStyle: "led_band",
    enabled: true,
  },
  {
    id: "scoreboard",
    label: "Scoreboard / Giant Screen",
    labelPt: "Placar Eletrônico / Telão",
    description: "Sponsor logo on the electronic scoreboard/giant screen",
    basePhoto: "aerial_day",
    // Scoreboard area visible in aerial: approximately top-left of inner arena
    x: 0.0625,  // 120/1920
    y: 0.5648,  // 610/1080
    w: 0.2083,  // 400/1920
    h: 0.0463,  // 50/1080
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
