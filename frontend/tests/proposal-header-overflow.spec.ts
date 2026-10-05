import { expect, test } from "playwright/test";

test("stacked proposal header does not widen the document past the viewport", async ({ page }) => {
  await page.setViewportSize({ width: 1028, height: 800 });
  await page.goto("/fixtures/proposal-header");
  const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
  expect(scrollWidth).toBeLessThanOrEqual(1028);
});
