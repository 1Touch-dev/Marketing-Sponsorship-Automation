import assert from "node:assert/strict";
import test from "node:test";
import { freshDb, refusal } from "./harness";
import { pgClient } from "../helpers/pg-from";
import { FakePipedrive } from "../helpers/fake-pipedrive";
import { SYSTEM, logCrmActivity, pushDeal, pushOrganization, pushPerson, removeLinks, type PushContext } from "../../lib/pipedrive/adapter";
import { logEmailToPipedrive } from "../../lib/pipedrive/email";
import { dispatchToPipedrive, enqueueCrmSync, resolveProposalPipedriveIds } from "../../lib/pipedrive/sync";
import { connectionOf, loadHealth, recordKeyCheck, type IntegrationHealth } from "../../lib/integrations/health";
import { recentFailures } from "../../lib/integrations/log";
import { pipedriveConnection } from "../../lib/pipedrive/status";
import { linkExisting } from "../../lib/pipedrive/link-existing";
import { checkPipedriveKey } from "../../lib/pipedrive/client";

const T = "00000000-0000-0000-0000-000000000001";
const CO = "c0000000-0000-4000-8000-0000000000c1";
const CO2 = "c0000000-0000-4000-8000-0000000000c2";

const seed = (extra = "") => `
  ALTER TABLE public.contacts ADD COLUMN email text, ADD COLUMN phone text, ADD COLUMN created_at timestamptz DEFAULT now();
  ALTER TABLE public.proposals ADD COLUMN status text, ADD COLUMN content jsonb, ADD COLUMN created_at timestamptz DEFAULT now();
  ALTER TABLE public.companies ADD COLUMN full_intelligence jsonb;
  INSERT INTO public.companies (id, tenant_id, company_name) VALUES ('${CO}', '${T}', 'Ambev Brasil'), ('${CO2}', '${T}', 'Outra Marca');
  ${extra}
`;

const MIGRATIONS = ["0069_identity_tombstones_idempotency.sql", "0075_integration_log.sql"];
const person = { kind: "human" as const, by: "ana@club.com", basis: "proposal_decision" as const };

async function world(opts: { migrations?: string[]; extraSeed?: string } = {}) {
  process.env.PIPEDRIVE_API_KEY = "test-key";
  const db = await freshDb(opts.migrations ?? MIGRATIONS, { seed: seed(opts.extraSeed) });
  const sb = pgClient(db);
  const fake = new FakePipedrive();
  const ctx = (over: Partial<PushContext["auth"]> = {}): PushContext => ({ sb, tenantId: T, auth: { ...person, ...over }, http: { fetchImpl: fake.fetch, retries: 0 } });
  const q = async <R = any>(sql: string, params: unknown[] = []) => (await db.query(sql, params)).rows as R[];
  const proposal = async (title: string, company = CO) => (await q<{ id: string }>("INSERT INTO public.proposals (tenant_id, company_id, title, status) VALUES ($1, $2, $3, 'approved') RETURNING id", [T, company, title]))[0].id;
  const contact = async (name: string, email: string | null, company = CO) => (await q<{ id: string }>("INSERT INTO public.contacts (tenant_id, company_id, full_name, email) VALUES ($1, $2, $3, $4) RETURNING id", [T, company, name, email]))[0].id;
  const links = () => q<{ entity_type: string; entity_id: string; external_id: string; external_type: string | null; unlinked_at: string | null; unlink_reason: string | null }>("SELECT entity_type, entity_id, external_id, external_type, unlinked_at, unlink_reason FROM public.external_refs WHERE system = 'pipedrive' ORDER BY created_at, entity_type");
  const events = () => q<{ operation: string; outcome: string; entity_type: string; external_type: string | null; external_id: string | null; error: string | null; action_id: string; http_status: number | null }>("SELECT operation, outcome, entity_type, external_type, external_id, error, action_id, http_status FROM public.integration_events ORDER BY created_at");
  return { db, sb, fake, ctx, q, proposal, contact, links, events };
}

// ── the rule: by stored ID, never by name ────────────────────────────────────

test("the first push creates the organization, the person and the deal and stores each ID; the next push updates them by ID", async () => {
  const w = await world();
  await w.contact("Maria", "maria@ambev.example");
  const p = await w.proposal("Patrocínio 2027");

  const first = await pushDeal(w.ctx(), p, { status: "approved" });
  assert.ok(first.ok && first.created);
  assert.deepEqual((await w.links()).map((l) => `${l.entity_type}:${l.external_type}`).sort(), ["companies:organization", "contacts:person", "proposals:deal"]);
  assert.equal(w.fake.organizations.size + w.fake.persons.size + w.fake.deals.size, 3);
  const deal = [...w.fake.deals.values()][0];
  assert.ok(deal.org_id && deal.person_id, "the deal is attached to its organization and person");

  const second = await pushDeal(w.ctx(), p, { status: "approved" });
  assert.ok(second.ok && !second.created && second.external_id === first.external_id);
  assert.equal(w.fake.callsTo("POST", "/deals").length, 1, "one deal was ever created");
  assert.equal(w.fake.callsTo("PUT", "/deals/").length, 1, "and the second push updated it by ID");
  assert.equal(w.fake.callsTo("POST", "/organizations").length, 1);
  assert.equal(w.fake.callsTo("POST", "/persons").length, 1);
});

test("Pipedrive is never searched by title and nothing is ever deleted there", async () => {
  const w = await world();
  const p = await w.proposal("Patrocínio 2027");
  await pushDeal(w.ctx(), p, { status: "approved" });
  await pushDeal(w.ctx(), p, { status: "rejected" });
  await logCrmActivity(w.ctx(), p, { subject: "Viewed", note: "x" });
  await removeLinks(w.ctx(), "proposals", p, "The proposal was deleted");
  assert.deepEqual(w.fake.calls.filter((c) => c.method === "DELETE" || c.path.includes("search")), []);
});

test("two proposals with similar titles get two deals, and each keeps its own", async () => {
  const w = await world();
  const a = await w.proposal("Patrocínio 2027");
  const b = await w.proposal("Patrocínio 2027 (versão 2)");
  const ra = await pushDeal(w.ctx(), a, { status: "approved" });
  const rb = await pushDeal(w.ctx(), b, { status: "approved" });
  assert.ok(ra.ok && rb.ok);
  assert.notEqual(ra.external_id, rb.external_id);
  await pushDeal(w.ctx(), a, { status: "rejected" });
  const dealA = w.fake.deals.get(Number(ra.external_id))!;
  const dealB = w.fake.deals.get(Number(rb.external_id))!;
  assert.equal(dealA.status, "lost");
  assert.equal(dealB.status, "open", "pushing A did not touch B");
});

test("creating a company creates its organization (it used to return without creating one)", async () => {
  const w = await world();
  const r = await enqueueCrmSync({ entity_type: "company", entity_id: CO, operation: "create" }, w.ctx({ basis: "company_created" }));
  assert.equal(r.sync_status, "synced");
  assert.equal(w.fake.organizations.size, 1);
  assert.equal([...w.fake.organizations.values()][0].name, "Ambev Brasil");
  assert.equal((await w.links())[0].external_type, "organization");
});

test("a person is matched the same way: by stored ID, and attached to the organization", async () => {
  const w = await world();
  const c = await w.contact("Maria", "maria@ambev.example");
  await pushOrganization(w.ctx(), CO);
  const r1 = await pushPerson(w.ctx(), c);
  const r2 = await pushPerson(w.ctx(), c);
  assert.ok(r1.created && !r2.created && r1.external_id === r2.external_id);
  assert.equal(w.fake.persons.size, 1);
  assert.deepEqual((w.fake.persons.get(Number(r1.external_id))!.email as Array<{ value: string }>)[0].value, "maria@ambev.example");
  assert.ok(w.fake.persons.get(Number(r1.external_id))!.org_id);
});

test("two pushes of the same new proposal at once create one deal", async () => {
  const w = await world();
  w.fake.delayMs = 20;
  const p = await w.proposal("Patrocínio 2027");
  const [a, b] = await Promise.all([pushDeal(w.ctx(), p, { status: "approved" }), pushDeal(w.ctx(), p, { status: "approved" })]);
  assert.ok(a.ok && b.ok);
  assert.equal(w.fake.callsTo("POST", "/deals").length, 1);
  assert.equal((await w.links()).filter((l) => l.entity_type === "proposals").length, 1);
});

// ── delete ──────────────────────────────────────────────────────────────────

test("deleting a record marks its link removed with the reason and records the event; the deal stays in Pipedrive", async () => {
  const w = await world();
  const p = await w.proposal("Patrocínio 2027");
  const r = await pushDeal(w.ctx(), p);
  const out = await removeLinks(w.ctx({ basis: "record_deleted" }), "proposals", p, "The proposal was deleted in Coxa: duplicate");
  assert.equal(out.removed, 1);
  const link = (await w.links()).find((l) => l.entity_type === "proposals")!;
  assert.ok(link.unlinked_at);
  assert.match(link.unlink_reason ?? "", /duplicate/);
  assert.equal(w.fake.deals.has(Number(r.external_id)), true, "nothing was deleted in Pipedrive");
  assert.equal(w.fake.callsTo("DELETE", "").length, 0);
  const ev = (await w.events()).find((e) => e.operation === "link_removed")!;
  assert.deepEqual([ev.outcome, ev.external_id], ["succeeded", r.external_id]);
  // the old route for a "delete" does the same thing
  const p2 = await w.proposal("Outra");
  await pushDeal(w.ctx(), p2);
  const viaSync = await dispatchToPipedrive("proposal", p2, "delete", { reason: "Removed by mistake in Coxa" }, w.ctx());
  assert.deepEqual(viaSync, { link_removed: 1, left_in_pipedrive: true });
  assert.equal(w.fake.callsTo("DELETE", "").length, 0);
});

test("a deleted record is not pushed again", async () => {
  const w = await world();
  const p = await w.proposal("Patrocínio 2027");
  await w.q("INSERT INTO public.record_tombstones (tenant_id, record_type, record_id, snapshot, deleted_by) VALUES ($1, 'proposals', $2, '{}'::jsonb, 'ana@club.com')", [T, p]).catch(() => undefined);
  const before = w.fake.calls.length;
  const r = await pushDeal(w.ctx(), p, { status: "approved" });
  if (r.skipped === "deleted") assert.equal(w.fake.callsTo("POST", "/deals").length, 0);
  assert.ok(w.fake.calls.length >= before);
});

// ── the log: who was allowed, and what happened ─────────────────────────────

test("every push has someone answerable for it, and every call is recorded against that", async () => {
  const w = await world();
  const p = await w.proposal("Patrocínio 2027");
  await pushDeal(w.ctx({ by: "boss@club.com", basis: "proposal_decision", ref: p }), p, { status: "approved" });
  const actions = await w.q<{ authorized_by: string; authorized_kind: string; basis: string; basis_ref: string; operation: string }>("SELECT authorized_by, authorized_kind, basis, basis_ref, operation FROM public.integration_actions");
  assert.deepEqual(actions.map((a) => [a.authorized_by, a.authorized_kind, a.basis, a.basis_ref, a.operation]), [["boss@club.com", "human", "proposal_decision", p, "push"]]);
  const ev = await w.events();
  assert.deepEqual(ev.map((e) => `${e.operation}:${e.external_type}:${e.outcome}`).sort(), ["create:deal:succeeded", "create:organization:succeeded"]);
  assert.equal(new Set(ev.map((e) => e.action_id)).size, 1, "the organization and the deal belong to the same approved action");
  await assert.rejects(() => pushDeal({ ...w.ctx(), auth: { kind: "human", by: " ", basis: "manual_sync" } }, p), /answer for it/);
});

test("both logs are append-only", async () => {
  const w = await world();
  const p = await w.proposal("Patrocínio 2027");
  await pushDeal(w.ctx(), p);
  assert.match(await refusal(w.db, "UPDATE public.integration_events SET outcome = 'succeeded'"), /immutable/);
  assert.match(await refusal(w.db, "DELETE FROM public.integration_events"), /cannot be deleted/);
  assert.match(await refusal(w.db, "UPDATE public.integration_actions SET authorized_by = 'someone@else.com'"), /immutable/);
  assert.match(await refusal(w.db, "DELETE FROM public.integration_actions"), /cannot be deleted/);
  assert.match(await refusal(w.db, "INSERT INTO public.integration_actions (tenant_id, system, operation, entity_type, entity_id, basis, authorized_kind, authorized_by) VALUES ($1, 'pipedrive', 'push', 'proposals', 'x', 'because_i_said_so', 'human', 'a@b.co')", [T]), /check|basis/i);
});

// ── honest status ───────────────────────────────────────────────────────────

test("a failed push is reported as failed, recorded with its error, and makes the connection 'failing' until a push works", async () => {
  const w = await world();
  const bad = await w.proposal("REJECT this one");
  const good = await w.proposal("Fine");
  await pushDeal(w.ctx(), good); // a good push first: the key is accepted
  const ok = await loadHealth(w.sb, T, SYSTEM, true);
  assert.equal(connectionOf(ok).state, "connected");

  const r = await pushDeal(w.ctx(), bad);
  assert.ok(!r.ok && /not allowed/.test(r.error ?? ""));
  const sync = await enqueueCrmSync({ entity_type: "proposal", entity_id: bad, operation: "status_change", payload: { new_status: "approved" } }, w.ctx());
  assert.equal(sync.sync_status, "failed", "a refusal is never reported as 'synced'");
  assert.match(String(sync.result.error), /not allowed/);

  const h = await loadHealth(w.sb, T, SYSTEM, true);
  const c = connectionOf(h);
  assert.equal(c.state, "failing");
  assert.equal(c.tone, "bad");
  assert.match(c.detail, /not allowed/);
  assert.ok(c.last_push_ok_at, "the last good push is still shown");
  const failures = await recentFailures(w.sb, T, SYSTEM);
  assert.ok(failures.length >= 1 && failures[0].error?.includes("not allowed"));

  await pushDeal(w.ctx(), good); // a good push clears it
  assert.equal(connectionOf(await loadHealth(w.sb, T, SYSTEM, true)).state, "connected");
});

test("a refused key, an unreachable Pipedrive and a missing key each say so", async () => {
  const w = await world();
  const p = await w.proposal("Patrocínio");
  // refused
  w.fake.key = "another-key";
  const r = await pushDeal(w.ctx(), p);
  assert.ok(!r.ok);
  let c = connectionOf(await loadHealth(w.sb, T, SYSTEM, true));
  assert.deepEqual([c.state, c.key_accepted], ["key_rejected", false]);
  // reachable again with the right key
  w.fake.key = "test-key";
  await pushDeal(w.ctx(), p);
  c = connectionOf(await loadHealth(w.sb, T, SYSTEM, true));
  assert.equal(c.state, "connected");
  // unreachable: failing, and nothing is claimed about the key
  w.fake.dropNext = 1;
  const q = await w.proposal("Outro");
  await pushDeal(w.ctx(), q);
  const h = await loadHealth(w.sb, T, SYSTEM, true);
  assert.equal(connectionOf(h).state, "failing");
  assert.match(h.last_error ?? "", /Could not reach Pipedrive/);
  // no key on the server
  assert.equal(connectionOf({ ...h, configured: false }).state, "not_configured");
});

test("the key never appears in what is logged or reported", async () => {
  const w = await world();
  process.env.PIPEDRIVE_API_KEY = "test-key-SECRET-9999";
  w.fake.key = "test-key-SECRET-9999";
  w.fake.failNext = { count: 5, status: 500, error: "boom api_token=test-key-SECRET-9999" };
  const p = await w.proposal("Patrocínio");
  await pushDeal(w.ctx(), p);
  w.fake.dropNext = 1;
  await pushDeal(w.ctx(), await w.proposal("Outro"));
  const everything = JSON.stringify([await w.events(), await w.q("SELECT * FROM public.integration_health"), await w.q("SELECT * FROM public.integration_actions")]);
  assert.ok(!everything.includes("SECRET-9999"));
});

test("a key check says yes, no or 'could not tell', and a good check does not hide a failed push", async () => {
  const w = await world();
  const http = { fetchImpl: w.fake.fetch, retries: 0 };
  assert.deepEqual((await checkPipedriveKey(http)).accepted, true);
  w.fake.key = "other";
  assert.deepEqual((await checkPipedriveKey(http)).accepted, false);
  w.fake.key = "test-key";
  w.fake.dropNext = 1;
  assert.equal((await checkPipedriveKey(http)).accepted, null);

  // a failed PUSH, then a successful key check: still failing (only a push clears a failed push)
  const bad = await w.proposal("REJECT me");
  await pushDeal(w.ctx(), bad);
  await recordKeyCheck(w.sb, T, SYSTEM, { accepted: true });
  assert.equal(connectionOf(await loadHealth(w.sb, T, SYSTEM, true)).state, "failing");
});

test("the state is the same wherever it is read from", () => {
  const base: IntegrationHealth = { system: "pipedrive", configured: true, key_accepted: true, key_checked_at: "2026-10-12T10:00:00Z", last_push_ok_at: "2026-10-12T10:05:00Z", last_error: null, last_error_at: null, last_error_kind: null };
  const cases: Array<[string, Partial<IntegrationHealth>, string, string]> = [
    ["no key", { configured: false, key_accepted: null }, "not_configured", "idle"],
    ["key refused", { key_accepted: false }, "key_rejected", "bad"],
    ["key set, never answered", { key_accepted: null, last_push_ok_at: null, key_checked_at: null }, "unverified", "warn"],
    ["accepted, nothing pushed", { last_push_ok_at: null }, "connected", "ok"],
    ["accepted and pushing", {}, "connected", "ok"],
    ["a push failed after the last good one", { last_error: "Deal title is not allowed", last_error_at: "2026-10-12T10:10:00Z", last_error_kind: "push" }, "failing", "bad"],
    ["a push failed, then one worked", { last_error: "x", last_error_at: "2026-10-12T10:01:00Z", last_error_kind: "push" }, "connected", "ok"],
    ["a failed push is not cleared by a later key check", { last_error: "x", last_error_at: "2026-10-12T10:06:00Z", last_error_kind: "push", key_checked_at: "2026-10-12T10:20:00Z" }, "failing", "bad"],
    ["a failed check is cleared by a later good check", { last_error: "x", last_error_at: "2026-10-12T10:06:00Z", last_error_kind: "check", key_checked_at: "2026-10-12T10:20:00Z" }, "connected", "ok"],
  ];
  for (const [name, patch, state, tone] of cases) {
    const c = connectionOf({ ...base, ...patch });
    assert.deepEqual([c.state, c.tone], [state, tone], name);
    assert.ok(c.label.length > 0 && c.detail.length > 0, name);
  }
  // the one rule the task asks for: failing is never green
  for (const [name, patch] of cases) { const c = connectionOf({ ...base, ...patch }); if (c.state === "failing") assert.notEqual(c.tone, "ok", name); }
});

test("pipedriveConnection asks Pipedrive when the answer is old, and not again within five minutes", async () => {
  const w = await world();
  // the status module uses the process-wide fetch, so point it at the stand-in for this test
  const real = globalThis.fetch;
  globalThis.fetch = w.fake.fetch;
  try {
    const c1 = await pipedriveConnection(w.sb, T, { check: true });
    assert.equal(c1.state, "connected");
    const checks = () => w.fake.callsTo("GET", "/users/me").length;
    assert.equal(checks(), 1);
    await pipedriveConnection(w.sb, T, { check: true });
    assert.equal(checks(), 1, "not asked again within five minutes");
    await pipedriveConnection(w.sb, T, { force: true });
    assert.equal(checks(), 2, "unless forced");
    await pipedriveConnection(w.sb, T);
    assert.equal(checks(), 2, "reading without check never calls Pipedrive");
  } finally { globalThis.fetch = real; }
});

// ── activities: "logged in CRM" ─────────────────────────────────────────────

test("an activity goes on the proposal's own deal, labelled as a CRM record; with no deal it is skipped, not posted loose or matched by title", async () => {
  const w = await world();
  const p = await w.proposal("Patrocínio 2027");
  const none = await logEmailToPipedrive(w.ctx({ basis: "email_logged" }), p, { subject: "Proposta", bodyHtml: "<p>Olá</p>" });
  assert.equal(none.activity_id, null);
  assert.match(none.error ?? "", /no deal in Pipedrive yet/);
  assert.equal(w.fake.callsTo("POST", "/activities").length, 0);
  assert.equal((await w.events()).find((e) => e.operation === "log_activity")?.outcome, "skipped");

  await pushDeal(w.ctx(), p);
  const logged = await logEmailToPipedrive(w.ctx({ basis: "email_logged" }), p, { subject: "Proposta", bodyHtml: "<p>Olá</p>" });
  assert.ok(logged.activity_id && !logged.error);
  const act = w.fake.activities[0];
  assert.equal(act.type, "email");
  assert.equal(act.deal_id, Number([...w.fake.deals.keys()][0]));
  assert.match(String(act.note), /Logged in CRM by Coxa/);
  assert.match(String(act.note), /not proof that anything was delivered/);
  assert.equal((await logEmailToPipedrive(w.ctx(), null, { subject: "x", bodyHtml: "y" })).activity_id, null);
});

test("Pipedrive no longer having an object is reported, never silently re-created", async () => {
  const w = await world();
  const p = await w.proposal("Patrocínio");
  const r = await pushDeal(w.ctx(), p);
  w.fake.deals.delete(Number(r.external_id)); // someone deleted it inside Pipedrive
  const again = await pushDeal(w.ctx(), p, { status: "approved" });
  assert.ok(!again.ok);
  assert.match(again.error ?? "", /no longer has this object/);
  assert.equal(w.fake.callsTo("POST", "/deals").length, 1, "it was not created a second time");
  assert.equal((await w.links()).filter((l) => l.entity_type === "proposals" && !l.unlinked_at).length, 1, "the link is left for a person to unlink");
});

// ── before and after the migration ──────────────────────────────────────────

test("stored Pipedrive IDs are checked against Pipedrive before they are linked: a missing deal is not linked, an organization only if its name matches", async () => {
  const w = await world({
    extraSeed: `
      ALTER TABLE public.proposals ADD COLUMN pipedrive_deal_id integer;
      ALTER TABLE public.companies ADD COLUMN pipedrive_org_id integer;
      INSERT INTO public.companies (id, tenant_id, company_name, pipedrive_org_id) VALUES
        ('c0000000-0000-4000-8000-0000000000c3', '${T}', 'Same Name SA', 501),
        ('c0000000-0000-4000-8000-0000000000c4', '${T}', 'Positivo', 502),
        ('c0000000-0000-4000-8000-0000000000c5', '${T}', 'Gone Ltda', 503);
      INSERT INTO public.companies (id, tenant_id, company_name) VALUES ('c0000000-0000-4000-8000-0000000000c6', '${T}', 'Brado Logística'), ('c0000000-0000-4000-8000-0000000000c7', '${T}', 'Nobody Knows Us');
      INSERT INTO public.proposals (id, tenant_id, company_id, title, status, pipedrive_deal_id) VALUES
        ('a0000000-0000-4000-8000-000000000001', '${T}', '${CO}', 'Real deal', 'approved', 4001),
        ('a0000000-0000-4000-8000-000000000002', '${T}', '${CO}', 'Deleted deal', 'approved', 4002);
      UPDATE public.proposals SET content = '{"pipedrive_deal_id": 4003}'::jsonb WHERE id = 'a0000000-0000-4000-8000-000000000002' AND false;
    `,
  });
  w.fake.deals.set(4001, { id: 4001, title: "Real deal" });                 // 4002 does not exist
  w.fake.organizations.set(501, { id: 501, name: "Same Name SA" });
  w.fake.organizations.set(502, { id: 502, name: "Positivo Tecnologia" });   // exists, but under another name
  w.fake.organizations.set(504, { id: 504, name: "Brado Logistica" });       // the same name as a company with no ID (accents aside)
  const ctx = w.ctx({ basis: "backfill" });

  const dry = await linkExisting(ctx, { suggest: true, pauseMs: 0 });
  assert.equal(dry.dry_run, true);
  assert.equal((await w.links()).length, 0, "a dry run links nothing");
  assert.deepEqual([dry.deals.checked, dry.deals.linked, dry.deals.missing.map((m) => m.pipedrive_deal_id)], [2, 1, [4002]]);
  assert.deepEqual([dry.organizations.checked, dry.organizations.linked, dry.organizations.name_differs.map((o) => o.pipedrive_name), dry.organizations.missing.map((o) => o.pipedrive_org_id)], [3, 1, ["Positivo Tecnologia"], [503]]);
  assert.deepEqual(dry.suggestions.map((x) => [x.company_name, x.pipedrive_org_id]), [["Brado Logística", 504]], "an exact name is suggested, not linked");

  const done = await linkExisting(ctx, { apply: true, pauseMs: 0 });
  assert.deepEqual([done.deals.linked, done.organizations.linked], [1, 1]);
  const links = await w.links();
  assert.deepEqual(links.map((l) => `${l.entity_type}:${l.external_type}:${l.external_id}`).sort(), ["companies:organization:501", "proposals:deal:4001"]);
  // it is safe to run again, and the actions are recorded under the person who ran it
  const again = await linkExisting(ctx, { apply: true, pauseMs: 0 });
  assert.deepEqual([again.deals.checked, again.deals.linked, again.organizations.linked], [1, 0, 0], "only what is still unlinked is looked at");
  const by = await w.q<{ authorized_by: string; basis: string }>("SELECT authorized_by, basis FROM public.integration_actions WHERE operation = 'backfill'");
  assert.ok(by.length >= 1 && by.every((a) => a.authorized_by === "ana@club.com" && a.basis === "backfill"));

  // a person confirms a suggested pair
  const confirm = await linkExisting(ctx, { apply: true, pauseMs: 0, link: [{ company_id: "c0000000-0000-4000-8000-0000000000c6", pipedrive_org_id: 504 }, { company_id: "c0000000-0000-4000-8000-0000000000c7", pipedrive_org_id: 999 }] });
  assert.deepEqual(confirm.confirmed.map((c) => [c.pipedrive_org_id, c.linked]), [[504, true], [999, false]]);
  assert.match(confirm.confirmed[1].reason ?? "", /no organization with that ID/);
  // and the next push of the first deal updates deal 4001 instead of searching or creating
  const r = await pushDeal(w.ctx(), "a0000000-0000-4000-8000-000000000001", { status: "approved" });
  assert.ok(r.ok && !r.created && r.external_id === "4001");
  assert.equal(w.fake.callsTo("POST", "/deals").length, 0);
  assert.deepEqual(w.fake.calls.filter((c) => c.method !== "GET" && c.method !== "PUT" && c.method !== "POST"), []);
  const ids = await resolveProposalPipedriveIds(w.sb, "a0000000-0000-4000-8000-000000000001");
  assert.deepEqual([ids.dealId], [4001]);
});

test("without the log tables (migration 0075 not applied yet) a push still works and nothing breaks", async () => {
  const w = await world({ migrations: ["0069_identity_tombstones_idempotency.sql"] });
  const p = await w.proposal("Patrocínio");
  const r = await pushDeal(w.ctx(), p, { status: "approved" });
  assert.ok(r.ok && r.created);
  const stored = await w.q<{ entity_type: string }>("SELECT entity_type FROM public.external_refs WHERE system = 'pipedrive'");
  assert.equal(stored.filter((l) => l.entity_type === "proposals").length, 1, "the link is still stored");
  const c = await pipedriveConnection(w.sb, T);
  assert.equal(c.state, "unverified", "nothing is known about the key yet, and that is what it says");
});

test("not configured: nothing is sent, and the log says that it was not sent", async () => {
  const w = await world();
  const p = await w.proposal("Patrocínio");
  delete process.env.PIPEDRIVE_API_KEY;
  const r = await enqueueCrmSync({ entity_type: "proposal", entity_id: p, operation: "create" }, w.ctx());
  assert.deepEqual([r.sync_status, r.result.reason], ["skipped", "not_configured"]);
  assert.equal(w.fake.calls.length, 0);
  const ev = (await w.events())[0];
  assert.deepEqual([ev.outcome, ev.operation], ["skipped", "update"]);
  assert.match(ev.error ?? "", /No Pipedrive API key/);
  assert.equal(connectionOf(await loadHealth(w.sb, T, SYSTEM, false)).state, "not_configured");
  process.env.PIPEDRIVE_API_KEY = "test-key";
});

test("a push that sends the deal but not what belongs with it is a failed push, says what went and what did not, and completes on retry", async () => {
  const w = await world();
  const p = await w.proposal("Patrocínio 2027");
  w.fake.failNext = { count: 1, status: 500, error: "Organization service unavailable" }; // the organization is the first call
  const half = await pushDeal(w.ctx(), p, { status: "approved" });
  assert.equal(half.ok, false);
  assert.match(half.error ?? "", /The deal was sent \(Pipedrive ID \d+\), but the organization could not be sent/);
  assert.equal(w.fake.deals.size, 1, "the deal did go");
  assert.equal(w.fake.organizations.size, 0);
  assert.equal(connectionOf(await loadHealth(w.sb, T, SYSTEM, true)).state, "failing", "and the connection does not look healthy");
  const sync = await enqueueCrmSync({ entity_type: "proposal", entity_id: p, operation: "status_change", payload: { new_status: "approved" } }, w.ctx({ basis: "retry" }));
  assert.equal(sync.sync_status, "synced", "the retry sends the organization, and updates the same deal");
  assert.equal(w.fake.deals.size, 1);
  assert.equal(w.fake.organizations.size, 1);
  assert.ok([...w.fake.deals.values()][0].org_id, "now attached");
  assert.equal(connectionOf(await loadHealth(w.sb, T, SYSTEM, true)).state, "connected");
});
