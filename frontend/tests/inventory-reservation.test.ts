import assert from "node:assert/strict";
import test from "node:test";
import { commitLines, releaseLines, isCapacityLimited, type InventoryRow, type InventoryStore } from "../lib/inventory/reservation";

function memoryStore(rows: InventoryRow[]) {
  const data = new Map(rows.map((r) => [r.id, { ...r }]));
  const store: InventoryStore = {
    async getRow(id) {
      await new Promise((r) => setImmediate(r)); // yield so concurrent callers interleave between read and write
      const row = data.get(id);
      return row ? { ...row } : null;
    },
    async casSold(id, expected, next) {
      const row = data.get(id);
      if (!row || (row.quantity_sold ?? null) !== expected) return false;
      row.quantity_sold = next;
      return true;
    },
  };
  return { store, data };
}

const season = (id: string, total: number, extra: Partial<InventoryRow> = {}): InventoryRow => ({
  id, name: id, total_quantity: total, quantity_sold: 0, availability: "available", unit: "Ano", unit_type: "per_season", ...extra,
});

test("two buyers racing for the last unit: exactly one wins", async () => {
  const { store, data } = memoryStore([season("jersey", 1)]);
  const [a, b] = await Promise.all([
    commitLines(store, [{ inventory_id: "jersey", quantity: 1 }]),
    commitLines(store, [{ inventory_id: "jersey", quantity: 1 }]),
  ]);
  assert.equal([a, b].filter((r) => r.ok).length, 1);
  const loser = [a, b].find((r) => !r.ok);
  assert.ok(loser && !loser.ok && /remaining|sold|No units/i.test(loser.conflict.reason));
  assert.equal(data.get("jersey")?.quantity_sold, 1);
});

test("ten racers for 3 units: exactly 3 win and the counter never exceeds capacity", async () => {
  const { store, data } = memoryStore([season("board", 3)]);
  const results = await Promise.all(Array.from({ length: 10 }, () => commitLines(store, [{ inventory_id: "board", quantity: 1 }])));
  assert.equal(results.filter((r) => r.ok).length, 3);
  assert.equal(data.get("board")?.quantity_sold, 3);
});

test("a multi-line request is all-or-nothing", async () => {
  const { store, data } = memoryStore([season("a", 1), season("b", 1, { quantity_sold: 1 })]);
  const r = await commitLines(store, [{ inventory_id: "a", quantity: 1 }, { inventory_id: "b", quantity: 1 }]);
  assert.equal(r.ok, false);
  assert.equal(data.get("a")?.quantity_sold, 0, "line a must be rolled back");
});

test("an item flagged sold cannot be committed even if counters show units left", async () => {
  const { store } = memoryStore([season("naming", 1, { availability: "sold" })]);
  const r = await commitLines(store, [{ inventory_id: "naming", quantity: 1 }]);
  assert.equal(r.ok, false);
});

test("per-match and digital units are not capacity-limited", async () => {
  assert.equal(isCapacityLimited({ unit: "Por Jogo", unit_type: "per_season" }), false);
  assert.equal(isCapacityLimited({ unit: "per post", unit_type: "per_season" }), false);
  assert.equal(isCapacityLimited({ unit: "Ano", unit_type: "per_season" }), true);
  const { store, data } = memoryStore([{ id: "post", name: "post", total_quantity: 1, quantity_sold: 0, availability: "available", unit: "per post", unit_type: "per_season" }]);
  const r = await commitLines(store, [{ inventory_id: "post", quantity: 5 }]);
  assert.equal(r.ok, true);
  assert.equal(data.get("post")?.quantity_sold, 0);
});

test("release frees units and never goes below zero", async () => {
  const { store, data } = memoryStore([season("x", 2)]);
  await commitLines(store, [{ inventory_id: "x", quantity: 2 }]);
  await releaseLines(store, [{ inventory_id: "x", quantity: 1 }]);
  assert.equal(data.get("x")?.quantity_sold, 1);
  await releaseLines(store, [{ inventory_id: "x", quantity: 5 }]);
  assert.equal(data.get("x")?.quantity_sold, 0);
});

test("duplicate lines for one item are merged before checking capacity", async () => {
  const { store } = memoryStore([season("y", 1)]);
  const r = await commitLines(store, [{ inventory_id: "y", quantity: 1 }, { inventory_id: "y", quantity: 1 }]);
  assert.equal(r.ok, false);
});
