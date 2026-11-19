import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import {
  FORGOT_PASSWORD_GENERIC_MESSAGE,
  PASSWORD_LINK_VALID_MINUTES,
  buildSetPasswordAppUrl,
  passwordLinkAuditMeta,
  passwordLinkEmailCopy,
} from "../lib/auth/password-links";
import { isPublicPath } from "../lib/auth/public-surface";

test("buildSetPasswordAppUrl uses app path with token_hash and type — not supabase action_link host", () => {
  const url = buildSetPasswordAppUrl({
    tokenHash: "abcTOKEN123",
    kind: "invite",
    appUrl: "https://sponsorship.coritiba.com.br",
  });
  assert.equal(
    url,
    "https://sponsorship.coritiba.com.br/auth/set-password?token_hash=abcTOKEN123&type=invite",
  );
  assert.ok(!/supabase\.co/i.test(url));
  assert.ok(!/action_link/i.test(url));
});

test("buildSetPasswordAppUrl recovery type", () => {
  const url = buildSetPasswordAppUrl({
    tokenHash: "recov",
    kind: "recovery",
    appUrl: "https://example.com/",
  });
  assert.match(url, /type=recovery/);
  assert.match(url, /token_hash=recov/);
});

test("passwordLinkEmailCopy: PT then EN, contains app link, no password word as credential", () => {
  const link =
    "https://sponsorship.coritiba.com.br/auth/set-password?token_hash=xyz&type=invite";
  const copy = passwordLinkEmailCopy({ appLink: link, kind: "invite" });
  assert.match(copy.subject, /Defina sua senha/);
  assert.match(copy.subject, /Set your password/);
  const ptIdx = copy.bodyText.indexOf("convidado");
  const enIdx = copy.bodyText.indexOf("You were invited");
  assert.ok(ptIdx >= 0 && enIdx > ptIdx, "Portuguese before English in body");
  assert.ok(copy.bodyText.includes(link));
  // HTML attribute escapes & → &amp; in the query string
  assert.ok(copy.bodyHtml.includes("/auth/set-password?token_hash=xyz&amp;type=invite"));
  assert.ok(!/supabase\.co/i.test(copy.bodyText));
  // Must not embed a chosen password — only the set-password link.
  assert.ok(!/\bpassword is\b/i.test(copy.bodyText));
  assert.ok(!/\bsenha é\b/i.test(copy.bodyText));
});

test("passwordLinkEmailCopy recovery wording", () => {
  const copy = passwordLinkEmailCopy({
    appLink: "https://app.example/auth/set-password?token_hash=t&type=recovery",
    kind: "recovery",
  });
  assert.match(copy.subject, /Redefinir senha/);
  assert.match(copy.bodyText, /redefinir a senha/i);
  assert.match(copy.bodyText, /reset your account password/i);
});

test("passwordLinkAuditMeta never includes token, url, or body fields", () => {
  const meta = passwordLinkAuditMeta("Ana@Club.com", "recovery");
  assert.deepEqual(meta, {
    email: "ana@club.com",
    kind: "recovery",
    link_valid_minutes: PASSWORD_LINK_VALID_MINUTES,
  });
  assert.equal(PASSWORD_LINK_VALID_MINUTES, 60);
  for (const forbidden of [
    "token_hash",
    "action_link",
    "appLink",
    "bodyText",
    "bodyHtml",
    "url",
    "link",
  ]) {
    assert.equal(Object.prototype.hasOwnProperty.call(meta, forbidden), false);
  }
});

test("forgot-password generic message is stable for enumeration safety", () => {
  assert.equal(
    FORGOT_PASSWORD_GENERIC_MESSAGE,
    "If this email has an account, we sent a link",
  );
});

test("public surface: set-password page and forgot/set-password APIs are public", () => {
  const page = isPublicPath("/auth/set-password");
  assert.ok(page);
  assert.equal(page!.guard, "none");

  const forgot = isPublicPath("/api/auth/forgot-password");
  assert.ok(forgot);
  assert.equal(forgot!.guard, "rate-limited-form");
  assert.ok(forgot!.marker?.test("checkRateLimit"));

  const setPw = isPublicPath("/api/auth/set-password");
  assert.ok(setPw);
  assert.equal(setPw!.guard, "rate-limited-form");
  assert.ok(setPw!.marker?.test("checkRateLimit"));
});

test("change-password and user invite APIs are not public", () => {
  assert.equal(isPublicPath("/api/auth/change-password"), null);
  assert.equal(isPublicPath("/api/users"), null);
  assert.equal(isPublicPath("/api/users/x/resend-invite"), null);
  assert.equal(isPublicPath("/api/users/x/send-reset"), null);
});

test("set-password page posts to API and does not call verifyOtp in the browser", () => {
  const src = fs.readFileSync(
    path.join(__dirname, "../app/auth/set-password/page.tsx"),
    "utf8",
  );
  assert.match(src, /\/api\/auth\/set-password/);
  assert.ok(!/\.verifyOtp\s*\(/.test(src), "page must not call verifyOtp (server does)");
  assert.ok(!/supabaseBrowser/.test(src), "page must not use supabaseBrowser for set-password");
  assert.ok(!/\.updateUser\s*\(/.test(src), "page must not call updateUser");
});

test("change-password route does not global-signOut the anon verify client", () => {
  const src = fs.readFileSync(
    path.join(__dirname, "../app/api/auth/change-password/route.ts"),
    "utf8",
  );
  assert.ok(
    !/anon\.auth\.signOut\(\s*\)/.test(src),
    "anon.auth.signOut() without scope would kill the cookie session (global)",
  );
  assert.match(src, /signOut\(\s*\{\s*scope:\s*"others"/);
  assert.match(src, /updateUser\(\s*\{\s*password/);
});

test("set-password API uses anon verifyOtp then admin.updateUserById", () => {
  const src = fs.readFileSync(
    path.join(__dirname, "../app/api/auth/set-password/route.ts"),
    "utf8",
  );
  assert.match(src, /checkRateLimit/);
  assert.match(src, /verifyOtp/);
  assert.match(src, /updateUserById/);
  assert.match(src, /supabaseAnonNoSession/);
});
