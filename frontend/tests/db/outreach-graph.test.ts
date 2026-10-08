import assert from "node:assert/strict";
import test from "node:test";
import { freshDb, ALL_MIGRATIONS } from "./harness";
import { pgClient } from "../helpers/pg-from";
import type { OutreachDeps, ToolOutcome } from "../../lib/agents/langgraph/outreach-graph";
import { finishOutreachGraph, resumeOutreachGraph, settleRunForAction, startOutreachGraph } from "../../lib/agents/langgraph/outreach-runner";
import { cancelRun, getThread } from "../../lib/agents/langgraph/runtime";
import { SupabaseCheckpointSaver } from "../../lib/agents/langgraph/postgres-saver";
import type { SSEEvent } from "../../lib/agents/types";

const T = "00000000-0000-0000-0000-000000000001";
const CO = "aaaaaaaa-0000-4000-8000-00000000000a";
const RUN = "dddddddd-0000-4000-8000-0000000000d1";
const seed = `
  ALTER TABLE public.proposals ADD COLUMN status text, ADD COLUMN approved_at timestamptz;
  CREATE TABLE public.agent_runs (id uuid PRIMARY KEY, tenant_id uuid NOT NULL, company_id uuid, created_by uuid, status text NOT NULL DEFAULT 'running', mode text, steps jsonb DEFAULT '[]', result jsonb, error text, updated_at timestamptz DEFAULT now());
  INSERT INTO public.companies (id, tenant_id, company_name) VALUES ('${CO}', '${T}', 'Sponsor SA');
`;
const ok = (data: Record<string, unknown>, summary = "ok"): ToolOutcome => ({ success: true, data, summary });

interface Harness { db: any; sb: any; events: SSEEvent[]; calls: Record<string, number>; audits: string[]; plans: number; opts: { sb: any; deps: (emit: (e: SSEEvent) => void) => OutreachDeps } }
async function world(over: Partial<{ proposal: () => Promise<ToolOutcome>; email: () => Promise<ToolOutcome>; plan: OutreachDeps["plan"]; auditFailsOnce: boolean }> = {}): Promise<Harness> {
  const db = await freshDb(ALL_MIGRATIONS, { seed });
  const sb = pgClient(db);
  await db.query("INSERT INTO public.agent_runs (id, tenant_id, company_id, status, mode) VALUES ($1, $2, $3, 'running', 'supervised')", [RUN, T, CO]);
  const h: Harness = { db, sb, events: [], calls: {}, audits: [], plans: 0, opts: null as never };
  const bump = (k: string) => { h.calls[k] = (h.calls[k] ?? 0) + 1; };
  let auditFails = over.auditFailsOnce ?? false;
  h.opts = {
    sb,
    deps: (emit) => ({
      sb, emit: (e) => { h.events.push(e); emit(e); },
      tools: {
        enrich: async () => { bump("enrich"); return ok({ found: true, contacts_found: 3, decision_makers: 1, top_contact: { email: "buyer@sponsor.com", name: "Bea Buyer" } }); },
        scrape: async () => { bump("scrape"); return ok({ found: true, social_score: 7 }); },
        proposal: over.proposal ?? (async () => { bump("proposal"); const r = (await db.query("INSERT INTO public.proposals (tenant_id, company_id, title, status) VALUES ($1, $2, 'Proposal for Sponsor', 'under_review') RETURNING id", [T, CO])).rows[0] as any; return ok({ found: true, proposal_id: r.id, proposal_title: "Proposal for Sponsor", executive_summary: "Summary", status: "under_review" }); }),
        email: over.email ?? (async () => { bump("email"); return ok({ email_id: "eeeeeeee-0000-4000-8000-0000000000e1", subject: "Hello", preview: "Preview", recipient: "buyer@sponsor.com", recipient_name: "Bea Buyer" }); }),
      },
      plan: over.plan ?? (async () => { h.plans++; return { ok: true, actionId: "ffffffff-0000-4000-8000-0000000000f1", state: "awaiting_approval" }; }),
      audit: async (e) => { if (auditFails && e.tool === "generate_personalized_proposal") { auditFails = false; throw new Error("process died after the proposal was made"); } h.audits.push(`${e.tool}:${e.status}:v${e.agentVersion}`); },
      notifyProposal: () => { bump("slack"); },
      onBehalfOf: async () => "ana@club.com",
      labels: { running: { enrich_contacts: "Finding decision makers…" }, done: {} },
    }),
  };
  return h;
}
const input = (over: Record<string, unknown> = {}) => ({ run_id: RUN, company_id: CO, company_name: "Sponsor SA", domain: "sponsor.com", mode: "supervised" as const, created_by: null, agent_version: 2, ...over });
const run = async (db: any) => (await db.query("SELECT status, error, result, steps FROM public.agent_runs WHERE id = $1", [RUN])).rows[0] as any;
const thread = async (h: Harness) => { const g = await getThread(h.sb, T, SupabaseCheckpointSaver.threadId(T, "outreach-agent", RUN)); return g.ok ? g.value : null; };

test("the agent researches, drafts a proposal, and waits for a person: the run is paused, announced and saved", async () => {
  const h = await world();
  const out = await startOutreachGraph(input(), (e) => e, h.opts);
  assert.ok(out.used && out.waiting);
  assert.deepEqual(h.calls, { enrich: 1, scrape: 1, proposal: 1, slack: 1 });
  const r = await run(h.db);
  assert.equal(r.status, "paused_for_proposal_approval");
  assert.deepEqual((r.steps as any[]).map((s) => `${s.tool}:${s.status}`), ["enrich_contacts:done", "scrape_company_intelligence:done", "generate_personalized_proposal:done"]);
  assert.equal(r.result.recipient_email, "buyer@sponsor.com");
  const kinds = h.events.map((e) => (e.type === "paused" ? `paused:${e.reason}` : e.type === "step" ? `${e.tool}:${e.status}` : e.type));
  assert.deepEqual(kinds, ["enrich_contacts:running", "enrich_contacts:done", "scrape_company_intelligence:running", "scrape_company_intelligence:done", "generate_personalized_proposal:running", "generate_personalized_proposal:done", "paused:proposal_review"]);
  assert.deepEqual(h.audits, ["enrich_contacts:done:v2", "scrape_company_intelligence:done:v2", "generate_personalized_proposal:done:v2"], "every tool step is audited as the agent, with its version");
  const t = await thread(h);
  assert.ok(t && t.status === "interrupted" && (t.waiting_for as any).reason === "proposal_review");
});

test("approving the proposal drafts the email and makes the send plan; nothing is sent, and the run waits again", async () => {
  const h = await world();
  await startOutreachGraph(input(), (e) => e, h.opts);
  const res = await resumeOutreachGraph(RUN, undefined, h.opts);
  assert.ok(res.used && res.success);
  if (res.used) { assert.equal(res.agentResult.email_id, "eeeeeeee-0000-4000-8000-0000000000e1"); assert.equal(res.agentResult.action_id, "ffffffff-0000-4000-8000-0000000000f1"); assert.equal(res.steps.length, 4); }
  const r = await run(h.db);
  assert.equal(r.status, "paused_for_approval");
  assert.equal((await h.db.query("SELECT status FROM public.proposals")).rows[0].status, "approved");
  assert.equal(h.plans, 1);
  const last = h.events[h.events.length - 1];
  assert.ok(last.type === "paused" && last.reason === "email_review" && last.action_id === "ffffffff-0000-4000-8000-0000000000f1");
  assert.equal(h.calls.enrich, 1, "research is not repeated");
  const t = await thread(h);
  assert.ok(t && t.status === "interrupted" && (t.waiting_for as any).reason === "email_review");
  // the person decides the send: the graph finishes
  await finishOutreachGraph(RUN, "sent", h.opts);
  const t2 = await thread(h);
  assert.equal(t2?.status, "completed");
  assert.equal(h.plans, 1, "finishing plans nothing more");
});

test("resuming twice, or after it already moved on, does nothing twice", async () => {
  const h = await world();
  await startOutreachGraph(input(), (e) => e, h.opts);
  const [a, b] = await Promise.all([resumeOutreachGraph(RUN, undefined, h.opts), resumeOutreachGraph(RUN, undefined, h.opts)]);
  const wins = [a, b].filter((x) => x.used && x.success);
  assert.equal(wins.length, 1);
  assert.equal(h.calls.email, 1, "one email draft");
  assert.equal(h.plans, 1, "one send plan");
  const third = await resumeOutreachGraph(RUN, undefined, h.opts);
  assert.ok(third.used && !third.success && /not waiting for a proposal approval/.test(third.error ?? ""), "a late approval cannot answer the send plan's question");
  assert.equal(((await thread(h))!.waiting_for as any).reason, "email_review", "the run is still waiting for the send decision");
  assert.equal(h.calls.email, 1);
});

test("a run for a pre-approved campaign goes straight on, with no proposal wait, and still stops at the send plan", async () => {
  const h = await world();
  const out = await startOutreachGraph(input({ auto_approve: true, mode: "auto" }), (e) => e, h.opts);
  assert.ok(out.used && out.waiting);
  assert.equal(h.calls.slack, undefined, "no approval request is sent for the proposal");
  const r = await run(h.db);
  assert.equal(r.status, "paused_for_approval");
  assert.equal((await h.db.query("SELECT status FROM public.proposals")).rows[0].status, "approved");
  assert.equal((await thread(h))?.waiting_for && ((await thread(h))!.waiting_for as any).reason, "email_review");
});

test("when no proposal can be made the run ends with that said, and nothing is drafted", async () => {
  const h = await world({ proposal: async () => ({ success: false, data: { found: false }, summary: "No qualified account" }) });
  const out = await startOutreachGraph(input(), (e) => e, h.opts);
  assert.ok(out.used && !out.waiting);
  const r = await run(h.db);
  assert.equal(r.status, "completed");
  const done = h.events[h.events.length - 1];
  assert.ok(done.type === "done" && /Nothing was drafted or sent/.test(done.summary) && /No qualified account/.test(done.summary));
  assert.equal(h.calls.email, undefined);
  assert.equal((await thread(h))?.status, "completed");
});

test("a proposal that is not approved ends the run as cancelled", async () => {
  const h = await world();
  await startOutreachGraph(input(), (e) => e, h.opts);
  const { Command } = await import("@langchain/langgraph");
  void Command;
  const { resumeRun } = await import("../../lib/agents/langgraph/runtime");
  const { buildOutreachGraph } = await import("../../lib/agents/langgraph/outreach-graph");
  const graph = buildOutreachGraph(h.opts.deps(() => undefined), new SupabaseCheckpointSaver(h.sb, T)) as any;
  const out = await resumeRun(h.sb, graph, { tenantId: T, threadId: SupabaseCheckpointSaver.threadId(T, "outreach-agent", RUN), answer: { approved: false } });
  assert.ok(out.ok && out.result.status === "completed");
  assert.equal((await run(h.db)).status, "cancelled");
  assert.equal(h.calls.email, undefined);
  assert.equal(h.plans, 0);
});

test("a failed send plan ends the run as failed, with the reason", async () => {
  const h = await world({ plan: async () => ({ ok: false, error: "The agent is not assigned this company." }) });
  await startOutreachGraph(input(), (e) => e, h.opts);
  const res = await resumeOutreachGraph(RUN, undefined, h.opts);
  assert.ok(res.used && !res.success && /not assigned/.test(res.error ?? ""));
  assert.ok(res.used && res.refused === true, "a rule is reported as a refusal, not a fault");
  const r = await run(h.db);
  assert.deepEqual([r.status, r.error], ["failed", "The agent is not assigned this company."]);
  // the run registry tells the same story as the run: a refusal is not a success, and there is nothing to carry on
  const t = await thread(h);
  assert.equal(t?.status, "failed");
  assert.match(t?.last_error ?? "", /not assigned/);
  const { resumeRun } = await import("../../lib/agents/langgraph/runtime");
  const { buildOutreachGraph } = await import("../../lib/agents/langgraph/outreach-graph");
  const graph = buildOutreachGraph(h.opts.deps(() => undefined), new SupabaseCheckpointSaver(h.sb, T)) as any;
  const again = await resumeRun(h.sb, graph, { tenantId: T, threadId: SupabaseCheckpointSaver.threadId(T, "outreach-agent", RUN) });
  assert.ok(!again.ok && again.status === 409 && /refusal, not a crash/.test(again.error), "carrying on a refusal is refused with the reason");
  assert.equal((await thread(h))?.attempts, 1, "and it does not count as a retry");
});

test("a process that dies after making the proposal does not make a second one when the run is carried on", async () => {
  const h = await world({ auditFailsOnce: true });
  await assert.rejects(() => startOutreachGraph(input(), (e) => e, h.opts), /process died/);
  assert.equal((await run(h.db)).status, "failed");
  assert.equal((await thread(h))?.status, "failed");
  assert.equal(((await h.db.query("SELECT count(*)::int n FROM public.proposals")).rows[0] as any).n, 1, "the proposal exists");
  // carried on from the last saved step, by starting the same run again
  const again = await startOutreachGraph(input(), (e) => e, h.opts);
  assert.ok(again.used && again.waiting);
  assert.equal(h.calls.proposal, 1, "the tool was not called again");
  assert.equal(h.calls.enrich, 1, "finished research was not repeated");
  assert.equal(((await h.db.query("SELECT count(*)::int n FROM public.proposals")).rows[0] as any).n, 1);
  const t = await thread(h);
  assert.deepEqual([t?.status, t?.attempts], ["interrupted", 2]);
});

test("a cancelled run stays stopped: it cannot be approved onward, and its record stays", async () => {
  const h = await world();
  await startOutreachGraph(input(), (e) => e, h.opts);
  const c = await cancelRun(h.sb, { tenantId: T, threadId: SupabaseCheckpointSaver.threadId(T, "outreach-agent", RUN), by: "ana@club.com", reason: "Sponsor asked us to stop" });
  assert.ok(c.ok);
  const res = await resumeOutreachGraph(RUN, undefined, h.opts);
  assert.ok(res.used && !res.success && /cancelled/.test(res.error ?? ""));
  assert.equal(h.calls.email, undefined);
  assert.equal(h.plans, 0);
});

test("an approval made from the send plan itself finishes the run that made it", async () => {
  const h = await world();
  await startOutreachGraph(input(), (e) => e, h.opts);
  await resumeOutreachGraph(RUN, undefined, h.opts);
  await settleRunForAction(h.sb, T, "ffffffff-0000-4000-8000-0000000000f1", "sent", { deps: h.opts.deps });
  const r = await run(h.db);
  assert.equal(r.status, "completed");
  assert.equal((await thread(h))?.status, "completed");
});

test("before the run-state tables exist the caller is told to use the earlier path", async () => {
  const db = await freshDb([], { seed });
  const sb = pgClient(db);
  await db.query("INSERT INTO public.agent_runs (id, tenant_id, company_id, status) VALUES ($1, $2, $3, 'running')", [RUN, T, CO]);
  const deps = (emit: (e: SSEEvent) => void) => ({ sb, emit } as unknown as OutreachDeps);
  const out = await startOutreachGraph(input(), (e) => e, { sb, deps });
  assert.deepEqual(out, { used: false, reason: "Agent run state is not set up yet (migration 0072)." });
  const res = await resumeOutreachGraph(RUN, undefined, { sb, deps });
  assert.deepEqual(res, { used: false });
});
