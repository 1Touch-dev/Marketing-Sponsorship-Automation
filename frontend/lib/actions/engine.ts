/**
 * The action engine: plans, approval and execution for anything an agent does that reaches outside the
 * platform. Every rule about who may do what, and in which order, is enforced by the database
 * (agent_action_request and agent_action_transition); this file only drives it, and decides what to do when a
 * step fails or a process dies. It talks to the database through `Rpc`, so it can be tested against a real
 * Postgres engine with crashes injected between any two steps.
 */

export type Rpc = (fn: string, args: Record<string, unknown>) => Promise<{ data: any; error: { message: string } | null }>;

export type ActionState =
  | "planned" | "validated" | "awaiting_approval" | "blocked" | "authorized" | "executing" | "provider_accepted" | "reconciled" | "failed" | "uncertain" | "cancelled";

export const TERMINAL: ActionState[] = ["reconciled", "failed", "cancelled"];

export interface Who { kind: "human" | "approver" | "agent" | "service"; id: string; email?: string | null }

export type FailureKind = "STATE" | "STANDING" | "STALE" | "REVOKED" | "CHANGED" | "RULE" | "ASSIGNMENT" | "PLAN" | "DUPLICATE" | "RETRY" | "OTHER";
export interface Failure { kind: FailureKind; message: string }

/** The database says why in a prefixed message; this turns it back into something to branch on. */
export function classifyError(message: string): Failure {
  const m = /\b(STATE|STANDING|STALE|REVOKED|CHANGED|RULE|ASSIGNMENT|PLAN|DUPLICATE|RETRY): ([\s\S]*)$/.exec(message);
  return m ? { kind: m[1] as FailureKind, message: m[2].trim() } : { kind: "OTHER", message };
}

export interface PlanInput {
  scope: Record<string, unknown>;
  tools: string[];
  inputs: Record<string, unknown>;
  expected_effects: string[];
  cost_ceiling_usd: number;
  stop_conditions: string[];
}

export interface ActionView {
  id: string; tenant_id: string; state: ActionState; effect: string; target_type: string; target_id: string; plan: PlanInput; plan_hash: string;
  requested_by: string; requested_by_kind: string; on_behalf_of: string | null; reviewer_email: string | null; review_due_at: string | null; retry_of: string | null;
  state_changed_at: string; events: Array<{ seq: number; from: string | null; to: string; actor_kind: string; actor_id: string; actor_email: string | null; detail: Record<string, unknown>; at: string }>;
}

export type Step = "requested" | "validated" | "awaiting" | "authorized" | "claimed" | "called" | "accepted" | "reconciled";
export interface Hooks { after?: (step: Step, actionId: string) => void | Promise<void> }

const SERVICE: Who = { kind: "service", id: "service:action-engine" };

async function call<T>(rpc: Rpc, fn: string, args: Record<string, unknown>): Promise<{ ok: true; data: T } | { ok: false; failure: Failure }> {
  const r = await rpc(fn, args);
  return r.error ? { ok: false, failure: classifyError(r.error.message) } : { ok: true, data: r.data as T };
}

export async function getAction(rpc: Rpc, id: string): Promise<ActionView | null> {
  const r = await call<ActionView | null>(rpc, "agent_action_get", { p_action: id });
  return r.ok ? r.data : null;
}

export async function transition(rpc: Rpc, id: string, to: ActionState, who: Who, detail: Record<string, unknown> = {}) {
  return call<string>(rpc, "agent_action_transition", { p_action: id, p_to: to, p_actor_kind: who.kind, p_actor_id: who.id, p_actor_email: who.email ?? null, p_detail: detail });
}

export interface RequestInput {
  tenantId: string; assignmentId: string; effect: string; companyId: string | null; campaignId: string | null;
  target: { type: string; id: string }; plan: PlanInput; requestedBy: Who; onBehalfOf: string | null; idemKey: string; retryOf?: string | null;
}

/** Makes the plan. Repeating the same request (same key) returns the same action, whatever state it is in. */
export async function requestAction(rpc: Rpc, i: RequestInput, hooks: Hooks = {}) {
  const r = await call<string>(rpc, "agent_action_request", {
    p_tenant: i.tenantId, p_assignment: i.assignmentId, p_effect: i.effect, p_company: i.companyId, p_campaign: i.campaignId, p_target_type: i.target.type, p_target_id: i.target.id,
    p_plan: i.plan, p_requested_by_kind: i.requestedBy.kind === "approver" ? "human" : i.requestedBy.kind, p_requested_by: i.requestedBy.id, p_on_behalf_of: i.onBehalfOf,
    p_idem: i.idemKey, p_retry_of: i.retryOf ?? null,
  });
  if (r.ok) await hooks.after?.("requested", r.data);
  return r;
}

export interface GateResult { ok: boolean; gates: Record<string, unknown>; reason?: string }

/**
 * Checks the plan (the caller's gates: do-not-contact, authorized sender, and so on) and puts it in front of a
 * person. A plan that fails a gate becomes failed, with the reason, and never reaches anyone.
 */
export async function submitForApproval(rpc: Rpc, id: string, gates: () => Promise<GateResult>, opts: { reviewerEmail?: string | null; reviewDueAt?: string | null } = {}, hooks: Hooks = {}): Promise<{ state: ActionState; reason?: string }> {
  const g = await gates();
  if (!g.ok) {
    await transition(rpc, id, "failed", SERVICE, { reason: g.reason ?? "A gate refused the plan", gates: g.gates });
    return { state: "failed", reason: g.reason };
  }
  const v = await transition(rpc, id, "validated", SERVICE, { gates: g.gates });
  if (!v.ok) return { state: ((await getAction(rpc, id))?.state ?? "planned") as ActionState, reason: v.failure.message };
  await hooks.after?.("validated", id);
  const a = await transition(rpc, id, "awaiting_approval", SERVICE, { reviewer_email: opts.reviewerEmail ?? null, review_due_at: opts.reviewDueAt ?? null });
  if (!a.ok) return { state: "validated", reason: a.failure.message };
  await hooks.after?.("awaiting", id);
  return { state: "awaiting_approval" };
}

/** A person with standing approves exactly this plan. The database refuses anyone else. */
export async function authorize(rpc: Rpc, id: string, who: Who, hooks: Hooks = {}) {
  const r = await transition(rpc, id, "authorized", who, {});
  if (r.ok) await hooks.after?.("authorized", id);
  return r;
}

export type ExecOutcome =
  | { kind: "accepted"; providerRef: string; detail?: Record<string, unknown> }
  | { kind: "refused"; error: string }
  | { kind: "unknown"; reason: string };

export interface ExecuteResult { state: ActionState; called: boolean; message?: string }

/**
 * Runs an authorized action once. It rechecks the gates, claims execution (which the database allows only once and
 * only after rechecking permissions and the plan's identity), makes the call, and records exactly what happened.
 * A call whose outcome is unknown leaves the action uncertain: it is never run again from here.
 */
export async function execute(rpc: Rpc, id: string, run: (a: ActionView) => Promise<ExecOutcome>, opts: { recheck?: () => Promise<GateResult>; reconcileOnAccept?: boolean } = {}, hooks: Hooks = {}): Promise<ExecuteResult> {
  const a = await getAction(rpc, id);
  if (!a) return { state: "failed", called: false, message: "action not found" };
  if (a.state !== "authorized") return { state: a.state, called: false, message: `not authorized (it is ${a.state})` };

  if (opts.recheck) {
    const g = await opts.recheck();
    if (!g.ok) {
      await transition(rpc, id, "failed", SERVICE, { reason: g.reason ?? "A gate refused at execution time", gates: g.gates, stage: "recheck" });
      return { state: "failed", called: false, message: g.reason };
    }
  }

  const claim = await transition(rpc, id, "executing", SERVICE, { payload_hash: a.plan_hash });
  if (!claim.ok) {
    const f = claim.failure;
    const current = ((await getAction(rpc, id))?.state ?? "authorized") as ActionState;
    if (current !== "authorized") return { state: current, called: false, message: f.message };
    // Authority changed since the approval: nothing ran. It fails with the reason and has to be planned and approved again.
    await transition(rpc, id, "failed", SERVICE, { reason: f.message, stage: "claim", kind: f.kind });
    return { state: "failed", called: false, message: f.message };
  }
  await hooks.after?.("claimed", id);

  let outcome: ExecOutcome;
  try {
    outcome = await run(a);
  } catch (err) {
    outcome = { kind: "unknown", reason: `The call did not complete: ${err instanceof Error ? err.message : String(err)}` };
  }
  await hooks.after?.("called", id);

  if (outcome.kind === "refused") {
    await transition(rpc, id, "failed", SERVICE, { provider_error: outcome.error });
    return { state: "failed", called: true, message: outcome.error };
  }
  if (outcome.kind === "unknown") {
    await transition(rpc, id, "uncertain", SERVICE, { reason: outcome.reason });
    return { state: "uncertain", called: true, message: outcome.reason };
  }
  const acc = await transition(rpc, id, "provider_accepted", SERVICE, { provider_ref: outcome.providerRef, ...(outcome.detail ?? {}) });
  if (!acc.ok) return { state: "executing", called: true, message: acc.failure.message };
  await hooks.after?.("accepted", id);
  if (opts.reconcileOnAccept !== false) {
    const rec = await transition(rpc, id, "reconciled", SERVICE, { reconciled_by: "provider", provider_ref: outcome.providerRef });
    if (rec.ok) await hooks.after?.("reconciled", id);
    return { state: rec.ok ? "reconciled" : "provider_accepted", called: true };
  }
  return { state: "provider_accepted", called: true };
}

/** Marks every action stuck in "executing" (a process that died) as uncertain. Returns how many. */
export async function sweepStuck(rpc: Rpc, minutes = 10): Promise<number> {
  const r = await call<number>(rpc, "agent_actions_sweep_stuck", { p_minutes: minutes });
  return r.ok ? Number(r.data) : 0;
}

/** A person settles an uncertain outcome: it did go out (evidence), or it did not (evidence). */
export async function settleUncertain(rpc: Rpc, id: string, who: Who, outcome: "sent" | "not_sent", evidence: Record<string, unknown>) {
  return outcome === "sent"
    ? transition(rpc, id, "reconciled", who, { evidence, outcome: "sent" })
    : transition(rpc, id, "failed", who, { evidence, confirmed_not_sent: true });
}

/** Block an action whose reviewer has gone, naming who it goes to instead. */
export async function block(rpc: Rpc, id: string, reason: string, escalateTo: string) {
  return transition(rpc, id, "blocked", SERVICE, { reason, escalate_to: escalateTo });
}

export async function cancel(rpc: Rpc, id: string, who: Who, note?: string) {
  return transition(rpc, id, "cancelled", who, { note: note ?? null });
}

export interface DriveDeps {
  gates: () => Promise<GateResult>;
  recheck?: () => Promise<GateResult>;
  run: (a: ActionView) => Promise<ExecOutcome>;
  /** When given, the person who approves at the "awaiting approval" step; otherwise driving stops there. */
  approveWith?: Who;
  reviewerEmail?: string | null;
}

/**
 * Takes an action as far as it can go from wherever it is. Safe to call again after a crash or a retry: each
 * state has exactly one next step, an action someone else is executing is left alone, and an uncertain one is
 * never touched. Returns the state it stopped in.
 */
export async function drive(rpc: Rpc, id: string, deps: DriveDeps, hooks: Hooks = {}): Promise<{ state: ActionState; called: boolean }> {
  let called = false;
  for (let i = 0; i < 10; i++) {
    const a = await getAction(rpc, id);
    if (!a) return { state: "failed", called };
    switch (a.state) {
      case "planned": {
        const r = await submitForApproval(rpc, id, deps.gates, { reviewerEmail: deps.reviewerEmail }, hooks);
        if (r.state === "failed") return { state: "failed", called };
        break;
      }
      case "validated": {
        const t = await transition(rpc, id, "awaiting_approval", SERVICE, { reviewer_email: deps.reviewerEmail ?? null });
        if (!t.ok) return { state: a.state, called };
        await hooks.after?.("awaiting", id);
        break;
      }
      case "awaiting_approval": {
        if (!deps.approveWith) return { state: a.state, called };
        const r = await authorize(rpc, id, deps.approveWith, hooks);
        if (!r.ok) return { state: a.state, called };
        break;
      }
      case "authorized": {
        const r = await execute(rpc, id, deps.run, { recheck: deps.recheck }, hooks);
        called = called || r.called;
        if (r.state === "authorized") return { state: r.state, called };
        break;
      }
      case "provider_accepted": {
        const rec = await transition(rpc, id, "reconciled", SERVICE, { reconciled_by: "provider" });
        if (rec.ok) await hooks.after?.("reconciled", id);
        break;
      }
      default:
        // executing (someone else has it), uncertain, blocked, reconciled, failed, cancelled: nothing to do from here
        return { state: a.state, called };
    }
  }
  return { state: ((await getAction(rpc, id))?.state ?? "failed") as ActionState, called };
}
