import assert from "node:assert/strict";
import test from "node:test";
import { isValidContactEmail, syncPrimaryContactFromCompany } from "../lib/companies/sync-primary-contact";
import { db } from "./helpers/fake-db";

const COMPANY = "11111111-1111-1111-1111-111111111111";
const TENANT = "22222222-2222-2222-2222-222222222222";

test("empty or invalid email is not a contact email", () => {
  assert.equal(isValidContactEmail(null), false);
  assert.equal(isValidContactEmail(""), false);
  assert.equal(isValidContactEmail("   "), false);
  assert.equal(isValidContactEmail("not-an-email"), false);
  assert.equal(isValidContactEmail("qa@example.com"), true);
});

test("no email means no contacts upsert — the company can still be saved", async () => {
  const sb = db({ contacts: [] });
  const none = await syncPrimaryContactFromCompany(sb, {
    tenantId: TENANT,
    companyId: COMPANY,
    fullName: "QA Alpha Contact",
    email: null,
    phone: "+55 41 99999-0000",
  });
  assert.deepEqual(none, { synced: false });
  assert.equal(sb.tables.contacts.length, 0);
  assert.equal(sb.calls.filter((c) => c.table === "contacts").length, 0);
});

test("a valid email upserts a contacts row on company_id,email with source manual", async () => {
  const sb = db({ contacts: [] }, { unique: { contacts: ["company_id", "email"] } });
  const ok = await syncPrimaryContactFromCompany(sb, {
    tenantId: TENANT,
    companyId: COMPANY,
    fullName: "QA Alpha Contact",
    email: "QA.Alpha@Example.com",
    phone: "+55 41 99999-0000",
  });
  assert.deepEqual(ok, { synced: true });
  assert.equal(sb.tables.contacts.length, 1);
  assert.deepEqual(sb.tables.contacts[0], {
    id: sb.tables.contacts[0].id,
    created_at: sb.tables.contacts[0].created_at,
    project_id: null,
    tenant_id: TENANT,
    company_id: COMPANY,
    email: "qa.alpha@example.com",
    full_name: "QA Alpha Contact",
    phone: "+55 41 99999-0000",
    source: "manual",
  });
});

test("a missing contacts table does not throw — company create still succeeds", async () => {
  const sb = db({}, { missing: ["contacts"] });
  const res = await syncPrimaryContactFromCompany(sb, {
    tenantId: TENANT,
    companyId: COMPANY,
    fullName: "QA Alpha Contact",
    email: "qa@example.com",
    phone: null,
  });
  assert.deepEqual(res, { synced: false });
});
