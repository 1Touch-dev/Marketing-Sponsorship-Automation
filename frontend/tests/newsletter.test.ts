import assert from "node:assert/strict";
import test from "node:test";
import { newsletterFieldError } from "../lib/newsletter/field-error";
import {
  parseNewsletterSettingsPut,
  rowToSettings,
  settingsToRow,
  DEFAULT_NEWSLETTER_SETTINGS,
} from "../lib/newsletter/settings";

test("subject and body errors stay hidden until the field is shown", () => {
  assert.equal(newsletterFieldError("subject", "", false), null);
  assert.equal(newsletterFieldError("body", "  ", false), null);
});

test("empty subject and body use the pack strings once shown", () => {
  assert.equal(newsletterFieldError("subject", "", true), "Subject is required");
  assert.equal(newsletterFieldError("subject", "   ", true), "Subject is required");
  assert.equal(newsletterFieldError("body", "", true), "Email body is required");
  assert.equal(newsletterFieldError("subject", "QA E2E Test newsletter", true), null);
  assert.equal(newsletterFieldError("body", "<p>hi</p>", true), null);
});

test("settings PUT rejects empty header title and unknown weekday", () => {
  const noTitle = parseNewsletterSettingsPut({
    subject: "Coritiba FC — Oportunidade de Patrocínio",
    send_day: "Tuesday",
    send_hour: "09:00",
    blocks: { header: { title: "  ", logo: true } },
  });
  assert.equal(noTitle.ok, false);
  if (!noTitle.ok) assert.match(noTitle.error, /header title/i);

  const badDay = parseNewsletterSettingsPut({
    send_day: "Funday",
    send_hour: "09:00",
    blocks: { header: { title: "Coritiba FC — Sponsorship Update QA" } },
  });
  assert.equal(badDay.ok, false);
  if (!badDay.ok) assert.match(badDay.error, /send day/i);
});

test("header title and Tuesday 09:00 round-trip through the row", () => {
  const parsed = parseNewsletterSettingsPut({
    subject: DEFAULT_NEWSLETTER_SETTINGS.subject,
    send_day: "Tuesday",
    send_hour: "09:00",
    industries: [],
    blocks: {
      ...DEFAULT_NEWSLETTER_SETTINGS.blocks,
      header: { logo: true, title: "Coritiba FC — Sponsorship Update QA" },
    },
  });
  assert.equal(parsed.ok, true);
  if (!parsed.ok) return;
  assert.equal(parsed.data.blocks.header.title, "Coritiba FC — Sponsorship Update QA");
  assert.equal(parsed.data.send_day, "Tuesday");
  assert.equal(parsed.data.send_hour, "09:00");

  const row = settingsToRow(parsed.data);
  assert.equal(row.send_day, 2);
  assert.equal(row.send_hour, 9);
  assert.equal(row.config.header.title, "Coritiba FC — Sponsorship Update QA");

  const back = rowToSettings({
    subject_template: row.subject_template,
    send_day: row.send_day,
    send_hour: row.send_hour,
    industry_filter: row.industry_filter,
    config: row.config,
  });
  assert.equal(back.blocks.header.title, "Coritiba FC — Sponsorship Update QA");
  assert.equal(back.send_day, "Tuesday");
  assert.equal(back.send_hour, "09:00");
});
