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

const CAMPAIGN_SURFACE: Record<CampaignSceneType, string> = {
  matchday_street:
    "the natural advertising surface already present in the matchday street scene",

  training_ground:
    "the natural sponsor branding surface already present in the training ground",

  fan_lifestyle:
    "the natural branding surface already visible in the lifestyle scene",
};

export function buildCampaignPrompt(scene: CampaignSceneType): string {
  return `Image 1 is the original photograph.
Image 2 is the sponsor logo.

Your only task: add the logo from Image 2 onto ${CAMPAIGN_SURFACE[scene]}, and blend it naturally into the scene — following the existing perspective, lighting, shadows and depth of field. Do nothing else.

Add exactly one copy of the logo, in that one place only. Never duplicate it and never place it anywhere else.

The logo must keep its exact colours, shapes, proportions, spacing and typography. Do not redraw or change it. If it has a solid rectangular background, remove only that background.

Do not change anything else in the photograph. Keep the people, environment, lighting, colours, composition and camera exactly as they are. Only add the one logo.`;
}
