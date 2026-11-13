import assert from "node:assert/strict";
import test from "node:test";
import { httpUrlOrNull, userMeUpdateSchema, proposalUpdateSchema } from "../lib/validators";
import { meetingLinkForUser, isMissingCalendarUrlColumn } from "../lib/proposals/meeting-link";
import { buildCalendarUrlUpdate, ME_PATCH_FORBIDDEN_KEYS } from "../lib/users/me-calendar";

test("httpUrlOrNull: empty / whitespace → null", () => {
  assert.equal(httpUrlOrNull.parse(""), null);
  assert.equal(httpUrlOrNull.parse("   "), null);
  assert.equal(httpUrlOrNull.parse(null), null);
});

test("httpUrlOrNull: accepts http(s) only", () => {
  assert.equal(httpUrlOrNull.parse("https://cal.com/you"), "https://cal.com/you");
  assert.equal(httpUrlOrNull.parse("http://calendly.com/you"), "http://calendly.com/you");
  assert.throws(() => httpUrlOrNull.parse("javascript:alert(1)"));
  assert.throws(() => httpUrlOrNull.parse("data:text/html,hi"));
  assert.throws(() => httpUrlOrNull.parse("ftp://files.example/x"));
  assert.throws(() => httpUrlOrNull.parse("not-a-url"));
});

test("meetingLinkForUser: empty/missing → null", () => {
  assert.equal(meetingLinkForUser({}), null);
  assert.equal(meetingLinkForUser({ calendar_url: null }), null);
  assert.equal(meetingLinkForUser({ calendar_url: "" }), null);
  assert.equal(meetingLinkForUser({ calendar_url: "  " }), null);
  assert.equal(meetingLinkForUser({ calendar_url: "https://cal.com/x" }), "https://cal.com/x");
});

test("buildCalendarUrlUpdate: only calendar_url + updated_at (never role)", () => {
  const u = buildCalendarUrlUpdate("https://cal.com/x");
  assert.deepEqual(Object.keys(u).sort(), ["calendar_url", "updated_at"]);
  assert.equal(u.calendar_url, "https://cal.com/x");
  assert.equal(buildCalendarUrlUpdate(null).calendar_url, null);
  for (const k of ME_PATCH_FORBIDDEN_KEYS) {
    assert.equal(Object.prototype.hasOwnProperty.call(u, k), false);
  }
});

test("userMeUpdateSchema: { role: admin, calendar_url } keeps only calendar_url in parse result", () => {
  const parsed = userMeUpdateSchema.safeParse({
    role: "admin",
    is_active: false,
    calendar_url: "https://cal.com/x",
  });
  assert.equal(parsed.success, true);
  if (!parsed.success) return;
  assert.deepEqual(Object.keys(parsed.data), ["calendar_url"]);
  assert.equal(parsed.data.calendar_url, "https://cal.com/x");
  const update = buildCalendarUrlUpdate(parsed.data.calendar_url ?? null);
  assert.equal("role" in update, false);
  assert.equal(update.calendar_url, "https://cal.com/x");
});

test("userMeUpdateSchema: role-only body does not invent calendar_url", () => {
  const parsed = userMeUpdateSchema.safeParse({ role: "admin" });
  assert.equal(parsed.success, true);
  if (!parsed.success) return;
  assert.equal(parsed.data.calendar_url, undefined);
});

test("proposalUpdateSchema: meeting_link clear vs omit", () => {
  const omit = proposalUpdateSchema.safeParse({ title: "Hello world" });
  assert.equal(omit.success, true);
  if (omit.success) assert.equal(omit.data.meeting_link, undefined);

  const clear = proposalUpdateSchema.safeParse({ meeting_link: "" });
  assert.equal(clear.success, true);
  if (clear.success) assert.equal(clear.data.meeting_link, null);

  const bad = proposalUpdateSchema.safeParse({ meeting_link: "javascript:alert(1)" });
  assert.equal(bad.success, false);
});

test("isMissingCalendarUrlColumn detects schema errors", () => {
  assert.equal(
    isMissingCalendarUrlColumn({ message: "Could not find the 'calendar_url' column of 'platform_users' in the schema cache" }),
    true,
  );
  assert.equal(isMissingCalendarUrlColumn({ message: "permission denied" }), false);
});
