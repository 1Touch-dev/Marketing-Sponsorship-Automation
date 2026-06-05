/**
 * Replicate FLUX LoRA prompts — crest fixed on wearer's left; sponsor on opposite side.
 */

import type { JerseyPlacementId } from "./jersey-placements";

export type ScenePreset = {
  label: string;
  description: string;
  promptSuffix: string;
  aspectRatio: "1:1" | "4:5" | "16:9" | "3:4";
};

export const SCENE_PRESETS: ScenePreset[] = [
  {
    label: "Produto Estúdio",
    description: "Camisa em estúdio sobre fundo branco",
    promptSuffix:
      "floating jersey on white background, studio lighting, ecommerce product shot, clean minimal",
    aspectRatio: "4:5",
  },
  {
    label: "Modelo em Campo",
    description: "Atleta vestindo a camisa em campo",
    promptSuffix:
      "worn by professional athlete standing on football pitch, stadium background, golden hour lighting, lifestyle sports photography",
    aspectRatio: "4:5",
  },
  {
    label: "Patrocinador no Peito",
    description: "Close-up do patrocinador no peito direito do atleta (lado oposto ao escudo)",
    promptSuffix:
      "close up of wearer's right chest only showing sponsor logo area, authentic Coritiba club crest visible unchanged on wearer's left chest, macro textile photography, sharp detail, do not replace crest",
    aspectRatio: "1:1",
  },
  {
    label: "Dia de Jogo",
    description: "Atleta correndo no estádio",
    promptSuffix:
      "worn by player running in stadium during match, crowd in background, broadcast camera angle, action sports photography",
    aspectRatio: "16:9",
  },
  {
    label: "Manequim Frontal",
    description: "Vista frontal em manequim",
    promptSuffix:
      "on mannequin, front view, neutral grey gradient background, professional commercial photography, full torso visible",
    aspectRatio: "3:4",
  },
];

const CREST_RULE =
  "authentic Coritiba FC club crest unchanged on wearer's left chest, never replace or alter the crest";

function sponsorPlacementPhrase(sponsorName: string, placement: JerseyPlacementId): string {
  switch (placement) {
    case "chest_sponsor":
      return `${sponsorName} sponsor logo text only on wearer's right chest opposite the crest`;
    case "chest_above_name":
      return `small ${sponsorName} sponsor logo above player name on chest, main crest unchanged on wearer's left`;
    case "sleeve_left":
      return `${sponsorName} sponsor logo on wearer's left sleeve only, crest unchanged on chest`;
    case "sleeve_right":
      return `${sponsorName} sponsor logo on wearer's right sleeve only, crest unchanged on chest`;
    case "back":
      return `${sponsorName} sponsor logo on back of jersey below collar, large back print`;
    case "shorts":
      return `full kit with coritiba shorts, ${sponsorName} sponsor logo on front of shorts`;
    case "socks":
      return `full kit with coritiba socks, ${sponsorName} sponsor logo on socks`;
    default:
      return `${sponsorName} sponsor branding on wearer's right chest opposite the crest`;
  }
}

export function buildReplicatePrompt(
  sponsorName: string,
  scenePreset: ScenePreset,
  customNote: string,
  placement: JerseyPlacementId = "chest_sponsor"
): string {
  const base = `coritiba_jersey green football kit, ${CREST_RULE},`;
  const sponsor = customNote.trim()
    ? `${sponsorPlacementPhrase(sponsorName, placement)}, ${customNote.trim()},`
    : `${sponsorPlacementPhrase(sponsorName, placement)},`;
  return `${base} ${sponsor} ${scenePreset.promptSuffix}`;
}
