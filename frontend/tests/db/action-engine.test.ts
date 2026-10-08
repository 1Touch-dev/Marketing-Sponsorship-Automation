import assert from "node:assert/strict";
import test from "node:test";
import type { PGlite } from "@electric-sql/pglite";
import { freshDb } from "./harness";
import { pgRpc } from "../helpers/pg-rpc";
import {
  authorize, block, cancel, drive, execute, getAction, requestAction, settleUncertain, submitForApproval, sweepStuck, transition,
  type ActionState, type DriveDeps, type ExecOutcome, type Rpc, type Who,
} from "../../lib/actions/engine";

const MIG = ["0069_identity_tombstones_idempotency.sql", "0070_agent_governance.sql"];
const T = "00000000-0000-0000-0000-000000000001";
const CO = "aaaaaaaa-0000-4000-8000-00000000000a";
const EMAIL = "eeeeeeee-0000-4000-8000-0000000000e1";
const seed = `
  INSERT INTO public.platform_users (tenant_id, email, role, is_active) VALUES
    ('${T}', 'ana@club.com', 'admin', true), ('${T}', 'bia@club.com', 'approver', true), ('${T}', 'dan@club.com', 'approver', false);
`;
const bia: Who = { kind: "approver", id: "u-bia", email: "bia@club.com" };
const ana: Who = { kind: "human", id: "u-ana", email: "ana@club.com" };
const agent: Who = { kind: "agent", id: "agent:outreach-agent@v1" };
const plan = { scope: { company_id: CO }, tools: ["send_email"], inputs: { email_id: EMAIL }, expected_effects: ["Email marked sent and logged in the CRM"], cost_ceiling_usd: 0.05, stop_conditions: ["Recipient suppressed", "Approval withdrawn"] };

async function assignment(db: PGlite) {
  return ((await db.query("SELECT a.id FROM public.agent_assignments a JOIN public.agent_definitions d ON d.id = a.definition_id WHERE d.key = 'outreach-agent'")).rows[0] as any).id as string;
}
const req = (asg: string, over: Record<string, unknown> = {}) => ({
  tenantId: T, assignmentId: asg, effect: "send_email", companyId: CO, campaignId: null, target: { type: "email", id: EMAIL }, plan, requestedBy: agent, onBehalfOf: "cid@club.com", idemKey: "send-email-eeeeeeee-1", ...over,
});
const gatesOk = async () => ({ ok: true, gates: { do_not_contact: "clear", authorized_sender: "clear" } });
function exec(counter: { n: number }, outcome: ExecOutcome | (() => ExecOutcome | Promise<ExecOutcome>) = { kind: "accepted", providerRef: "crm-activity-77" }) {
  return async (): Promise<ExecOutcome> => { counter.n++; return typeof outcome === "function" ? outcome() : outcome; };
}
const states = async (db: PGlite) => (await db.query("SELECT state FROM public.agent_actions")).rows.map((r: any) => r.state as string);

class Crash extends Error {}

test("the engine takes a plan from nothing to reconciled, and records each step with who did it", async () => {
  const db = await freshDb(MIG, { seed });
  const rpc = pgRpc(db);
  const calls = { n: 0 };
  const r = await requestAction(rpc, req(await assignment(db)));
  assert.ok(r.ok);
  const id = (r as any).data as string;
  const sub = await submitForApproval(rpc, id, gatesOk);
  assert.equal(sub.state, "awaiting_approval");
  assert.ok((await authorize(rpc, id, bia)).ok);
  const done = await execute(rpc, id, exec(calls));
  assert.deepEqual([done.state, done.called, calls.n], ["reconciled", true, 1]);
  const a = await getAction(rpc, id);
  assert.deepEqual(a!.events.map((e) => e.to), ["planned", "validated", "awaiting_approval", "authorized", "executing", "provider_accepted", "reconciled"]);
  assert.deepEqual([a!.events[0].actor_id, a!.events[3].actor_email, a!.events[4].actor_kind], ["agent:outreach-agent@v1", "bia@club.com", "service"]);
  assert.equal(a!.on_behalf_of, "cid@club.com");
});

test("a plan that fails a gate never reaches a person, and nothing runs", async () => {
  const db = await freshDb(MIG, { seed });
  const rpc = pgRpc(db);
  const id = (await requestAction(rpc, req(await assignment(db)))).ok ? ((await getAction(rpc, ((await db.query("SELECT id FROM public.agent_actions")).rows[0] as any).id))!.id) : "";
  const sub = await submitForApproval(rpc, id, async () => ({ ok: false, gates: { do_not_contact: "suppressed" }, reason: "The recipient asked us to stop contacting them" }));
  assert.deepEqual([sub.state, sub.reason], ["failed", "The recipient asked us to stop contacting them"]);
  const calls = { n: 0 };
  assert.equal((await execute(rpc, id, exec(calls))).called, false);
  assert.equal(calls.n, 0);
  assert.equal((await getAction(rpc, id))!.state, "failed");
});

test("a gate that turns red between approval and execution stops the send; nothing is claimed", async () => {
  const db = await freshDb(MIG, { seed });
  const rpc = pgRpc(db);
  const id = ((await requestAction(rpc, req(await assignment(db)))) as any).data as string;
  await submitForApproval(rpc, id, gatesOk);
  await authorize(rpc, id, bia);
  const calls = { n: 0 };
  const r = await execute(rpc, id, exec(calls), { recheck: async () => ({ ok: false, gates: { do_not_contact: "suppressed since approval" }, reason: "Suppressed after the plan was approved" }) });
  assert.deepEqual([r.state, r.called, calls.n], ["failed", false, 0]);
  const ev = (await getAction(rpc, id))!.events;
  assert.ok(!ev.some((e) => e.to === "executing"));
});

test("an approver who left after approving ends the action before anything runs; the reason is kept", async () => {
  const db = await freshDb(MIG, { seed });
  const rpc = pgRpc(db);
  const id = ((await requestAction(rpc, req(await assignment(db)))) as any).data as string;
  await submitForApproval(rpc, id, gatesOk);
  await authorize(rpc, id, bia);
  await db.query("UPDATE public.platform_users SET is_active = false WHERE email = 'bia@club.com'");
  const calls = { n: 0 };
  const r = await execute(rpc, id, exec(calls));
  assert.deepEqual([r.state, r.called, calls.n], ["failed", false, 0]);
  assert.match(r.message!, /no longer has standing/);
  const last = (await getAction(rpc, id))!.events.at(-1)!;
  assert.deepEqual([last.to, last.detail.kind, last.detail.stage], ["failed", "STANDING", "claim"]);
});

test("a call that is refused is failed; a call whose outcome is unknown, or that throws, is uncertain and is never repeated", async () => {
  for (const [label, outcome, expected] of [
    ["refused", { kind: "refused", error: "CRM rejected the activity" } as ExecOutcome, "failed"],
    ["unknown", { kind: "unknown", reason: "Timed out waiting for the CRM" } as ExecOutcome, "uncertain"],
    ["thrown", () => { throw new Error("socket hang up"); }, "uncertain"],
  ] as const) {
    const db = await freshDb(MIG, { seed });
    const rpc = pgRpc(db);
    const id = ((await requestAction(rpc, req(await assignment(db)))) as any).data as string;
    await submitForApproval(rpc, id, gatesOk);
    await authorize(rpc, id, bia);
    const calls = { n: 0 };
    const r = await execute(rpc, id, exec(calls, outcome as never));
    assert.deepEqual([r.state, calls.n], [expected, 1], label);
    // driving it again does not call the provider again
    const again = await drive(rpc, id, { gates: gatesOk, run: exec(calls), approveWith: bia });
    assert.equal(calls.n, 1, `${label}: no second call`);
    assert.equal(again.state, expected);
  }
});

test("an uncertain outcome is settled by a person; if it did not go out, a new plan can be made and run", async () => {
  const db = await freshDb(MIG, { seed });
  const rpc = pgRpc(db);
  const asg = await assignment(db);
  const first = ((await requestAction(rpc, req(asg))) as any).data as string;
  await submitForApproval(rpc, first, gatesOk);
  await authorize(rpc, first, bia);
  const calls = { n: 0 };
  await execute(rpc, first, exec(calls, { kind: "unknown", reason: "Timed out" }));
  const noEvidence = await settleUncertain(rpc, first, ana, "not_sent", {});
  assert.ok(!noEvidence.ok);
  const agentSettling = await settleUncertain(rpc, first, { kind: "service", id: "service:x" }, "not_sent", { checked: "sent folder" });
  assert.ok(!agentSettling.ok);
  assert.ok((await settleUncertain(rpc, first, ana, "not_sent", { checked: "Gmail sent folder", found: "nothing" })).ok);
  const retry = await requestAction(rpc, req(asg, { idemKey: "send-email-eeeeeeee-2", retryOf: first }));
  assert.ok(retry.ok);
  const id2 = (retry as any).data as string;
  const out = await drive(rpc, id2, { gates: gatesOk, run: exec(calls), approveWith: bia });
  assert.deepEqual([out.state, calls.n], ["reconciled", 2]);
  assert.deepEqual((await states(db)).sort(), ["failed", "reconciled"]);
});

test("blocking, reassigning and cancelling go through the engine", async () => {
  const db = await freshDb(MIG, { seed });
  const rpc = pgRpc(db);
  const id = ((await requestAction(rpc, req(await assignment(db)))) as any).data as string;
  await submitForApproval(rpc, id, gatesOk, { reviewerEmail: "dan@club.com" });
  assert.ok((await block(rpc, id, "Reviewer dan@club.com is no longer active", "ana@club.com")).ok);
  assert.equal((await getAction(rpc, id))!.state, "blocked");
  assert.ok((await transition(rpc, id, "awaiting_approval", ana, { new_reviewer_email: "bia@club.com" })).ok);
  assert.ok((await cancel(rpc, id, ana, "No longer needed")).ok);
  assert.equal((await getAction(rpc, id))!.state, "cancelled");
});

test("two processes driving the same action at once run it once", async () => {
  const db = await freshDb(MIG, { seed });
  const rpc = pgRpc(db);
  const id = ((await requestAction(rpc, req(await assignment(db)))) as any).data as string;
  await submitForApproval(rpc, id, gatesOk);
  await authorize(rpc, id, bia);
  const calls = { n: 0 };
  const deps: DriveDeps = { gates: gatesOk, run: exec(calls) };
  await Promise.all([drive(rpc, id, deps), drive(rpc, id, deps), drive(rpc, id, deps)]);
  assert.equal(calls.n, 1);
  assert.equal(((await db.query("SELECT count(*)::int n FROM public.agent_action_events WHERE to_state = 'executing'")).rows[0] as any).n, 1);
  assert.equal((await getAction(rpc, id))!.state, "reconciled");
});

test("the same request made twice is one action; a second send of the same email is refused for good", async () => {
  const db = await freshDb(MIG, { seed });
  const rpc = pgRpc(db);
  const asg = await assignment(db);
  const a = ((await requestAction(rpc, req(asg))) as any).data;
  const b = ((await requestAction(rpc, req(asg))) as any).data;
  assert.equal(a, b);
  const calls = { n: 0 };
  await drive(rpc, a, { gates: gatesOk, run: exec(calls), approveWith: bia });
  assert.equal(calls.n, 1);
  const dup = await requestAction(rpc, req(asg, { idemKey: "send-email-eeeeeeee-9" }));
  assert.ok(!dup.ok && dup.failure.kind === "DUPLICATE");
  assert.equal((await states(db)).length, 1);
});

// ── the crash matrix ────────────────────────────────────────────────────────

/** A database connection that dies at the Nth call, either before it reaches the database or after it has been done but before the answer is seen. */
function crashingRpc(db: PGlite, at: number, mode: "before" | "after"): { rpc: Rpc; count: () => number } {
  let n = 0;
  const real = pgRpc(db);
  return {
    count: () => n,
    rpc: async (fn, args) => {
      n++;
      if (n === at && mode === "before") throw new Crash(`died before call ${n} (${fn})`);
      const r = await real(fn, args);
      if (n === at && mode === "after") throw new Crash(`died after call ${n} (${fn}); the answer was lost`);
      return r;
    },
  };
}

async function lifecycle(rpc: Rpc, asg: string, calls: { n: number }) {
  const r = await requestAction(rpc, req(asg));
  if (!r.ok) throw new Error(`request failed: ${r.failure.message}`);
  return drive(rpc, r.data, { gates: gatesOk, run: exec(calls), approveWith: bia });
}

test("CRASH MATRIX: the process dies before or after every single database call of the whole lifecycle; nothing duplicates, nothing is lost", async () => {
  // how many calls a clean run makes
  const clean = await freshDb(MIG, { seed });
  const counting = crashingRpc(clean, 10_000, "before");
  const cleanCalls = { n: 0 };
  await lifecycle(counting.rpc, await assignment(clean), cleanCalls);
  const total = counting.count();
  assert.ok(total >= 12, `a clean run makes ${total} calls`);
  assert.equal(cleanCalls.n, 1);

  const outcomes: Record<string, number> = {};
  for (const mode of ["before", "after"] as const) {
    for (let at = 1; at <= total + 1; at++) {
      const db = await freshDb(MIG, { seed });
      const asg = await assignment(db);
      const calls = { n: 0 };
      const dying = crashingRpc(db, at, mode);
      let crashed = false;
      try { await lifecycle(dying.rpc, asg, calls); } catch (e) { if (e instanceof Crash) crashed = true; else throw e; }

      // a new process starts: it sweeps what the dead one left half-done, then carries on from the database's state
      const healthy = pgRpc(db);
      await sweepStuck(healthy, 0);
      const second = await lifecycle(healthy, asg, calls);
      await sweepStuck(healthy, 0);

      const label = `${mode} call ${at}${crashed ? "" : " (no crash reached)"}`;
      const rows = await states(db);
      assert.equal(rows.length, 1, `${label}: exactly one action exists`);
      assert.ok(calls.n <= 1, `${label}: the provider was called ${calls.n} times`);
      const final = rows[0] as ActionState;
      assert.ok(final === "reconciled" || final === "uncertain", `${label}: ended ${final}`);
      if (final === "reconciled") assert.equal(calls.n, 1, `${label}: reconciled means it really ran, once`);
      assert.equal(second.called && calls.n > 1, false, label);
      const ev = (await getAction(healthy, ((await db.query("SELECT id FROM public.agent_actions")).rows[0] as any).id))!.events;
      assert.equal(ev.filter((e) => e.to === "executing").length <= 1, true, `${label}: executing was claimed at most once`);
      assert.equal(new Set(ev.map((e) => e.seq)).size, ev.length, label);
      outcomes[final] = (outcomes[final] ?? 0) + 1;
    }
  }
  // both kinds of ending were exercised: runs that completed after a restart, and runs that had to stop as uncertain
  assert.ok(outcomes.reconciled > 0 && outcomes.uncertain > 0, JSON.stringify(outcomes));
});

test("CRASH MATRIX: dying right after the provider call, before its answer is recorded, leaves the action uncertain and the provider called once", async () => {
  const db = await freshDb(MIG, { seed });
  const rpc = pgRpc(db);
  const asg = await assignment(db);
  const calls = { n: 0 };
  const id = ((await requestAction(rpc, req(asg))) as any).data as string;
  await submitForApproval(rpc, id, gatesOk);
  await authorize(rpc, id, bia);
  await assert.rejects(execute(rpc, id, exec(calls), {}, { after: (step) => { if (step === "called") throw new Crash("process killed"); } }), Crash);
  assert.equal((await getAction(rpc, id))!.state, "executing", "nothing recorded the outcome");
  assert.equal(await sweepStuck(rpc, 0), 1);
  const after = await drive(rpc, id, { gates: gatesOk, run: exec(calls), approveWith: bia });
  assert.deepEqual([after.state, after.called, calls.n], ["uncertain", false, 1]);
});

test("CRASH MATRIX: dying right after the claim, before the call, also ends uncertain: we cannot tell, so we do not guess", async () => {
  const db = await freshDb(MIG, { seed });
  const rpc = pgRpc(db);
  const calls = { n: 0 };
  const id = ((await requestAction(rpc, req(await assignment(db)))) as any).data as string;
  await submitForApproval(rpc, id, gatesOk);
  await authorize(rpc, id, bia);
  await assert.rejects(execute(rpc, id, exec(calls), {}, { after: (step) => { if (step === "claimed") throw new Crash("process killed"); } }), Crash);
  await sweepStuck(rpc, 0);
  assert.equal((await getAction(rpc, id))!.state, "uncertain");
  assert.equal(calls.n, 0);
  assert.ok((await settleUncertain(rpc, id, ana, "not_sent", { checked: "CRM activity log", found: "no activity" })).ok);
});
