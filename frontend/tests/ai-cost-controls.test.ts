import assert from "node:assert/strict";
import test from "node:test";
import {
  CallThrottle, DayTally, InFlight, MIN_CACHEABLE_CHARS, ProviderBreaker, callerLabel, claudeCostUsd, clampMaxTokens,
  prefixChars, systemBlocks, withToolCache,
} from "../lib/ai/cost-controls";

test("cost: cache reads are a tenth of input, writes 1.25x, output 5x", () => {
  assert.equal(claudeCostUsd({ input: 1_000_000 }), 3);
  assert.equal(claudeCostUsd({ output: 1_000_000 }), 15);
  assert.ok(Math.abs(claudeCostUsd({ cacheRead: 1_000_000 }) - 0.3) < 1e-9);
  assert.ok(Math.abs(claudeCostUsd({ cacheWrite: 1_000_000 }) - 3.75) < 1e-9);
});

test("cost: a warm cache makes the same prompt much cheaper", () => {
  const cold = claudeCostUsd({ input: 2000, output: 2000, cacheWrite: 0 });
  const warm = claudeCostUsd({ input: 100, cacheRead: 1900, output: 2000 });
  assert.ok(warm < cold);
});

test("system prompt is only marked cacheable when it is big enough to cache", () => {
  assert.equal(systemBlocks(undefined), undefined);
  assert.equal(systemBlocks("short"), "short");
  const big = "x".repeat(MIN_CACHEABLE_CHARS);
  const blocks = systemBlocks(big);
  assert.ok(Array.isArray(blocks) && blocks[0].cache_control?.type === "ephemeral");
});

test("tool cache marker goes on the last tool only", () => {
  const tools = withToolCache([{ name: "a" }, { name: "b" }, { name: "c" }]);
  assert.equal((tools[0] as { cache_control?: unknown }).cache_control, undefined);
  assert.equal((tools[2] as { cache_control?: unknown }).cache_control !== undefined, true);
  assert.deepEqual(withToolCache([]), []);
  assert.ok(prefixChars("abc", [{ n: 1 }]) > 3);
});

test("max_tokens is clamped to the ceiling and has a sane fallback", () => {
  assert.equal(clampMaxTokens(undefined, 2048), 2048);
  assert.equal(clampMaxTokens(100000, 2048), 4096);
  assert.equal(clampMaxTokens(500, 2048), 500);
});

test("throttle blocks the call after the limit and recovers after the window", () => {
  const t = new CallThrottle(3, 60_000);
  assert.deepEqual([t.tryAcquire(0), t.tryAcquire(1), t.tryAcquire(2), t.tryAcquire(3)], [true, true, true, false]);
  assert.equal(t.tryAcquire(61_000), true);
});

test("breaker stays open for its cooldown, then closes", () => {
  const b = new ProviderBreaker(1000);
  assert.equal(b.isOpen(0), false);
  b.trip(0);
  assert.equal(b.isOpen(500), true);
  assert.equal(b.isOpen(1001), false);
  b.trip(2000); b.reset();
  assert.equal(b.isOpen(2100), false);
});

test("in-flight reservations count until released, and release is idempotent", () => {
  const f = new InFlight();
  const r1 = f.reserve(0.1), r2 = f.reserve(0.1);
  assert.ok(Math.abs(f.usd - 0.2) < 1e-9);
  r1(); r1();
  assert.ok(Math.abs(f.usd - 0.1) < 1e-9);
  r2();
  assert.equal(f.usd, 0);
});

test("day tally rolls over at UTC midnight", () => {
  const d = new DayTally();
  d.add(5, new Date("2026-10-05T23:59:00Z"));
  assert.equal(d.get(new Date("2026-10-05T23:59:30Z")), 5);
  assert.equal(d.get(new Date("2026-10-06T00:00:10Z")), 0);
});

test("caller label comes from the route file in the stack", () => {
  assert.equal(callerLabel("at x (/srv/.next/server/app/api/proposals/wizard/generate/route.js:1:1)"), "proposals/wizard/generate");
  assert.equal(callerLabel("at y (/srv/.next/server/app/api/companies/[id]/discover/route.js:5:2)"), "companies/id/discover");
  assert.equal(callerLabel(undefined), "unknown");
  assert.equal(callerLabel("at z (/node_modules/foo.js:1:1)"), "unknown");
});
