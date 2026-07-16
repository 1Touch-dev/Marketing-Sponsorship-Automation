import type { JerseyPlacementId } from "./jersey-placements";

/**
 * The one sponsor zone the logo must be added to. Left/right is always from the
 * WEARER'S perspective, anchored to landmarks already visible on the shirt so
 * the model finds the exact spot. These match the official Coritiba manual zones.
 */
const PLACEMENT_POSITION: Record<JerseyPlacementId, string> = {
  chest_sponsor:
    "the wearer's right chest (the viewer's left side), opposite the club crest",
  chest_above_name:
    "the small area on the chest just above the manufacturer name",
  sleeve_left:
    "the wearer's left sleeve (the sleeve on the viewer's right side)",
  sleeve_right:
    "the wearer's right sleeve (the sleeve on the viewer's left side)",
  back:
    "the upper back, above the player number",
  number:
    "next to the player number on the back",
  shorts:
    "the outer side of the shorts",
  socks:
    "the outer side of the socks",
};

export function buildJerseyPlacementPrompt(input: {
  placement: JerseyPlacementId;
  kitType?: string;
}): string {
  const position = PLACEMENT_POSITION[input.placement];

  return `Image 1 is the original Coritiba FC photograph.
Image 2 is the sponsor logo.

Your only task: add the logo from Image 2 onto ${position}, and blend it naturally into the jersey fabric. Do nothing else.

Add exactly one copy of the logo, in that one place only. Never duplicate it and never place it anywhere else.

The logo must keep its exact colours, shapes, proportions, spacing and typography. Do not redraw or change it. If it has a solid rectangular background, remove only that background.

Blend the logo into the fabric so it looks screen printed into the cloth — following the fabric folds, wrinkles, curves, lighting and shadows. It should look printed on, not like a flat sticker.

Do not change anything else in the photograph. Keep the player, face, pose, jersey, colours, club crest, manufacturer logo, any existing sponsor already on the shirt, sleeve badges, stadium, background, lighting and camera exactly as they are. Only add the one logo.`;
}
