import assert from "node:assert/strict";
import test from "node:test";
import { NextResponse } from "next/server";
import { countsLine } from "../lib/mail/newsletter-analytics";
import { handleNewsletterAnalyticsGet } from "../lib/mail/newsletter-analytics-handler";

test("countsLine shows delivery breakdown in status order", () => {
  assert.equal(
    countsLine({ accepted: 5, bounced: 1, queued: 2 }),
    "2 queued · 5 accepted · 1 bounced",
  );
});

test("countsLine shows legacy label when a finished send has no delivery rows", () => {
  assert.equal(countsLine({}, "sent"), "no delivery records (legacy)");
  assert.equal(countsLine(undefined, "partial"), "no delivery records (legacy)");
  assert.equal(countsLine({}, "failed"), "no delivery records (legacy)");
  assert.equal(countsLine({}, "draft"), "");
  assert.equal(countsLine({}, "scheduled"), "");
});

test("anonymous GET /api/newsletter/analytics returns 401", async () => {
  const res = await handleNewsletterAnalyticsGet(async () => ({
    error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
  }));
  assert.equal(res.status, 401);
  const body = await res.json();
  assert.equal(body.error, "Unauthorized");
});
