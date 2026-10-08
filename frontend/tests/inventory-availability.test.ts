import assert from "node:assert/strict";
import test from "node:test";
import { effectiveAvailability, resolveRate, resolveUnit, soldOutLines } from "../lib/inventory/availability";

test("an item flagged sold in the catalog is sold out even when the counters say units remain", () => {
  const eff = effectiveAvailability({ availability: "sold", total_quantity: 1, quantity_sold: 0 });
  assert.equal(eff.state, "sold_out");
  assert.equal(eff.remaining, 0);
});

test("remaining units subtract both sold and reserved counts", () => {
  const eff = effectiveAvailability({ availability: "available", total_quantity: 5, quantity_sold: 2, quantity_reserved: 3 });
  assert.equal(eff.state, "sold_out");
  const eff2 = effectiveAvailability({ availability: "available", total_quantity: 5, quantity_sold: 2, quantity_reserved: 1 });
  assert.equal(eff2.state, "available");
  assert.equal(eff2.remaining, 2);
});

test("limited stays limited and still sellable", () => {
  const eff = effectiveAvailability({ availability: "limited", total_quantity: 1 });
  assert.equal(eff.state, "limited");
  assert.equal(eff.remaining, 1);
});

test("explicit unit text wins over the per_season schema default", () => {
  assert.equal(resolveUnit({ unit: "Por Jogo", unit_type: "per_season" }).unit, "per_game");
  assert.equal(resolveUnit({ unit: "per month", unit_type: "per_season" }).unit, "per_month");
  assert.equal(resolveUnit({ unit: "Ano", unit_type: "per_season" }).unit, "per_season");
  assert.equal(resolveUnit({ unit: "Year", unit_type: "per_season" }).assumed, false);
});

test("a missing unit falls back to unit_type and is marked assumed", () => {
  const u = resolveUnit({ unit: null, unit_type: "per_month" });
  assert.equal(u.unit, "per_month");
  assert.equal(u.assumed, true);
});

test("tier price is used by company size and flagged when it disagrees with the catalog range", () => {
  const item = { price_min: 8500000, price_max: 22000000, price_medium: 140000, price_large: 200000, unit: "Ano" };
  const medium = resolveRate(item, "medium");
  assert.equal(medium.amount, 140000);
  assert.equal(medium.outsideCatalogRange, true);
  assert.equal(resolveRate(item, "large").amount, 200000);
});

test("without tier prices the catalog minimum is used and not flagged", () => {
  const rate = resolveRate({ price_min: 1000000, price_max: 2000000 }, "medium");
  assert.equal(rate.amount, 1000000);
  assert.equal(rate.basis, "catalog_min");
  assert.equal(rate.outsideCatalogRange, false);
});

test("soldOutLines rejects sold and unknown items only", () => {
  const rows = new Map([
    ["a", { id: "a", name: "Number", availability: "sold", total_quantity: 1 }],
    ["b", { id: "b", name: "LED", availability: "available", total_quantity: 1 }],
  ]);
  const conflicts = soldOutLines([{ inventory_id: "a" }, { inventory_id: "b" }, { inventory_id: "zzz" }], rows);
  assert.deepEqual(conflicts.map((c) => c.inventory_id).sort(), ["a", "zzz"]);
});
