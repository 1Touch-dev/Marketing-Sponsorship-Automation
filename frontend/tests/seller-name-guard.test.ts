import assert from "node:assert/strict";
import test from "node:test";
import {
  filterRealSellers,
  isAggregateSellerName,
  normalizeSellerName,
} from "../lib/intelligence/seller-name-guard";

test("normalizeSellerName trims, lowercases, and strips accents", () => {
  assert.equal(normalizeSellerName("  Réde De  "), "rede de");
  assert.equal(normalizeSellerName("PATROCINADORES"), "patrocinadores");
});

test("must skip approved aggregate labels", () => {
  assert.equal(
    isAggregateSellerName("Agência Curitiba (rede de patrocinadores locais de bebidas)"),
    true,
  );
  assert.equal(
    isAggregateSellerName("Distribuidoras de Bebidas do Centro de Curitiba (cluster)"),
    true,
  );
});

test("must pass approved real company/brand names", () => {
  for (const name of [
    "Ambev",
    "Ambev Brasil",
    "Heineken Brasil",
    "Fruki Bebidas",
    "Agência XYZ Ltda",
  ]) {
    assert.equal(isAggregateSellerName(name), false, `expected pass: ${name}`);
  }
});

test("hard aggregate markers use word boundaries", () => {
  assert.equal(isAggregateSellerName("Rede De Patrocinadores Locais"), true);
  assert.equal(isAggregateSellerName("CLUSTER de marcas"), true);
  assert.equal(isAggregateSellerName("Network of local sponsors"), true);
  // Substring "cluster" inside another word must not block
  assert.equal(isAggregateSellerName("Supercluster Analytics"), false);
});

test("rede de: brand or legal suffix passes; bare aggregate still skips", () => {
  assert.equal(isAggregateSellerName("Rede de Hotéis X"), false);
  assert.equal(isAggregateSellerName("Paredes de Gesso Ltda"), false);
  assert.equal(isAggregateSellerName("RÉDE DE agências"), false);
  assert.equal(isAggregateSellerName("rede de"), true);
  assert.equal(isAggregateSellerName("rede de locais"), true);
});

test("plural collective without brand/legal suffix is aggregate; with brand or Ltda passes", () => {
  assert.equal(isAggregateSellerName("Distribuidoras de Bebidas do Centro de Curitiba"), true);
  assert.equal(isAggregateSellerName("Distribuidora de Bebidas Ferrari Ltda"), false);
  assert.equal(isAggregateSellerName("Distribuidoras de Bebidas Ferrari"), false);
  assert.equal(isAggregateSellerName("Empresas de Bebidas S.A."), false);
});

test("filterRealSellers drops aggregates and empty names", () => {
  const sellers = [
    { name: "Ambev" },
    { name: "Distribuidoras de Bebidas do Centro de Curitiba (cluster)" },
    { name: "  " },
    { name: "Heineken Brasil" },
    { name: "Rede de Hotéis X" },
    { name: "Paredes de Gesso Ltda" },
  ];
  const kept = filterRealSellers(sellers);
  assert.deepEqual(
    kept.map((s) => s.name),
    ["Ambev", "Heineken Brasil", "Rede de Hotéis X", "Paredes de Gesso Ltda"],
  );
});
