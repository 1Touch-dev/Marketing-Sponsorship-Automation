import assert from "node:assert/strict";
import test from "node:test";
import { buildQuoteLines, canonicalJson, compareToApproved, quoteTotal, revisionChecksum, type Snapshot } from "../lib/proposals/revisions";

const base = (): Snapshot => ({
  title: "Google x Coritiba",
  content: { executive_summary: "S", deliverables: ["a", "b"], fulfillment_tasks: [{ id: 1 }] },
  lines: buildQuoteLines([
    { inventory_id: "i1", quantity: 1, scope: "per_season", price_agreed: 1000, name: "LED" },
    { inventory_id: "i2", quantity: 2, scope: "per_month", price_agreed: "500", name: "Banner" },
  ]),
});

test("canonical JSON ignores key order", () => {
  assert.equal(canonicalJson({ b: 1, a: [2, { d: 1, c: 2 }] }), canonicalJson({ a: [2, { c: 2, d: 1 }], b: 1 }));
});

test("checksum is stable across line order and ignores operational data and display names", () => {
  const a = base();
  const b = { ...base(), lines: [...base().lines].reverse() };
  b.content = { ...b.content, fulfillment_tasks: [{ id: 99 }], uploaded_assets: ["x"] };
  b.lines = b.lines.map((l) => ({ ...l, name: "renamed" }));
  assert.equal(revisionChecksum(a), revisionChecksum(b));
});

test("changing the offered text, price, quantity or adding an asset changes the checksum", () => {
  const c0 = revisionChecksum(base());
  const text = base(); text.content = { ...text.content, executive_summary: "different" };
  assert.notEqual(revisionChecksum(text), c0);
  const price = base(); price.lines = buildQuoteLines([{ inventory_id: "i1", quantity: 1, scope: "per_season", price_agreed: 999 }, { inventory_id: "i2", quantity: 2, scope: "per_month", price_agreed: 500 }]);
  assert.notEqual(revisionChecksum(price), c0);
  const extra = base(); extra.lines = buildQuoteLines([...extra.lines.map((l) => ({ inventory_id: l.inventory_id, quantity: l.quantity, scope: l.unit, price_agreed: l.unit_price })), { inventory_id: "i3", quantity: 1, scope: "per_season", price_agreed: 1 }]);
  assert.notEqual(revisionChecksum(extra), c0);
});

test("a bigger discount, a different authoriser or a tax change is a change", () => {
  const mk = (extra: object) => buildQuoteLines([{ inventory_id: "i1", quantity: 1, scope: "per_season", price_agreed: 1000, ...extra }]);
  const s = (lines: ReturnType<typeof mk>): Snapshot => ({ title: "t", content: {}, lines });
  const c0 = revisionChecksum(s(mk({})));
  assert.notEqual(revisionChecksum(s(mk({ discount_pct: 10 }))), c0);
  assert.notEqual(revisionChecksum(s(mk({ discount_pct: 10, discount_authorized_by: "u1" }))), revisionChecksum(s(mk({ discount_pct: 10, discount_authorized_by: "u2" }))));
  assert.notEqual(revisionChecksum(s(mk({ tax_treatment: "tax_inclusive" }))), c0);
});

test("line totals apply the discount and the quote total sums them", () => {
  const lines = buildQuoteLines([
    { inventory_id: "i1", quantity: 2, price_agreed: 1000, discount_pct: 10 },
    { inventory_id: "i2", quantity: 1, price_agreed: 500 },
    { inventory_id: "i3", quantity: 1, price_agreed: null },
  ]);
  assert.equal(quoteTotal(lines), 2300);
  assert.equal(lines.find((l) => l.inventory_id === "i3")?.line_total, null);
});

test("drift: no approved revision is not drift; same terms are not drift; changed terms are", () => {
  const snap = base();
  const approved = revisionChecksum(snap);
  assert.deepEqual([compareToApproved(null, snap).hasApprovedRevision, compareToApproved(null, snap).drifted], [false, false]);
  assert.equal(compareToApproved(approved, snap).drifted, false);
  const changed = base(); changed.title = "New title";
  assert.equal(compareToApproved(approved, changed).drifted, true);
});
