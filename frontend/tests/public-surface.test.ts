import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { PUBLIC_SURFACE, isPublicPath } from "../lib/auth/public-surface";

const root = path.resolve(__dirname, "..");
const walk = (dir: string, out: string[] = []): string[] => {
  for (const f of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, f.name);
    if (f.isDirectory()) walk(p, out); else out.push(p);
  }
  return out;
};
const toUrl = (file: string) =>
  "/" + path.relative(path.join(root, "app"), path.dirname(file)).split(path.sep).filter((s) => !/^\(.*\)$/.test(s)).map((s) => (/^\[.*\]$/.test(s) ? "x" : s)).join("/");

const apiRoutes = walk(path.join(root, "app/api")).filter((f) => f.endsWith("route.ts")).map((file) => ({ file, url: toUrl(file), src: fs.readFileSync(file, "utf8") }));
const pages = walk(path.join(root, "app")).filter((f) => /page\.tsx$/.test(f)).map((file) => ({ file, url: toUrl(file), src: fs.readFileSync(file, "utf8") }));

const PORTAL_ENTRY = new Set(["/api/portal/request-link", "/api/portal/verify", "/api/portal/logout"]);

test("every API route that can be reached without a staff session is declared, and its code contains the guard it claims", () => {
  const reachable = apiRoutes.map((r) => ({ ...r, entry: isPublicPath(r.url) })).filter((r) => r.entry);
  assert.ok(reachable.length >= 20, `expected the public API to be found, saw ${reachable.length}`);
  const missing: string[] = [];
  for (const r of reachable) {
    const marker = r.entry!.marker;
    if (r.entry!.guard === "none" && !marker) continue;
    if (!marker) continue;
    if (!marker.test(r.src)) missing.push(`${r.url} (${r.entry!.guard}) lacks ${marker}`);
  }
  assert.deepEqual(missing, [], "these public routes do not contain the guard the public-surface table says they have");
});

test("every sponsor-portal API route checks the sponsor session, except the three sign-in steps", () => {
  const portal = apiRoutes.filter((r) => r.url.startsWith("/api/portal/"));
  assert.ok(portal.length >= 9);
  const unguarded = portal.filter((r) => !PORTAL_ENTRY.has(r.url) && !/portalGet\(/.test(r.src)).map((r) => r.url);
  assert.deepEqual(unguarded, []);
  for (const entry of PORTAL_ENTRY) assert.ok(portal.some((r) => r.url === entry), `${entry} exists`);
  // and they only read: a sponsor session never changes anything but its own sign-in state
  const writes = portal.filter((r) => !PORTAL_ENTRY.has(r.url) && /export (async )?function (POST|PUT|PATCH|DELETE)|export const (POST|PUT|PATCH|DELETE)/.test(r.src)).map((r) => r.url);
  assert.deepEqual(writes, [], "the sponsor portal is read-only");
});

test("the portal pages confirm the sponsor session through the one guard, and the staff-only portal admin is not public", () => {
  const dash = pages.find((p) => p.url === "/portal")!;
  assert.ok(dash && /resolvePortalSession/.test(dash.src) && !/verifySessionToken/.test(dash.src), "the dashboard uses the guard, not the bare cookie check");
  assert.equal(isPublicPath("/api/portal-admin/revoke"), null, "ending portal access needs a staff session");
  for (const p of ["/api/system/health", "/api/system/status", "/api/exports", "/api/proposals/x", "/api/companies", "/api/agent-actions", "/api/tombstones", "/api/audit", "/api/users", "/api/contracts"]) {
    assert.equal(isPublicPath(p), null, `${p} needs a staff session`);
  }
});

test("a bare cookie check is not used anywhere outside the guard", () => {
  const offenders = [...apiRoutes, ...pages].filter((r) => /verifySessionToken\(/.test(r.src) && !r.file.endsWith(path.join("lib", "portal", "guard.ts"))).map((r) => r.file.replace(root + "/", ""));
  assert.deepEqual(offenders, [], "portal sessions are read only through lib/portal/guard.ts");
});

test("the public proposal page sends the sponsor only allow-listed fields", () => {
  const page = pages.find((p) => p.url === "/proposals/view/x")!;
  assert.ok(/sponsorContent\(p\.content\)/.test(page.src), "content goes through the allow-list");
  assert.ok(!/content: p\.content as ProposalContent/.test(page.src), "the raw content is not passed to the browser");
  assert.ok(/sponsorPricingTiers\(/.test(page.src) && /sponsorVariants\(/.test(page.src) && /sponsorIntelligence\(/.test(page.src));
});

test("the table covers every entry once and each says why it is public", () => {
  const seen = new Set<string>();
  for (const e of PUBLIC_SURFACE) {
    assert.ok(e.why.length >= 5, `${e.match} says why`);
    const key = `${e.kind}:${e.match}`;
    assert.ok(!seen.has(key), `${key} is listed twice`);
    seen.add(key);
  }
});
