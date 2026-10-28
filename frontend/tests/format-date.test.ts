import assert from "node:assert/strict";
import test from "node:test";
import { formatDate, formatDateOnly } from "../lib/utils";

test("timestamps show Brazil time as dd/mm/yyyy 24h, not UTC or EN month names", () => {
  const shown = formatDate("2026-10-22T12:32:22.286Z");
  assert.match(shown, /22\/10\/2026/);
  assert.match(shown, /09:32/);
  assert.equal(shown.includes("12:32"), false);
  assert.equal(/oct/i.test(shown), false);
});

test("calendar dates stay on the named day (no UTC-midnight shift to 21/10)", () => {
  assert.equal(formatDateOnly("2026-10-22"), "22/10/2026");
  assert.equal(formatDateOnly("2026-10-22T00:00:00.000Z").includes("21/10"), false);
  assert.equal(formatDateOnly(null), "—");
  assert.equal(formatDate(""), "—");
});
