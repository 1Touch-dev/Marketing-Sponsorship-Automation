/**
 * Motion prompts for the video intro, by what the source image shows.
 * Ported from the 1Touch AI Studio (lib/prompts/sections/motion/*): its tests found that a vague "keep everything
 * unchanged" prompt gave a video that did not move at all, so each prompt asks for specific, modest motion and
 * says the sponsor logo must stay readable.
 */

const KEEP_LOGO = "The sponsor logo stays sharp, readable and exactly the same shape in every frame. No new text appears.";

const JERSEY =
  "The player shows natural, subtle live-match motion: gentle body sway and weight shift, natural breathing, small head or shoulder movement, fabric responding naturally. Camera holds mostly steady with a slight cinematic drift. The jersey and its details stay consistent throughout.";

const STADIUM =
  "The stadium feels like a live broadcast: the crowd shifts and reacts, flags and banners wave, floodlights flicker subtly, light haze drifts, and any LED boards glow with gentle animation. Camera holds mostly steady with a slight cinematic drift. The stadium structure stays consistent throughout.";

const GENERIC =
  "Slow, smooth cinematic camera push-in toward the subject, with natural subtle motion in the scene such as fabric, crowd and atmosphere. The subject and setting stay the same, only the camera moves.";

/** Which of the three styles an image job calls for (job_type values written by the mockup routes). */
export function motionStyleFor(jobType: string | null | undefined): "jersey" | "stadium" | "generic" {
  const t = (jobType ?? "").toLowerCase();
  if (t.includes("jersey")) return "jersey";
  if (t.includes("stadium") || t.includes("led") || t.includes("scoreboard") || t.includes("banner")) return "stadium";
  return "generic";
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
