import assert from "node:assert/strict";
import test from "node:test";
import { freshDb, ALL_MIGRATIONS } from "./harness";
import { pgClient } from "../helpers/pg-from";
import { resolvePortalSession } from "../../lib/portal/guard";
import { createSessionToken } from "../../lib/portal/session";
import { portalContracts, portalDelivery, portalProposal, portalProposals, portalRecap, portalRecaps } from "../../lib/portal/data";
import { internalKeys, sponsorContent, sponsorRecap } from "../../lib/portal/safe-view";

process.env.INTERNAL_API_SECRET ||= "test-secret-for-portal-cookies";

const T1 = "00000000-0000-0000-0000-000000000001";
const T2 = "00000000-0000-0000-0000-000000000002";
const A = "a0000000-0000-4000-8000-00000000000a";
const B = "b0000000-0000-4000-8000-00000000000b";
const C = "c0000000-0000-4000-8000-00000000000c"; // a sponsor of a DIFFERENT club who happens to share a contact email with A

const seed = `
  INSERT INTO public.tenants (id, name) VALUES ('${T2}', 'Second club');
  ALTER TABLE public.companies ADD COLUMN logo_url text, ADD COLUMN industry text;
  ALTER TABLE public.contacts ADD COLUMN email text;
  ALTER TABLE public.proposals ADD COLUMN status text, ADD COLUMN version int DEFAULT 1, ADD COLUMN created_at timestamptz DEFAULT now(), ADD COLUMN approved_at timestamptz,
    ADD COLUMN share_token text, ADD COLUMN expires_at timestamptz, ADD COLUMN content jsonb, ADD COLUMN pricing_tiers jsonb, ADD COLUMN strategy_variants jsonb;
  CREATE TABLE public.proposal_packages (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), proposal_id uuid, name text, description text, price_brl numeric, benefits jsonb, inventory_items jsonb, sort_order int DEFAULT 0, active boolean DEFAULT true, internal_margin numeric);
  ALTER TABLE public.contracts ADD COLUMN contract_number text, ADD COLUMN deal_type text, ADD COLUMN start_date date, ADD COLUMN end_date date, ADD COLUMN total_value_brl numeric, ADD COLUMN signature_status text, ADD COLUMN internal_notes text;
  ALTER TABLE public.obligations ADD COLUMN contract_id uuid, ADD COLUMN project_id uuid, ADD COLUMN allocation_id uuid, ADD COLUMN source_key text, ADD COLUMN kind text, ADD COLUMN description text,
    ADD COLUMN quantity int, ADD COLUMN unit text, ADD COLUMN due_date date, ADD COLUMN due_basis text, ADD COLUMN owner_email text, ADD COLUMN owner_basis text, ADD COLUMN created_by text,
    ADD COLUMN created_at timestamptz DEFAULT now(), ADD COLUMN updated_at timestamptz DEFAULT now();
  CREATE TABLE public.obligation_events (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL, obligation_id uuid NOT NULL, event_type text NOT NULL, evidence_kind text, evidence_ref text, note text, reason text, actor_email text NOT NULL, created_at timestamptz DEFAULT clock_timestamp());
  CREATE TABLE public.sponsor_recaps (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL, company_id uuid NOT NULL, contract_id uuid, version int, status text, gap_count int, blocking_gap_count int, gaps_acknowledged boolean,
    acknowledgement text, issued_by text, issued_at timestamptz DEFAULT now(), checksum text, period_start date, period_end date, content jsonb);
  INSERT INTO public.companies (id, tenant_id, company_name) VALUES ('${A}', '${T1}', 'Sponsor A'), ('${B}', '${T1}', 'Sponsor B'), ('${C}', '${T2}', 'Sponsor C');
  INSERT INTO public.contacts (tenant_id, company_id, full_name, email) VALUES ('${T1}', '${A}', 'Ana', 'Ana@a.com'), ('${T1}', '${B}', 'Bob', 'bob@b.com'), ('${T2}', '${C}', 'Ana at C', 'ana@a.com');
`;

const content = (extra: Record<string, unknown> = {}) => JSON.stringify({
  title: "Season sponsorship", executive_summary: "Summary", deliverables: ["LED"], cta: "Let's go",
  execution_brief: { total_estimated_cost_brl: "R$ 480.000", items: [{ estimated_cost_brl: "R$ 120.000" }] },
  internal_margin_note: "we can drop to 40% margin", fulfillment_tasks: [{ id: "t1", title: "Install LED", status: "done", completed_at: null, assigned_to: "staff@club.com", cost: 900 }],
  document_bundle: [{ url: "https://x/y.pdf", path: "a/y.pdf", name: "Deck", size: 10, uploaded_by: "staff@club.com" }], ...extra,
});

async function world() {
  const db = await freshDb(ALL_MIGRATIONS, { seed });
  const p = async (company: string, tenant: string, title: string, status: string, extra = "") =>
    (await db.query(`INSERT INTO public.proposals (tenant_id, company_id, title, status, content, pricing_tiers, strategy_variants, share_token) VALUES ($1, $2, $3, $4, $5::jsonb, '[{"tier":"mid","label":"Mid","price_range":"R$ 100k","activations":["a"],"deliverables":["d"],"internal_cost":"R$ 60k","margin_pct":40}]'::jsonb, '[]'::jsonb, $6) RETURNING id`, [tenant, company, title, status, content(), `tok-${title.replace(/\W/g, "")}-0000`] as never)).rows[0] as any;
  const props = {
    approvedA: await p(A, T1, "A approved", "approved"), sentA: await p(A, T1, "A sent", "sent"), draftA: await p(A, T1, "A draft", "draft"), reviewA: await p(A, T1, "A review", "under_review"), rejectedA: await p(A, T1, "A rejected", "rejected"),
    approvedB: await p(B, T1, "B approved", "approved"), approvedC: await p(C, T2, "C approved", "approved"),
  };
  await db.query("INSERT INTO public.proposal_packages (proposal_id, name, price_brl, benefits, internal_margin) VALUES ($1, 'Gold', 250000, '[\"x\"]'::jsonb, 0.4)", [props.approvedA.id]);
  const k = async (company: string, tenant: string, number: string, status: string) =>
    (await db.query("INSERT INTO public.contracts (tenant_id, company_id, title, status, contract_number, deal_type, start_date, end_date, total_value_brl, signature_status, internal_notes) VALUES ($1, $2, $3, $4, $5, 'sponsorship', '2026-11-01', '2027-10-31', 500000, 'signed', 'we undercut the rival here') RETURNING id", [tenant, company, `Contract ${number}`, status, number])).rows[0] as any;
  const ks = { aActive: await k(A, T1, "A-1", "active"), aDraft: await k(A, T1, "A-0", "draft"), bActive: await k(B, T1, "B-1", "active"), cActive: await k(C, T2, "C-1", "active") };
  const o = async (company: string, tenant: string, contract: string, key: string, title: string, kind: string) =>
    (await db.query("INSERT INTO public.obligations (tenant_id, company_id, contract_id, source_key, kind, title, due_date, due_basis, owner_email, owner_basis, created_by) VALUES ($1, $2, $3, $4, $5, $6, '2026-12-01', 'contract start', 'staff.owner@club.com', 'assigned', 'staff@club.com') RETURNING id", [tenant, company, contract, key, kind, title])).rows[0] as any;
  const obs = { aLed: await o(A, T1, ks.aActive.id, "led", "Install LED", "deliverable"), aOnboard: await o(A, T1, ks.aActive.id, "kickoff", "Internal kickoff call", "onboarding"), aDraftK: await o(A, T1, ks.aDraft.id, "x", "Draft contract item", "deliverable"), bLed: await o(B, T1, ks.bActive.id, "led", "B banner", "deliverable") };
  for (const [type, who, extra] of [["delivered", "staff@club.com", {}], ["evidenced", "staff@club.com", { kind: "link", ref: "https://proof.example/led.jpg" }], ["accepted", "checker@club.com", {}]] as const) {
    await db.query("INSERT INTO public.obligation_events (tenant_id, obligation_id, event_type, evidence_kind, evidence_ref, actor_email) VALUES ($1, $2, $3, $4, $5, $6)", [T1, obs.aLed.id, type, (extra as any).kind ?? null, (extra as any).ref ?? null, who]);
  }
  const r = async (company: string, tenant: string, contract: string) =>
    (await db.query("INSERT INTO public.sponsor_recaps (tenant_id, company_id, contract_id, version, status, gap_count, blocking_gap_count, gaps_acknowledged, acknowledgement, issued_by, checksum, content) VALUES ($1, $2, $3, 1, 'complete', 1, 0, true, 'club knows about the LED gap', 'staff@club.com', 'abc', $4::jsonb) RETURNING id", [tenant, company, contract, JSON.stringify({ contract: { contract_number: "X", title: "T", start_date: "2026-11-01", end_date: "2027-10-31", company_id: company, status: "active" }, commitments: { sold: 3, proven: 2 }, measured: [{ label: "Reach", value: 1200000, unit: "views", source: "broadcast report", period: "2026", internal_cost_per_view: 0.02 }], financial: { cash: 500000, savings: 90000, margin: 0.4 }, gaps: [{ kind: "no_value_recorded", message: "No cash lines" }] })])).rows[0] as any;
  const recaps = { a: await r(A, T1, ks.aActive.id), b: await r(B, T1, ks.bActive.id), c: await r(C, T2, ks.cActive.id) };
  const sb = pgClient(db);
  const ctx = async (company: string, email: string, now = Date.now()) => {
    const auth = await resolvePortalSession(sb, createSessionToken(company, email, now));
    assert.ok(auth.ok, JSON.stringify(auth));
    return (auth as any).ctx;
  };
  return { db, sb, props, ks, obs, recaps, ctx };
}

// ── the guard ───────────────────────────────────────────────────────────────

test("a genuine sponsor session is confirmed, and the company and club come from the database, not the cookie", async () => {
  const { sb } = await world();
  const auth = await resolvePortalSession(sb, createSessionToken(A, "ANA@a.com"));
  assert.ok(auth.ok);
  if (auth.ok) assert.deepEqual([auth.ctx.companyId, auth.ctx.tenantId, auth.ctx.companyName, auth.ctx.email], [A, T1, "Sponsor A", "ana@a.com"]);
});

test("a forged, altered, expired or missing cookie is refused", async () => {
  const { sb } = await world();
  const good = createSessionToken(A, "ana@a.com");
  const [payload, sig] = good.split(".");
  const swapped = Buffer.from(JSON.stringify({ ...JSON.parse(Buffer.from(payload, "base64url").toString()), companyId: B })).toString("base64url");
  for (const [what, token] of [["no cookie", undefined], ["garbage", "not-a-token"], ["payload changed to another sponsor", `${swapped}.${sig}`], ["signature removed", `${payload}.`], ["expired", createSessionToken(A, "ana@a.com", Date.now() - 31 * 86_400_000)]] as const) {
    const r = await resolvePortalSession(sb, token);
    assert.ok(!r.ok && r.status === 401, what);
  }
});

test("a session stops working when the person is no longer a contact of the sponsor, or the sponsor is gone", async () => {
  const { sb, db } = await world();
  const token = createSessionToken(A, "ana@a.com");
  assert.ok((await resolvePortalSession(sb, token)).ok);
  await db.query("DELETE FROM public.contacts WHERE company_id = $1", [A]);
  const r = await resolvePortalSession(sb, token);
  assert.ok(!r.ok && r.status === 403 && r.reason === "contact_removed");
  // an email that is a contact of a DIFFERENT club's sponsor is not a contact here
  const other = await resolvePortalSession(sb, createSessionToken(B, "ana@a.com"));
  assert.ok(!other.ok && other.reason === "contact_removed");
  const gone = (await world());
  await gone.db.query("DELETE FROM public.companies WHERE id = $1", [B]);
  const g = await resolvePortalSession(gone.sb, createSessionToken(B, "bob@b.com"));
  assert.ok(!g.ok && g.status === 401 && g.reason === "company_gone");
});

test("ending access takes effect at once for sessions issued before it, for one person or the whole sponsor, and not for anyone else", async () => {
  const { sb, db } = await world();
  await db.query("INSERT INTO public.contacts (tenant_id, company_id, full_name, email) VALUES ($1, $2, 'Ann2', 'ann2@a.com')", [T1, A]);
  const before = Date.now() - 60_000;
  const anaOld = createSessionToken(A, "ana@a.com", before), annOld = createSessionToken(A, "ann2@a.com", before);
  assert.ok((await resolvePortalSession(sb, anaOld)).ok);
  await db.query("INSERT INTO public.portal_revocations (tenant_id, company_id, email, reason, revoked_by) VALUES ($1, $2, 'ana@a.com', 'Left the sponsor', 'admin@club.com')", [T1, A]);
  const ended = await resolvePortalSession(sb, anaOld);
  assert.ok(!ended.ok && ended.status === 403 && ended.reason === "access_ended");
  assert.ok((await resolvePortalSession(sb, annOld)).ok, "a colleague at the same sponsor is not affected");
  assert.ok((await resolvePortalSession(sb, createSessionToken(A, "ana@a.com"))).ok, "signing in again after the revocation works");
  await db.query("INSERT INTO public.portal_revocations (tenant_id, company_id, email, reason, revoked_by) VALUES ($1, $2, NULL, 'Contract dispute', 'admin@club.com')", [T1, A]);
  assert.ok(!(await resolvePortalSession(sb, annOld)).ok, "ending access for the whole sponsor ends everyone's earlier sessions");
  assert.ok((await resolvePortalSession(sb, createSessionToken(B, "bob@b.com", before))).ok, "another sponsor is untouched");
});

test("ending access is a permanent record that cannot be edited", async () => {
  const { db } = await world();
  await db.query("INSERT INTO public.portal_revocations (tenant_id, company_id, email, reason, revoked_by) VALUES ($1, $2, NULL, 'Contract dispute', 'admin@club.com')", [T1, A]);
  await assert.rejects(() => db.query("UPDATE public.portal_revocations SET reason = 'nothing happened'"), /immutable/);
  await assert.rejects(() => db.query("DELETE FROM public.portal_revocations"), /cannot be deleted/);
});

// ── what each sponsor sees ──────────────────────────────────────────────────

test("a sponsor sees its own approved or sent proposals only: not drafts, not proposals under review, not rejected ones, not anyone else's", async () => {
  const { sb, ctx, props } = await world();
  const res = await portalProposals(sb, await ctx(A, "ana@a.com"));
  assert.ok(res.ok);
  const titles = res.ok ? res.value.map((p) => p.title).sort() : [];
  assert.deepEqual(titles, ["A approved", "A sent"]);
  const bRes = await portalProposals(sb, await ctx(B, "bob@b.com"));
  assert.deepEqual(bRes.ok && bRes.value.map((p) => p.title), ["B approved"]);
  void props;
});

test("asking for another sponsor's proposal, another club's, a draft, or one that does not exist all give the same 'not found'", async () => {
  const { sb, ctx, props } = await world();
  const me = await ctx(A, "ana@a.com");
  const answers = await Promise.all([props.approvedB.id, props.approvedC.id, props.draftA.id, props.reviewA.id, props.rejectedA.id, "ffffffff-0000-4000-8000-000000000000"].map((id) => portalProposal(sb, me, id)));
  for (const a of answers) assert.ok(!a.ok && a.status === 404 && a.error === "Proposal not found", JSON.stringify(a));
  const own = await portalProposal(sb, me, props.approvedA.id);
  assert.ok(own.ok);
});

test("nothing internal reaches the sponsor: no cost estimate, no margin, no staff, no stray keys, at any depth", async () => {
  const { sb, ctx, props } = await world();
  const own = await portalProposal(sb, await ctx(A, "ana@a.com"), props.approvedA.id);
  assert.ok(own.ok);
  const body = (own as any).value;
  assert.deepEqual(internalKeys(body), []);
  const text = JSON.stringify(body);
  for (const secret of ["480.000", "execution_brief", "estimated_cost", "we can drop to 40% margin", "internal_margin", "internal_cost", "margin_pct", "staff@club.com", "assigned_to", "uploaded_by"]) assert.ok(!text.includes(secret), `leaks ${secret}`);
  assert.ok(text.includes("Install LED") && text.includes("Gold") && text.includes("R$ 100k") && text.includes("Deck"), "what a sponsor should see is still there");
  assert.equal(Number(body.packages[0].price_brl), 250000);
});

test("contracts: only the sponsor's own signed ones, without the club's notes", async () => {
  const { sb, ctx } = await world();
  const res = await portalContracts(sb, await ctx(A, "ana@a.com"));
  assert.ok(res.ok && res.value.length === 1 && res.value[0].contract_number === "A-1");
  assert.deepEqual(internalKeys(res.ok && res.value), []);
  assert.ok(!JSON.stringify(res).includes("undercut"));
});

test("delivery: the sold items of the sponsor's signed contracts, proof only once accepted, never who owns the work inside the club", async () => {
  const { sb, ctx, db, obs } = await world();
  const res = await portalDelivery(sb, await ctx(A, "ana@a.com"));
  assert.ok(res.ok);
  const items = res.ok ? res.value : [];
  assert.deepEqual(items.map((i) => i.title), ["Install LED"], "no onboarding step, no item from a draft contract, no other sponsor's item");
  assert.equal(items[0].status, "accepted");
  assert.deepEqual(internalKeys(items), []);
  assert.ok(!JSON.stringify(items).includes("staff.owner@club.com") && !JSON.stringify(items).includes("checker@club.com"));
  // before the club has accepted the proof, the sponsor sees that it is pending, not the proof
  await db.query("DELETE FROM public.obligation_events WHERE obligation_id = $1 AND event_type = 'accepted'", [obs.aLed.id]);
  const pending = await portalDelivery(sb, await ctx(A, "ana@a.com"));
  assert.ok(pending.ok && pending.value[0].proof === "pending" && pending.value[0].status === "evidenced");
});

test("recaps: only the sponsor's own, as the sponsor reads them: no finances, no internal gap notes", async () => {
  const { sb, ctx, recaps } = await world();
  const me = await ctx(A, "ana@a.com");
  const list = await portalRecaps(sb, me);
  assert.ok(list.ok && list.value.length === 1 && list.value[0].open_items === 1);
  const own = await portalRecap(sb, me, recaps.a.id);
  assert.ok(own.ok);
  const text = JSON.stringify(own);
  for (const secret of ["financial", "savings", "margin", "cash", "club knows about", "no_value_recorded", "No cash lines", "internal_cost_per_view", "staff@club.com", "checksum"]) assert.ok(!text.includes(secret), `leaks ${secret}`);
  assert.ok(text.includes("broadcast report") && text.includes("1200000"));
  for (const other of [recaps.b.id, recaps.c.id, "ffffffff-0000-4000-8000-000000000000"]) {
    const r = await portalRecap(sb, me, other);
    assert.ok(!r.ok && r.status === 404 && r.error === "Recap not found");
  }
});

test("two sponsors of the same club, and one of another club that shares an email, are fully separate in every view", async () => {
  const { sb, ctx } = await world();
  const a = await ctx(A, "ana@a.com"), b = await ctx(B, "bob@b.com"), c = await ctx(C, "ana@a.com");
  assert.equal(c.tenantId, T2, "the same email at another club's sponsor is a different session in a different club");
  const view = async (x: typeof a) => JSON.stringify([(await portalProposals(sb, x)), (await portalContracts(sb, x)), (await portalDelivery(sb, x)), (await portalRecaps(sb, x))]);
  const [va, vb, vc] = [await view(a), await view(b), await view(c)];
  for (const [mine, others] of [[va, [vb, vc]], [vb, [va, vc]], [vc, [va, vb]]] as const) {
    assert.ok(mine.length > 20);
    for (const o of others) for (const id of o.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g) ?? []) assert.ok(!mine.includes(id), `an id from another sponsor's view appears: ${id}`);
  }
  assert.ok(va.includes("A approved") && !va.includes("B approved") && !va.includes("C approved"));
  assert.ok(vc.includes("C approved") && !vc.includes("A approved"));
});

// ── the allow-list itself ───────────────────────────────────────────────────

test("the allow-list drops every key it was not told about, including ones an AI or an older feature stored next to the text", () => {
  const out = sponsorContent({ title: "T", executive_summary: "S", execution_brief: { total_estimated_cost_brl: "1" }, unknown_future_key: "x", fulfillment_tasks: [{ id: "1", title: "t", status: "done", assigned_cost: 1 }], document_bundle: [{ url: "u", name: "n", uploaded_by: "x@y" }] });
  assert.deepEqual(Object.keys(out).sort(), ["document_bundle", "executive_summary", "fulfillment_tasks", "title"]);
  assert.deepEqual(internalKeys(out), []);
  assert.deepEqual(sponsorRecap({ id: "1", gap_count: 3, issued_by: "x", acknowledgement: "secret" }), { id: "1", open_items: 3 });
});

test("the last-line scan finds internal-looking keys at any depth, and does not flag ordinary words", () => {
  assert.deepEqual(internalKeys({ a: [{ b: { estimated_cost_brl: 1 } }], ok: { price_range: "x", cost_of_living: 1 } }).sort(), [".a[0].b.estimated_cost_brl", ".ok.cost_of_living"].sort());
  assert.deepEqual(internalKeys({ title: "x", completed_at: null, description: "y", contract_number: "z", costume: 1 }), []);
});
