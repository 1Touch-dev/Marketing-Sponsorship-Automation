import assert from "node:assert/strict";
import test from "node:test";
import { LIVE_STATUSES, OPEN_PIPELINE_STATUSES, PROPOSAL_STAGES, contractedValue, percent, pipelineRange, stageOf, type ProposalStatus, DEFINITIONS } from "../lib/metrics/definitions";

const ALL: ProposalStatus[] = ["draft", "under_review", "revision_requested", "approved", "scheduled", "sent", "rejected", "active_contract"];

test("every proposal status belongs to exactly one stage", () => {
  for (const s of ALL) {
    const stages = Object.entries(PROPOSAL_STAGES).filter(([, list]) => (list as readonly string[]).includes(s));
    assert.equal(stages.length, 1, `${s} is in ${stages.length} stages`);
    assert.ok(stageOf(s));
  }
  const listed = Object.values(PROPOSAL_STAGES).flat();
  assert.equal(new Set(listed).size, listed.length, "no status is listed twice");
  assert.equal(listed.length, ALL.length, "no status is missing");
});

test("live is everything except rejected, and the open pipeline excludes drafts, wins and losses", () => {
  assert.deepEqual(ALL.filter((s) => !LIVE_STATUSES.includes(s)), ["rejected"]);
  for (const s of ["draft", "active_contract", "rejected"] as const) assert.ok(!OPEN_PIPELINE_STATUSES.includes(s));
  for (const s of ["under_review", "revision_requested", "approved"] as const) assert.ok(OPEN_PIPELINE_STATUSES.includes(s));
});

test("a rate with nothing to divide by is not computable, never 0%", () => {
  assert.equal(percent(0, 0), null);
  assert.equal(percent(5, 0), null);
  assert.equal(percent(0, 4), 0);
  assert.equal(percent(4, 7), 57);
  assert.equal(percent(1, 3), 33);
});

test("contracted value does not hide contracts that have no value", () => {
  const v = contractedValue([{ total_value_brl: 100000 }, { total_value_brl: null }, { total_value_brl: 0 }, { total_value_brl: "250000" }]);
  assert.deepEqual([v.total, v.contracts, v.withValue, v.withoutValue], [350000, 4, 2, 2]);
  assert.deepEqual(contractedValue([]), { total: 0, contracts: 0, withValue: 0, withoutValue: 0 });
});

test("package options on one proposal are alternatives: never added together", () => {
  const r = pipelineRange(
    [
      { proposal_id: "a", price_brl: 300000 }, { proposal_id: "a", price_brl: 550000 }, { proposal_id: "a", price_brl: 800000 },
      { proposal_id: "b", price_brl: 100000 }, { proposal_id: "b", price_brl: null },
      { proposal_id: "c", price_brl: 0 },
    ],
    10,
  );
  assert.deepEqual([r.low, r.high, r.pricedProposals, r.openProposals], [400000, 900000, 2, 10]);
  assert.ok(r.low < 300000 + 550000 + 800000 + 100000, "not the sum of all options");
});

test("every metric has a plain-language definition, a source and a place to see the rows", () => {
  for (const [id, d] of Object.entries(DEFINITIONS)) {
    assert.ok(d.label.length > 0 && d.definition.length > 20 && d.source.length > 0 && d.href.startsWith("/"), id);
  }
});
