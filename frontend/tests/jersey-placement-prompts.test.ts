import assert from "node:assert/strict";
import test from "node:test";
import { buildJerseyPlacementPrompt } from "../lib/media/jersey-placement-prompts";
import { JERSEY_PLACEMENTS } from "../lib/media/jersey-placements";

test("every jersey placement has a distinct, simple prompt", () => {
  const prompts = JERSEY_PLACEMENTS.map((p) =>
    buildJerseyPlacementPrompt({ placement: p.id, kitType: "home" }),
  );

  const unique = new Set(prompts);
  assert.equal(unique.size, prompts.length, "prompts must not collapse into one generic template");

  for (const prompt of prompts) {
    assert.match(prompt, /Image 1 is the original Coritiba FC photograph\./);
    assert.match(prompt, /Image 2 is the sponsor logo\./);
    assert.match(prompt, /Your only task/);
    assert.match(prompt, /Add exactly one copy of the logo/);
    assert.match(prompt, /Only add the one logo\./);
    // No coordinates, no cm sizes, no replacement/QA machinery.
    assert.doesNotMatch(prompt, /\d+\s*cm|x\s*=|coordinate|REPLACE|RETRY/i);
    // Existing shirt elements must be preserved (never disturbed).
    assert.match(prompt, /existing sponsor already on the shirt/);
    // Keep it short and pure.
    assert.ok(prompt.length < 1300, "prompt must stay short and simple");
  }
});

test("each prompt names its specific sponsorship position", () => {
  assert.match(buildJerseyPlacementPrompt({ placement: "chest_sponsor" }), /right chest/);
  assert.match(buildJerseyPlacementPrompt({ placement: "sleeve_left" }), /left sleeve/);
  assert.match(buildJerseyPlacementPrompt({ placement: "sleeve_right" }), /right sleeve/);
  assert.match(buildJerseyPlacementPrompt({ placement: "back" }), /upper back/);
  assert.match(buildJerseyPlacementPrompt({ placement: "shorts" }), /shorts/);
  assert.match(buildJerseyPlacementPrompt({ placement: "socks" }), /socks/);
});
