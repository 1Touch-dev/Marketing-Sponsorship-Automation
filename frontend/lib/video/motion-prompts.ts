/**
 * Motion prompts for the video intro, by what the source image shows.
 *
 * History: the first version (ported from the 1Touch AI Studio) asked for "subtle" motion, a "mostly steady" camera
 * and, for anything that was not a jersey or stadium, "only the camera moves". The result was a slow zoom. Tested on
 * real proposal images (6 Nov 2026): prompts that name concrete actions, a moving camera and moving scenery give
 * clearly livelier video while the sponsor logo stays readable. So each prompt now lists what MOVES (people, crowd,
 * cloth, smoke, light) and how the camera travels, then ends with one sentence protecting the logo.
 */

import { NEGATIVE_PROMPT } from "./replicate-video";

const KEEP_LOGO =
  "The sponsor logo and the club crest keep exactly the same shape, colours and position, sharp and readable. No new text appears.";

const JERSEY =
  "Dynamic live-match sports broadcast shot. The player is clearly in motion: he turns his head and shoulders, takes a confident step forward and swings his arms, the jersey fabric ripples and stretches with every movement, and stadium floodlights flare behind him while the blurred crowd moves. The camera glides in a smooth dolly-in with a slight orbit around the player. Realistic body physics, natural motion. The player's face and the jersey design stay the same.";

// Stadium shots often have the sponsor board at the bottom edge. Tested 6 Nov 2026: a forward or upward camera move
// pushed the board out of the shot, and "LED boards animate and glow" smeared its logo. A sideways tracking shot keeps
// the board in frame at the same size while the parallax and the crowd still give movement.
const STADIUM =
  "Electric matchday atmosphere, full of movement. The crowd jumps, cheers and waves flags and scarves, and smoke and light haze drift across the stands. The camera performs a smooth lateral tracking shot, sliding sideways at a constant distance with parallax between foreground and background, so the pitch-side sponsor boards and signage stay in frame at the same size for the whole shot. No push-in, no zoom, no tilt. The sponsor boards and signs themselves stay steady and unchanged, with no flicker, animation or colour change.";

const GENERIC =
  "Dynamic cinematic commercial shot full of life. People in the scene move energetically and naturally (walking, laughing, gesturing, turning toward the camera), flags, fabric and light flares move in the background, and the camera glides with a smooth parallax tracking move. Lively, realistic motion, not a still photo.";

/** Which of the three styles an image job calls for (job_type values written by the mockup routes). */
export function motionStyleFor(jobType: string | null | undefined): "jersey" | "stadium" | "generic" {
  const t = (jobType ?? "").toLowerCase();
  if (t.includes("jersey")) return "jersey";
  if (t.includes("stadium") || t.includes("led") || t.includes("scoreboard") || t.includes("banner")) return "stadium";
  return "generic";
}

/** Added to the negative prompt for stadium images, so the camera cannot leave the sponsor board behind. */
const STADIUM_NEGATIVE = "zoom in, camera pushing forward, camera tilting up, sponsor board leaving the frame";

/** The negative prompt for an image type: the shared one, plus camera moves to avoid for stadium shots. */
export function negativePromptFor(jobType: string | null | undefined, custom?: string | null): string {
  if ((custom ?? "").trim()) return NEGATIVE_PROMPT;
  return motionStyleFor(jobType) === "stadium" ? `${NEGATIVE_PROMPT}, ${STADIUM_NEGATIVE}` : NEGATIVE_PROMPT;
}

export const MAX_CUSTOM_PROMPT_CHARS = 500;

/**
 * The prompt sent to the video model. A person's own wording (optional) replaces the preset motion but the
 * logo-protection sentence is always added.
 */
export function buildMotionPrompt(jobType: string | null | undefined, custom?: string | null): string {
  const own = (custom ?? "").replace(/\s+/g, " ").trim().slice(0, MAX_CUSTOM_PROMPT_CHARS);
  if (own) return `${own} ${KEEP_LOGO}`;
  const style = motionStyleFor(jobType);
  const base = style === "jersey" ? JERSEY : style === "stadium" ? STADIUM : GENERIC;
  return `${base} ${KEEP_LOGO}`;
}
