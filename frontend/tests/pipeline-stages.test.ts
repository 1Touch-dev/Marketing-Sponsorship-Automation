import assert from "node:assert/strict";
import test from "node:test";
import { PIPELINE_BOARD_STAGE_KEYS, PIPELINE_BOARD_STAGES, PIPELINE_FORM_STAGES } from "../lib/pipeline/stages";
import { parseSocialProjectPatch } from "../lib/social-projects/parse";
import { parseBarterPatch } from "../lib/barter/parse";

test("board columns are pack LTR order plus contact_lead", () => {
  assert.deepEqual([...PIPELINE_BOARD_STAGE_KEYS], [
    "prospect",
    "contact_lead",
    "contacted",
    "qualified",
    "diagnosis",
    "prepare_proposal",
    "proposal_sent",
    "negotiation",
    "closed_won",
    "closed_lost",
  ]);
  assert.equal(PIPELINE_BOARD_STAGES[0].label, "Prospect");
  assert.equal(PIPELINE_BOARD_STAGES.at(-1)?.label, "Closed Lost");
});

test("company forms include competitor then every board key", () => {
  assert.equal(PIPELINE_FORM_STAGES[0].key, "competitor");
  assert.deepEqual(
    PIPELINE_FORM_STAGES.slice(1).map((s) => s.key),
    [...PIPELINE_BOARD_STAGE_KEYS],
  );
});

test("social project PATCH rejects a negative amount raised", () => {
  const bad = parseSocialProjectPatch({ budget_raised: -1 });
  assert.equal(bad.ok, false);
  if (!bad.ok) assert.match(bad.error, /≥ 0|>= 0|number/i);
  const good = parseSocialProjectPatch({ budget_raised: 10000 });
  assert.equal(good.ok, true);
  if (good.ok) assert.equal(good.data.budget_raised, 10000);
});

test("barter PATCH rejects an unknown status", () => {
  const bad = parseBarterPatch({ status: "maybe" });
  assert.equal(bad.ok, false);
  if (!bad.ok) assert.match(bad.error, /status/i);
  const good = parseBarterPatch({ status: "closed", barter_type: "negotiated_discount", target_price: 1500 });
  assert.equal(good.ok, true);
  if (good.ok) {
    assert.equal(good.data.status, "closed");
    assert.equal(good.data.barter_type, "negotiated_discount");
    assert.equal(good.data.target_price, 1500);
  }
});
