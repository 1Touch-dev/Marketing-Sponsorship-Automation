import assert from "node:assert/strict";
import test from "node:test";
import { acceptInbound, ownerOf } from "../lib/sync/field-ownership";
import { linkExternal, listExternal, resolveExternal, unlinkExternal } from "../lib/sync/external-refs";
import { db, type Tables } from "./helpers/fake-db";

const T = "t";

test("an outside system may write only the fields it is given, and never ids, stage or timestamps", () => {
  const r = acceptInbound("companies", "pipedrive", { contact_name: "Bea", contact_email: "bea@x.com", company_name: "Hacked", stage: "qualified", id: "other", tenant_id: "t2", updated_at: "now" });
  assert.deepEqual(r.accepted, { contact_name: "Bea", contact_email: "bea@x.com" });
  const why = Object.fromEntries(r.rejected.map((x) => [x.field, x.reason]));
  assert.match(why.company_name, /owned by the platform; pipedrive may write only contact_name, contact_email, contact_phone/);
  for (const f of ["stage", "id", "tenant_id", "updated_at"]) assert.match(why[f], /set by the platform and is never written from outside/, f);
});

test("a record type nobody may write from outside, and a system that is not allowed, are refused with the reason", () => {
  assert.deepEqual(acceptInbound("proposals", "pipedrive", { title: "x" }).accepted, {});
  assert.match(acceptInbound("proposals", "pipedrive", { title: "x" }).rejected[0].reason, /owns every field of proposals/);
  assert.match(acceptInbound("companies", "salesforce", { contact_name: "x" }).rejected[0].reason, /salesforce may not write companies/);
  assert.deepEqual(acceptInbound("companies", "twenty", {}), { accepted: {}, rejected: [] });
  assert.deepEqual([ownerOf("companies", "contact_email"), ownerOf("companies", "company_name"), ownerOf("companies", "id"), ownerOf("proposals", "title")], ["external", "platform", "platform", "platform"]);
});

const world = (over: Tables = {}): Tables => ({ external_refs: [], record_tombstones: [], ...over });
const store = (t: Tables, missing = false) => db(t, { unique: {}, missing: missing ? ["external_refs"] : [] });
const link = (sb: any, over: Record<string, string> = {}) => linkExternal(sb, T, { entityType: "companies", entityId: "co1", system: "pipedrive", externalId: "ORG-1", actor: "sync", ...over });

test("a record is linked to an outside ID once, and repeating the link changes nothing", async () => {
  const t = world();
  const sb = store(t);
  const first = await link(sb);
  assert.ok(first.ok && first.value.created);
  const again = await link(sb);
  assert.ok(again.ok && !again.value.created && again.value.id === first.value.id);
  assert.equal(t.external_refs.length, 1);
});

test("a link is never quietly re-pointed: another outside ID for the record, or another record for the outside ID, is refused", async () => {
  const t = world();
  const sb = store(t);
  await link(sb);
  const other = await link(sb, { externalId: "ORG-2" });
  assert.ok(!other.ok && other.status === 409 && /already linked to pipedrive ID ORG-1/.test(other.error));
  const stolen = await link(sb, { entityId: "co2" });
  assert.ok(!stolen.ok && stolen.status === 409 && /already belongs to another companies record/.test(stolen.error));
  assert.equal(t.external_refs.length, 1);
  assert.ok((await link(sb, { system: "twenty" })).ok, "another system is separate");
});

test("a deleted record cannot be linked, and a link to a deleted record is reported as deleted so a sync does not recreate it", async () => {
  const t = world({ record_tombstones: [{ id: "tb1", tenant_id: T, record_type: "companies", record_id: "co9", restored_at: null }] });
  const sb = store(t);
  const blocked = await link(sb, { entityId: "co9" });
  assert.ok(!blocked.ok && /was deleted/.test(blocked.error));
  t.external_refs.push({ id: "r1", tenant_id: T, entity_type: "companies", entity_id: "co9", system: "pipedrive", external_id: "ORG-9", unlinked_at: null });
  const res = await resolveExternal(sb, T, "pipedrive", "companies", "ORG-9");
  assert.ok(res.ok && res.value?.deleted === true && res.value.entity_id === "co9");
  t.record_tombstones[0].restored_at = "2026-10-08";
  assert.equal(((await resolveExternal(sb, T, "pipedrive", "companies", "ORG-9")) as any).value.deleted, false, "once the deletion is undone it is a live record again");
  const none = await resolveExternal(sb, T, "pipedrive", "companies", "NOPE");
  assert.ok(none.ok && none.value === null);
});

test("unlinking needs a reason, keeps the link on record, and frees the outside ID", async () => {
  const t = world();
  const sb = store(t);
  const made = await link(sb);
  const id = (made as any).value.id;
  assert.equal(((await unlinkExternal(sb, T, id, "no", "ana@club.com")) as any).status, 400);
  assert.equal(((await unlinkExternal(sb, T, "ghost", "Merged into another organization", "ana@club.com")) as any).status, 404);
  assert.ok((await unlinkExternal(sb, T, id, "Merged into another organization", "ana@club.com")).ok);
  assert.equal(t.external_refs.length, 1, "still on record");
  assert.equal(((await unlinkExternal(sb, T, id, "Merged into another organization", "ana@club.com")) as any).status, 409);
  assert.deepEqual(((await listExternal(sb, T, "companies", "co1")) as any).value, []);
  assert.equal(((await listExternal(sb, T, "companies", "co1", true)) as any).value.length, 1);
});

test("input and set-up problems are named", async () => {
  const sb = store(world());
  assert.equal(((await link(sb, { actor: "" })) as any).status, 403);
  assert.equal(((await link(sb, { externalId: " " })) as any).status, 400);
  const pre = await link(store(world(), true));
  assert.ok(!pre.ok && pre.status === 503 && /migration 0069/.test(pre.error));
});
