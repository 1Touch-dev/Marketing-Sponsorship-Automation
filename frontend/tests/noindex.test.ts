import assert from "node:assert/strict";
import test from "node:test";
import { pathNeedsNoIndexHeader } from "../lib/seo/noindex";

test("pathNeedsNoIndexHeader covers login, portal, share views, and lead pages", () => {
  for (const path of [
    "/login",
    "/portal",
    "/portal/login",
    "/proposals/view/abc",
    "/sports-clubs",
    "/nonprofits",
    "/conferences",
    "/chambers",
    "/festivals",
  ]) {
    assert.equal(pathNeedsNoIndexHeader(path), true, path);
  }
});

test("pathNeedsNoIndexHeader skips staff app and APIs", () => {
  for (const path of ["/", "/companies", "/api/health", "/proposals/new"]) {
    assert.equal(pathNeedsNoIndexHeader(path), false, path);
  }
});
