import type { StadiumPlacementId } from "./stadium-placements";

export type CampaignSceneType =
  | "matchday_street"
  | "training_ground"
  | "fan_lifestyle";

const STADIUM_SURFACE: Record<
  StadiumPlacementId,
  {
    description: string;
    type: "led" | "banner";
  }
> = {
  led_board_main: {
    description:
      "the existing horizontal LED advertising board that runs along the bottom edge of the pitch, in front of the crowd, right at the grass line — the same band that is already showing an advertisement; place the logo on that board, occupying the centre section, replacing the advertisement text currently displayed there",
    type: "led",
  },

  led_board_near_goal: {
    description:
      "the existing horizontal LED advertising board that runs along the bottom edge of the pitch near the goal — the same band that is already showing an advertisement; place the logo on the goal-end section of that board, replacing the advertisement text currently displayed there",
    type: "led",
  },

  main_stand_facade: {
    description:
      "the large sponsor banner area on the main stadium stand facade",
    type: "banner",
  },

  exterior_facade: {
    description:
      "the exterior LED advertising facade surrounding the stadium",
    type: "led",
  },

  scoreboard: {
    description:
      "the advertising panels integrated into the stadium scoreboard area",
    type: "led",
  },
};

export function buildStadiumPrompt(placement: StadiumPlacementId): string {
  const config = STADIUM_SURFACE[placement];
  const surfaceKind =
    config.type === "led"
      ? "so it looks like the stadium LED boards are actually displaying it during a live match — following the LED brightness, perspective, viewing angle and lighting"
      : "so it looks like a real advertisement installed on that surface — following the perspective, material, lighting and shadows";

  return `Image 1 is the original stadium photograph.
Image 2 is the sponsor logo.

Your only task: add the logo from Image 2 onto ${config.description}, and blend it naturally into that surface ${surfaceKind}. Do nothing else.

Add exactly one copy of the logo, on that one surface only. Never duplicate it and never place it anywhere else.

The logo must keep its exact colours, shapes, proportions, spacing and typography. Do not redraw or change it. If it has a solid rectangular background, remove only that background.

Do not change anything else in the photograph. Keep the stadium, crowd, pitch, players, architecture, floodlights, sky, lighting, colours and camera exactly as they are. The only change allowed is the single logo on the one target surface (if that surface already shows an advertisement, the logo may sit over it). Only add the one logo.`;
}

/**
 * Per-scene background sponsor surface. Each entry gives the model:
 *  1. What surface to look for first (if the stock photo already shows one).
 *  2. A concrete fallback describing what to ADD to the out-of-focus
 *     background when no surface is visible — this is the case that matters
 *     most, since several of the real stock photos (e.g. the tight training
 *     close-ups) have no banner/board in frame at all. Without an explicit
 *     "add one" instruction the model has nowhere to put the logo and just
 *     stamps it onto the kit next to the crest, which is why campaign
 *     creatives could look almost identical to the source photo.
 */
const CAMPAIGN_SURFACE: Record<
  CampaignSceneType,
  { existing: string; addition: string }
> = {
  matchday_street: {
    existing:
      "a fan banner, flag or advertising board already visible in the crowd/stadium background",
    addition:
      "add a sponsor billboard or advertising board into the out-of-focus street/crowd background, at typical stadium signage height, matching the existing perspective, lighting and depth of field, as if the supporter is walking toward the stadium on match day",
  },
  training_ground: {
    existing: "a banner, hoarding or signage already visible behind the player",
    addition:
      "add a sponsor banner/hoarding into the out-of-focus background behind the player, at typical training-ground signage height, matching the existing shallow depth of field, golden-hour lighting and colour grading already in the photo",
  },
  fan_lifestyle: {
    existing:
      "a sign, screen, poster or banner already visible in the background of the scene",
    addition:
      "add a small sponsor sign, poster or banner into the out-of-focus background, matching the existing depth of field, lighting and colour grading, so it reads as natural signage in the fan's everyday surroundings",
  },
};

export function buildCampaignPrompt(scene: CampaignSceneType): string {
  const surface = CAMPAIGN_SURFACE[scene];
  return `Image 1 is the original Coritiba FC photograph.
Image 2 is the sponsor logo.

This is an editorial campaign creative in the "Curitiba é Coritiba" style — real-feel photography, not a product mock.

Your task: place the logo from Image 2 onto ${surface.existing}, blending it naturally into the scene — following the existing perspective, lighting, shadows and depth of field.

If no such surface is clearly visible in the photo, ${surface.addition}, then place the logo on it.

Add exactly one copy of the logo, in that one place only. Never duplicate it and never place it anywhere else — and never place it on any person's clothing, kit, or body.

The logo must keep its exact colours, shapes, proportions, spacing and typography. Do not redraw or change it. If it has a solid rectangular background, remove only that background.

Do not change the people, their clothing, faces, poses or any existing club branding already present. Keep the framing, lighting, colours and camera exactly as they are — only add the logo (and, if needed, the one banner/sign carrying it).`;
}
