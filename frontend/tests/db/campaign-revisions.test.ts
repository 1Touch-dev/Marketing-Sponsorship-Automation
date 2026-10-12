import assert from "node:assert/strict";
import test from "node:test";
import { freshDb, refusal } from "./harness";
import { pgClient } from "../helpers/pg-from";
import { approveCampaignRevision, campaignApproval, expirePreapprovalIfChanged, freezeCampaignRevision } from "../../lib/campaigns/revision-store";
import { campaignChecksum, campaignContent, campaignLines } from "../../lib/campaigns/revisions";
import type { AuditEntry } from "../../lib/audit/log";

const T1 = "00000000-0000-0000-0000-000000000001";
const T2 = "00000000-0000-0000-0000-000000000002";

const seed = `
  INSERT INTO public.tenants (id, name) VALUES ('${T2}', 'Second club');
  CREATE TABLE public.campaigns (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    title text, summary text, objective text, cta text, description text, activation text, strategy text, activation_brief jsonb, raw_output jsonb,
    is_preapproved boolean NOT NULL DEFAULT false, preapproved_by uuid, preapproved_at timestamptz, status text DEFAULT 'draft');
  CREATE TABLE public.campaign_inventory_items (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL, campaign_id uuid NOT NULL REFERENCES public.campaigns(id) ON DELETE CASCADE,
    inventory_id uuid, name text, category text, inventory_type text, quantity int DEFAULT 1, unit text, unit_price numeric DEFAULT 0, notes text, included boolean DEFAULT true, sort_order int DEFAULT 0);
`;

async function world() {
  const db = await freshDb(["0073_campaign_revisions.sql"], { seed });
  const sb = pgClient(db);
  const audits: AuditEntry[] = [];
  const audit = async (e: AuditEntry) => { audits.push(e); };
  const campaign = async (over: Record<string, unknown> = {}, tenant = T1) => {
    const c = { title: "Verão com a marca", summary: "Um conceito real", objective: "Visibilidade", cta: "Fale conosco", ...over };
    const r = await db.query("INSERT INTO public.campaigns (tenant_id, title, summary, objective, cta) VALUES ($1, $2, $3, $4, $5) RETURNING id", [tenant, c.title, c.summary, c.objective, c.cta]);
    const id = (r.rows[0] as { id: string }).id;
    await db.query("INSERT INTO public.campaign_inventory_items (tenant_id, campaign_id, name, quantity, unit_price) VALUES ($1, $2, 'LED', 2, 1000), ($1, $2, 'Camisa', 1, 500)", [tenant, id]);
    return id;
  };
  const preapprove = async (id: string) => {
    const r = await approveCampaignRevision(sb, T1, id, { reason: "Pre-approved", by: "boss@club.com" });
    assert.ok(r.ok);
    await db.query("UPDATE public.campaigns SET is_preapproved = true WHERE id = $1", [id]);
    return r.ok ? r.revision : null;
  };
  return { db, sb, audits, audit, campaign, preapprove };
}

test("pre-approving freezes the wording and package, and it applies while nothing has changed", async () => {
  const w = await world();
  const id = await w.campaign();
  const rev = await w.preapprove(id);
  assert.equal(rev?.revision_number, 1);
  const a = await campaignApproval(w.sb, T1, id);
  assert.equal(a?.state, "valid");
  assert.equal(a?.valid, true);
  const stored = (await w.db.query("SELECT total_brl, content, lines FROM public.campaign_revisions WHERE campaign_id = $1", [id])).rows[0] as any;
  assert.equal(Number(stored.total_brl), 2500);
  assert.equal(stored.lines.length, 2);
  assert.equal(stored.content.title, "Verão com a marca");
});

test("changing the wording after pre-approval ends it: the batch is refused even though the flag is still set", async () => {
  const w = await world();
  const id = await w.campaign();
  await w.preapprove(id);
  await w.db.query("UPDATE public.campaigns SET summary = 'Outro conceito, nunca aprovado' WHERE id = $1", [id]);
  const flag = (await w.db.query("SELECT is_preapproved FROM public.campaigns WHERE id = $1", [id])).rows[0] as any;
  assert.equal(flag.is_preapproved, true, "the flag alone would still say yes");
  const a = await campaignApproval(w.sb, T1, id);
  assert.equal(a?.state, "expired");
  assert.equal(a?.valid, false);
  assert.match(a?.message ?? "", /changed after it was pre-approved/);
});

test("changing the package ends it too, and the flag is cleared and recorded", async () => {
  const w = await world();
  const id = await w.campaign();
  await w.preapprove(id);
  await w.db.query("UPDATE public.campaign_inventory_items SET unit_price = 9999 WHERE campaign_id = $1 AND name = 'LED'", [id]);
  const out = await expirePreapprovalIfChanged(w.sb, T1, id, "editor@club.com", w.audit);
  assert.equal(out.expired, true);
  const row = (await w.db.query("SELECT is_preapproved, preapproved_at FROM public.campaigns WHERE id = $1", [id])).rows[0] as any;
  assert.equal(row.is_preapproved, false);
  assert.equal(row.preapproved_at, null);
  assert.equal(w.audits.length, 1);
  assert.equal(w.audits[0].action, "campaign.preapproval_expired");
  assert.equal(w.audits[0].tenant_id, T1);
  // asking again does nothing more
  assert.equal((await expirePreapprovalIfChanged(w.sb, T1, id, "editor@club.com", w.audit)).expired, false);
  assert.equal(w.audits.length, 1);
});

test("a re-save that changes nothing does not end it, and neither do whitespace or an excluded item", async () => {
  const w = await world();
  const id = await w.campaign();
  await w.preapprove(id);
  // the inventory route replaces every row on each save: same package, new rows
  await w.db.query("DELETE FROM public.campaign_inventory_items WHERE campaign_id = $1", [id]);
  await w.db.query("INSERT INTO public.campaign_inventory_items (tenant_id, campaign_id, name, quantity, unit_price, sort_order) VALUES ($1, $2, 'Camisa', 1, 500, 0), ($1, $2, 'LED', 2, 1000, 1)", [T1, id]);
  await w.db.query("INSERT INTO public.campaign_inventory_items (tenant_id, campaign_id, name, quantity, unit_price, included) VALUES ($1, $2, 'Not part of it', 1, 1, false)", [T1, id]);
  await w.db.query("UPDATE public.campaigns SET summary = '  Um conceito real  ', activation_brief = '{\"generated_at\": \"later\"}'::jsonb, raw_output = '{\"x\": 1}'::jsonb WHERE id = $1", [id]);
  assert.equal((await campaignApproval(w.sb, T1, id))?.state, "valid");
  assert.equal((await expirePreapprovalIfChanged(w.sb, T1, id, "x", w.audit)).expired, false);
});

test("pre-approving again after a change records a new revision and applies to that one", async () => {
  const w = await world();
  const id = await w.campaign();
  await w.preapprove(id);
  await w.db.query("UPDATE public.campaigns SET cta = 'Nova chamada' WHERE id = $1", [id]);
  assert.equal((await campaignApproval(w.sb, T1, id))?.state, "expired");
  const second = await w.preapprove(id);
  assert.equal(second?.revision_number, 2);
  const a = await campaignApproval(w.sb, T1, id);
  assert.deepEqual([a?.state, (a as any)?.revision_number], ["valid", 2]);
  // approving the same thing twice does not pile up identical revisions
  const again = await freezeCampaignRevision(w.sb, T1, id, { reason: "x" });
  assert.ok(again.ok && !again.revision.created && again.revision.revision_number === 2);
});

test("a campaign flagged before its wording was recorded, and one that is not flagged, are not approved", async () => {
  const w = await world();
  const old = await w.campaign();
  await w.db.query("UPDATE public.campaigns SET is_preapproved = true WHERE id = $1", [old]);
  const legacy = await campaignApproval(w.sb, T1, old);
  assert.deepEqual([legacy?.state, legacy?.valid], ["unfrozen", false]);
  const plain = await w.campaign();
  assert.deepEqual([(await campaignApproval(w.sb, T1, plain))?.state, (await campaignApproval(w.sb, T1, plain))?.valid], ["not_preapproved", false]);
  assert.equal(await campaignApproval(w.sb, T2, old), null, "another club's campaign is not found");
});

test("the database keeps revisions honest: immutable, only of its own campaign, and an approval can only point at its own", async () => {
  const w = await world();
  const id = await w.campaign();
  const other = await w.campaign({ title: "Outra" });
  const rev = await w.preapprove(id);
  assert.match(await refusal(w.db, "UPDATE public.campaign_revisions SET checksum = $1 WHERE id = $2", ["f".repeat(64), rev!.id]), /immutable/);
  assert.match(await refusal(w.db, "DELETE FROM public.campaign_revisions WHERE id = $1", [rev!.id]), /cannot be deleted/);
  assert.match(await refusal(w.db, "UPDATE public.campaigns SET approved_revision_id = $1 WHERE id = $2", [rev!.id, other]), /own revisions/);
  assert.match(await refusal(w.db, "INSERT INTO public.campaign_revisions (tenant_id, campaign_id, revision_number, content, checksum) VALUES ($1, $2, 9, '{}'::jsonb, $3)", [T2, id, "a".repeat(64)]), /another club/);
  // but deleting the campaign takes its revisions with it
  await w.db.query("UPDATE public.campaigns SET approved_revision_id = NULL WHERE id = $1", [id]);
  await w.db.query("DELETE FROM public.campaigns WHERE id = $1", [id]);
  assert.equal(((await w.db.query("SELECT count(*)::int AS n FROM public.campaign_revisions WHERE campaign_id = $1", [id])).rows[0] as any).n, 0);
});

test("the checksum ignores order and spacing but not content", () => {
  const items = [{ name: "A", quantity: 1, unit_price: 10 }, { name: "B", quantity: 2, unit_price: 5 }];
  const a = campaignChecksum({ content: campaignContent({ title: " T ", summary: "s" }), lines: campaignLines(items) });
  const b = campaignChecksum({ content: campaignContent({ title: "T", summary: "s", model_id: "x" }), lines: campaignLines([...items].reverse()) });
  assert.equal(a, b);
  assert.notEqual(a, campaignChecksum({ content: campaignContent({ title: "T", summary: "s2" }), lines: campaignLines(items) }));
  assert.notEqual(a, campaignChecksum({ content: campaignContent({ title: "T", summary: "s" }), lines: campaignLines([{ ...items[0], unit_price: 11 }, items[1]]) }));
});
