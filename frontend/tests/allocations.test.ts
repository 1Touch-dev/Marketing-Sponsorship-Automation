import assert from "node:assert/strict";
import test from "node:test";
import { allocationRowsFromLines, allocationTaskTitle, missingAllocationTasks, renewalLineFromAllocation, type DeliveryTask } from "../lib/allocations/model";
import { buildQuoteLines, revisionChecksum } from "../lib/proposals/revisions";

const lines = buildQuoteLines([
  { id: "a1", inventory_id: "i1", quantity: 1, scope: "per_season", price_agreed: 1000, name: "Jersey front" },
  { id: "a2", inventory_id: "i2", quantity: 3, scope: "per_game", price_agreed: 200, discount_pct: 10, name: "LED board" },
]);

test("each quote line carries its own id as the allocation id", () => {
  assert.deepEqual(lines.map((l) => l.allocation_id).sort(), ["a1", "a2"]);
});

test("the allocation id is part of the frozen terms: a different line id is a different checksum", () => {
  const other = buildQuoteLines([
    { id: "zz", inventory_id: "i1", quantity: 1, scope: "per_season", price_agreed: 1000, name: "Jersey front" },
    { id: "a2", inventory_id: "i2", quantity: 3, scope: "per_game", price_agreed: 200, discount_pct: 10, name: "LED board" },
  ]);
  const snap = (l: typeof lines) => ({ title: "t", content: {}, lines: l });
  assert.notEqual(revisionChecksum(snap(lines)), revisionChecksum(snap(other)));
});

test("contract allocation rows copy the frozen line terms and keep the allocation id", () => {
  const rows = allocationRowsFromLines(lines, { tenantId: "t1", contractId: "c1", proposalId: "p1", revisionId: "r1" });
  assert.equal(rows.length, 2);
  const led = rows.find((r) => r.allocation_id === "a2")!;
  assert.deepEqual([led.contract_id, led.revision_id, led.inventory_name, led.quantity, led.unit, led.unit_price, led.discount_pct], ["c1", "r1", "LED board", 3, "per_game", 200, 10]);
});

test("lines without an allocation id are not recorded as allocations", () => {
  const legacy = buildQuoteLines([{ inventory_id: "i9", quantity: 1, price_agreed: 5 }]);
  assert.equal(allocationRowsFromLines(legacy, { tenantId: "t", contractId: "c", proposalId: "p", revisionId: null }).length, 0);
});

test("one delivery task per allocation, never duplicated on a second pass", () => {
  const allocs = [
    { allocation_id: "a1", inventory_name: "Jersey front", quantity: 1, unit: "per_season" },
    { allocation_id: "a2", inventory_name: "LED board", quantity: 3, unit: "per_game" },
  ];
  let n = 0;
  const first = missingAllocationTasks([], allocs, () => `t${++n}`, "2026-01-01");
  assert.equal(first.length, 2);
  assert.equal(first[0].allocation_id, "a1");
  assert.equal(first[1].title, "Entregar: LED board × 3 (per match)");
  const standard: DeliveryTask = { id: "s", title: "standard", status: "pending", created_at: "", completed_at: null };
  assert.equal(missingAllocationTasks([standard, ...first], allocs, () => "x").length, 0);
  assert.equal(missingAllocationTasks([standard, first[0]], allocs, () => "y").length, 1);
});

test("a renewal line points back at the allocation it continues", () => {
  const r = renewalLineFromAllocation(
    { allocation_id: "a1", inventory_id: "i1", quantity: 1, unit: "per_season", unit_price: 1000, currency: "BRL" },
    { tenantId: "t", proposalId: "p2", priorContractNumber: "C-2026-001" },
  );
  assert.equal(r.renewed_from_allocation_id, "a1");
  assert.equal(r.proposal_id, "p2");
  assert.match(r.notes, /C-2026-001/);
  assert.equal(allocationTaskTitle({ inventory_name: null, quantity: 2, unit: "per_month" }), "Entregar: item × 2 (per month)");
});
