import assert from "node:assert/strict";
import test from "node:test";
import { freshDb, ALL_MIGRATIONS } from "./harness";
import { pgClient } from "../helpers/pg-from";
import { resolvePortalSession } from "../../lib/portal/guard";
import { createSessionToken } from "../../lib/portal/session";
import { portalProposal, portalProposals } from "../../lib/portal/data";
import { sharedProposalFor } from "../../lib/proposals/share-access";
import { loadFrozenRevisions, withFrozen } from "../../lib/proposals/frozen";
import { internalKeys } from "../../lib/portal/safe-view";

process.env.INTERNAL_API_SECRET ||= "test-secret-for-portal-cookies";

const T1 = "00000000-0000-0000-0000-000000000001";
const T2 = "00000000-0000-0000-0000-000000000002";
const A = "a0000000-0000-4000-8000-00000000000a";

const seed = `
  INSERT INTO public.tenants (id, name) VALUES ('${T2}', 'Second club');
  CREATE TABLE public.proposal_inventory_items (id uuid PRIMARY KEY DEFAULT gen_random_uuid());
  CREATE TABLE public.approvals (id uuid PRIMARY KEY DEFAULT gen_random_uuid());
  ALTER TABLE public.companies ADD COLUMN logo_url text, ADD COLUMN industry text;
  ALTER TABLE public.contacts ADD COLUMN email text;
  ALTER TABLE public.proposals ADD COLUMN status text, ADD COLUMN version int DEFAULT 1, ADD COLUMN created_at timestamptz DEFAULT now(), ADD COLUMN approved_at timestamptz,
    ADD COLUMN share_token text, ADD COLUMN expires_at timestamptz, ADD COLUMN content jsonb, ADD COLUMN pricing_tiers jsonb, ADD COLUMN strategy_variants jsonb;
  CREATE TABLE public.proposal_packages (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), proposal_id uuid, name text, description text, price_brl numeric, benefits jsonb, inventory_items jsonb, sort_order int DEFAULT 0, active boolean DEFAULT true);
  INSERT INTO public.companies (id, tenant_id, company_name) VALUES ('${A}', '${T1}', 'Sponsor A');
  INSERT INTO public.contacts (tenant_id, company_id, full_name, email) VALUES ('${T1}', '${A}', 'Ana', 'ana@a.com');
`;

const approvedWording = { title: "Approved title", executive_summary: "The wording that was approved", execution_brief: { total_estimated_cost_brl: "R$ 480.000" } };
const editedWording = { title: "Edited title", executive_summary: "Wording edited AFTER approval", execution_brief: { total_estimated_cost_brl: "R$ 1" } };

async function world() {
  // the real migration 0052 (revisions), then the title column that migration 0055 adds
  const db = await freshDb(["0052_proposal_revisions.sql", ...ALL_MIGRATIONS], { seed });
  await db.exec("ALTER TABLE public.proposal_revisions ADD COLUMN IF NOT EXISTS title text;");
  const sb = pgClient(db);
  const proposal = async (title: string, status: string, content: object, token: string) =>
    ((await db.query("INSERT INTO public.proposals (tenant_id, company_id, title, status, content, share_token) VALUES ($1, $2, $3, $4, $5::jsonb, $6) RETURNING id", [T1, A, title, status, JSON.stringify(content), token])).rows[0] as { id: string }).id;
  const revision = async (proposalId: string, n: number, content: object, title: string | null, tenant = T1) =>
    ((await db.query("INSERT INTO public.proposal_revisions (tenant_id, proposal_id, revision_number, content, title, checksum) VALUES ($1, $2, $3, $4::jsonb, $5, $6) RETURNING id", [tenant, proposalId, n, JSON.stringify(content), title, `sum-${proposalId}-${n}`])).rows[0] as { id: string }).id;
  const bind = (proposalId: string, revisionId: string) => db.query("UPDATE public.proposals SET approved_revision_id = $2 WHERE id = $1", [proposalId, revisionId]);
  const auth = await resolvePortalSession(sb, createSessionToken(A, "ana@a.com"));
  assert.ok(auth.ok);
  return { db, sb, ctx: (auth as any).ctx, proposal, revision, bind };
}

test("a sponsor is shown the wording that was approved, not what was edited after", async () => {
  const w = await world();
  // approved with one wording; the live text was edited afterwards (the status stays approved, as the edit route leaves it)
  const id = await w.proposal("Edited title", "approved", editedWording, "tok-frozen-0001");
  const rev = await w.revision(id, 3, approvedWording, "Approved title");
  await w.bind(id, rev);

  const list = await portalProposals(w.sb, w.ctx);
  assert.ok(list.ok);
  const one = list.value.find((p: any) => p.id === id) as any;
  assert.equal(one.title, "Approved title");
  assert.equal(one.content.executive_summary, "The wording that was approved");
  assert.equal(one.version, 3, "the number shown is the approved revision's, not the live edit counter");
  assert.equal(one.approval_frozen, true);

  const detail = await portalProposal(w.sb, w.ctx, id);
  assert.ok(detail.ok);
  assert.equal((detail.value as any).content.executive_summary, "The wording that was approved");
  assert.ok(!JSON.stringify(detail.value).includes("Wording edited AFTER approval"));
  assert.deepEqual(internalKeys(detail.value), [], "the club's cost estimates inside the frozen wording still do not reach the sponsor");
  assert.ok(!JSON.stringify(detail.value).includes("480.000"));
});

test("approving again shows the new wording", async () => {
  const w = await world();
  const id = await w.proposal("Edited title", "approved", editedWording, "tok-frozen-0002");
  await w.bind(id, await w.revision(id, 1, approvedWording, "Approved title"));
  await w.bind(id, await w.revision(id, 2, editedWording, "Edited title"));
  const detail = await portalProposal(w.sb, w.ctx, id);
  assert.ok(detail.ok);
  assert.equal((detail.value as any).content.executive_summary, "Wording edited AFTER approval");
  assert.equal((detail.value as any).approved_revision_number, 2);
});

test("a proposal approved before revisions existed is still shown, and says it is not frozen", async () => {
  const w = await world();
  const id = await w.proposal("Legacy", "approved", approvedWording, "tok-frozen-0003");
  const list = await portalProposals(w.sb, w.ctx);
  assert.ok(list.ok);
  const one = list.value.find((p: any) => p.id === id) as any;
  assert.ok(one, "it does not vanish from the sponsor");
  assert.equal(one.approval_frozen, false);
  assert.equal(one.content.executive_summary, "The wording that was approved");
});

test("an approval pointing at a revision that cannot be used shows the sponsor nothing", async () => {
  const w = await world();
  const mine = await w.proposal("Mine", "approved", approvedWording, "tok-frozen-0004");
  const other = await w.proposal("Other", "approved", editedWording, "tok-frozen-0005");
  // 1. a revision that belongs to a different proposal
  await w.bind(mine, await w.revision(other, 1, editedWording, "Other"));
  // 2. a revision recorded under a different club
  const third = await w.proposal("Third", "approved", approvedWording, "tok-frozen-0006");
  await w.bind(third, await w.revision(third, 1, approvedWording, "Third", T2));
  const list = await portalProposals(w.sb, w.ctx);
  assert.ok(list.ok);
  assert.ok(!list.value.some((p: any) => p.id === mine || p.id === third), "neither is shown");
  for (const id of [mine, third]) {
    const d = await portalProposal(w.sb, w.ctx, id);
    assert.ok(!d.ok && d.status === 404);
  }
  const bound = await loadFrozenRevisions(w.sb, T1, [{ id: mine, approved_revision_id: ((await w.db.query("SELECT approved_revision_id FROM public.proposals WHERE id = $1", [mine])).rows[0] as { approved_revision_id: string }).approved_revision_id }]);
  assert.equal(bound.size, 0);
});

test("a revision from before migration 0055 (no title) still serves, titled from its content", () => {
  const out = withFrozen({ id: "p", title: "Live title", content: { title: "x" }, version: 9 }, { id: "r", proposal_id: "p", revision_number: 2, title: null, content: { title: "Title in the content", executive_summary: "s" }, created_at: null });
  assert.equal(out.title, "Title in the content");
  assert.equal(out.version, 2);
  assert.equal(withFrozen({ id: "p", title: "Live" }, undefined).approval_frozen, false);
});

test("a link acts only on a proposal the club has approved", async () => {
  const w = await world();
  const ids: Record<string, string> = {};
  for (const status of ["draft", "under_review", "rejected", "approved", "sent", "active_contract"]) ids[status] = await w.proposal(`P ${status}`, status, approvedWording, `tok-${status}-12345`);
  for (const status of ["draft", "under_review", "rejected"]) assert.equal(await sharedProposalFor(w.sb, ids[status], `tok-${status}-12345`), null, `${status} refused`);
  for (const status of ["approved", "sent", "active_contract"]) assert.ok(await sharedProposalFor(w.sb, ids[status], `tok-${status}-12345`), `${status} accepted`);
  assert.equal(await sharedProposalFor(w.sb, ids.approved, "tok-wrong-token-1"), null);
});

test("while a proposal is being re-reviewed after an edit, the sponsor keeps the version that was approved; one never approved stays hidden", async () => {
  const w = await world();
  // approved, then edited: the edit route sets it to under_review but keeps the pointer to the approved revision
  const edited = await w.proposal("Edited title", "under_review", editedWording, "tok-review-0001");
  await w.bind(edited, await w.revision(edited, 1, approvedWording, "Approved title"));
  const neverApproved = await w.proposal("First draft in review", "under_review", editedWording, "tok-review-0002");
  const list = await portalProposals(w.sb, w.ctx);
  assert.ok(list.ok);
  const shown = list.value.find((p: any) => p.id === edited) as any;
  assert.ok(shown, "the sponsor still has its proposal");
  assert.equal(shown.content.executive_summary, "The wording that was approved", "and it is the approved wording, not the text under review");
  assert.ok(!JSON.stringify(list.value).includes("Wording edited AFTER approval"));
  assert.ok(!list.value.some((p: any) => p.id === neverApproved), "a proposal that was never approved is not shown");
  assert.ok((await portalProposal(w.sb, w.ctx, edited)).ok);
  const hidden = await portalProposal(w.sb, w.ctx, neverApproved);
  assert.ok(!hidden.ok && hidden.status === 404);
  // and the link acts the same way
  assert.ok(await sharedProposalFor(w.sb, edited, "tok-review-0001"));
  assert.equal(await sharedProposalFor(w.sb, neverApproved, "tok-review-0002"), null);
});
