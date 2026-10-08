import { createHash } from "crypto";
import type { WriteResult } from "../accounts/store";
import { checkSend } from "../contacts/store";
import { loadDelivery } from "../messaging/store";
import { authorizeAgent, governedActor } from "../agents/governance";
import { recordAudit, type AuditEntry } from "../audit/log";
import type { Actor, UserLike } from "../identity/actor";
import { userActor } from "../identity/actor";
import {
  authorize, drive, execute, getAction, requestAction, submitForApproval, type ActionState, type ExecOutcome, type GateResult, type PlanInput, type Rpc, type Who,
} from "./engine";

type Sb = any;

/** supabase-js behind the engine's database interface. */
export const supabaseRpc = (sb: Sb): Rpc => async (fn, args) => {
  const { data, error } = await sb.rpc(fn, args);
  return { data, error: error ? { message: error.message } : null };
};

interface EmailRow { id: string; tenant_id: string; recipient: string; subject: string | null; company_id: string | null; proposal_id: string | null; sender_member_id: string | null; status: string; body_text?: string | null; body_html?: string | null }

const EMAIL_COLUMNS = "id, tenant_id, recipient, subject, company_id, proposal_id, sender_member_id, status, body_text, body_html";

/** What the approver is approving, as one fingerprint: who it goes to, the subject and the exact text. */
export function emailFingerprint(e: Pick<EmailRow, "recipient" | "subject" | "body_text" | "body_html">): string {
  return createHash("sha256").update(JSON.stringify([e.recipient?.trim().toLowerCase() ?? "", e.subject ?? "", e.body_text ?? "", e.body_html ?? ""])).digest("hex");
}

/**
 * The checks that must hold both when the plan is made and again just before it runs. Given the plan that was approved,
 * the email must still be exactly that email: a recipient, subject or text changed after approval is refused.
 */
export async function emailSendGates(sb: Sb, emailId: string, approved?: { inputs?: Record<string, unknown> } | null): Promise<GateResult> {
  const { data: row } = await sb.from("emails").select(EMAIL_COLUMNS).eq("id", emailId).maybeSingle();
  if (!row) return { ok: false, gates: { email: "missing" }, reason: "Email not found" };
  const email = row as EmailRow;
  if (email.status === "sent") return { ok: false, gates: { email: "already sent" }, reason: "This email was already sent" };
  if (approved?.inputs) {
    const was = approved.inputs;
    const recipientChanged = typeof was.recipient === "string" && was.recipient.trim().toLowerCase() !== email.recipient.trim().toLowerCase();
    const subjectChanged = "subject" in was && (was.subject ?? null) !== (email.subject ?? null);
    const textChanged = typeof was.content_fingerprint === "string" && was.content_fingerprint !== emailFingerprint(email);
    if (recipientChanged || subjectChanged || textChanged) {
      const what = recipientChanged ? "its recipient" : subjectChanged ? "its subject" : "its text";
      return { ok: false, gates: { content: "changed after approval" }, reason: `The email was changed after this plan was made (${what}). What was approved is not what would be sent, so it was not sent. Make a new plan for the email as it is now.` };
    }
  }
  const pre = await loadDelivery(sb, null, emailId);
  if (pre && !pre.view.canSend && pre.view.state !== "crm_activity_recorded") return { ok: false, gates: { delivery: pre.view.state }, reason: `Not sending: ${pre.view.blockedReason}` };
  const standing = await checkSend(sb, email.tenant_id, email);
  if (!standing.allowed) return { ok: false, gates: { do_not_contact: "blocked" }, reason: `Not sending: ${standing.blocks[0].message}` };
  return { ok: true, gates: { email: "exists, not sent", delivery: "sendable", do_not_contact: "clear", authorized_sender: "clear" } };
}

export function emailSendPlan(email: Pick<EmailRow, "id" | "recipient" | "subject" | "company_id"> & Partial<Pick<EmailRow, "body_text" | "body_html">>, maxCostUsd: number): PlanInput {
  return {
    scope: { company_id: email.company_id, recipient: email.recipient },
    tools: ["send_email"],
    inputs: { email_id: email.id, recipient: email.recipient, subject: email.subject, content_fingerprint: emailFingerprint({ recipient: email.recipient, subject: email.subject, body_text: email.body_text ?? null, body_html: email.body_html ?? null }) },
    // Truthful on purpose: the platform has no email provider connected yet, so this marks the email sent and logs it in the CRM.
    expected_effects: ["The email is marked as sent and an activity is logged in the CRM. The platform has no email provider connected, so the recipient is not emailed by it."],
    cost_ceiling_usd: Math.min(0.01, maxCostUsd),
    stop_conditions: ["The recipient is on the do-not-contact list", "The sender is no longer authorized", "The approver no longer has standing", "The plan changed after it was approved"],
  };
}

export type PlanResult =
  | { ok: true; actionId: string; state: ActionState; legacy?: false }
  | { ok: true; legacy: true; actionId: null; state: null }
  | { ok: false; status: number; error: string; actionId?: string; state?: ActionState };

const attemptCount = async (sb: Sb, tenantId: string, emailId: string): Promise<number> => {
  const { count } = await sb.from("agent_actions").select("id", { count: "exact", head: true }).eq("tenant_id", tenantId).eq("effect", "send_email").eq("target_id", emailId);
  return count ?? 0;
};

/**
 * Turns "an agent wants to send this email" into a plan in front of a person. Safe to call again: the same email
 * is the same plan; a failed earlier attempt becomes a new, linked plan; an uncertain or running one is reported,
 * never started over. Returns legacy before the governance tables exist.
 */
export async function planEmailSend(sb: Sb, i: { tenantId: string; emailId: string; agentKey?: string; onBehalfOf: string | null; runId?: string | null; reviewerEmail?: string | null; audit?: (e: AuditEntry) => Promise<void> }): Promise<PlanResult> {
  const audit = i.audit ?? recordAudit;
  const rpc = supabaseRpc(sb);
  const agentKey = i.agentKey ?? "outreach-agent";
  const { data: row } = await sb.from("emails").select(EMAIL_COLUMNS).eq("id", i.emailId).eq("tenant_id", i.tenantId).maybeSingle();
  if (!row) return { ok: false, status: 404, error: "Email not found" };
  const email = row as EmailRow;

  const auth = await authorizeAgent(sb, i.tenantId, agentKey, { companyId: email.company_id, effects: ["send_email"] });
  if (!auth.ok) return auth;
  if (auth.authority.legacy) return { ok: true, legacy: true, actionId: null, state: null };

  const agent = governedActor(agentKey, auth.authority, { onBehalfOf: i.onBehalfOf, runId: i.runId });
  const who: Who = { kind: "agent", id: agent.id };
  const base = `send_email:${i.emailId}`;
  let attempt = await attemptCount(sb, i.tenantId, i.emailId);
  let idem = attempt === 0 ? base : `${base}:attempt:${attempt + 1}`;

  let prior = attempt > 0 ? await latestAction(sb, i.tenantId, i.emailId) : null;
  if (prior && prior.state === "failed") {
    // a failed attempt may be tried again as a new, linked plan
  } else if (prior) {
    return reportExisting(prior.id, prior.state);
  }
  const made = await requestAction(rpc, {
    tenantId: i.tenantId, assignmentId: auth.authority.assignmentId!, effect: "send_email", companyId: email.company_id, campaignId: null, target: { type: "email", id: i.emailId },
    plan: emailSendPlan(email, auth.authority.maxCostUsd), requestedBy: who, onBehalfOf: i.onBehalfOf, idemKey: idem, retryOf: prior?.state === "failed" ? prior.id : null,
  });
  if (!made.ok) return { ok: false, status: made.failure.kind === "ASSIGNMENT" || made.failure.kind === "PLAN" ? 403 : 409, error: made.failure.message };
  const sub = await submitForApproval(rpc, made.data, () => emailSendGates(sb, i.emailId), { reviewerEmail: i.reviewerEmail });
  await audit({
    actor: agent, tenant_id: i.tenantId, entity_type: "email", entity_id: i.emailId, action: "agent.action.planned", request_id: i.runId ?? null,
    metadata: { action_id: made.data, effect: "send_email", state: sub.state, reason: sub.reason ?? null, attempt: attempt + 1 },
  });
  if (sub.state === "failed") return { ok: false, status: 409, error: sub.reason ?? "A check refused the plan", actionId: made.data, state: "failed" };
  return { ok: true, actionId: made.data, state: sub.state };
}

async function latestAction(sb: Sb, tenantId: string, emailId: string): Promise<{ id: string; state: ActionState } | null> {
  const { data } = await sb.from("agent_actions").select("id, state").eq("tenant_id", tenantId).eq("effect", "send_email").eq("target_id", emailId).order("created_at", { ascending: false }).limit(1);
  return (data?.[0] as { id: string; state: ActionState } | undefined) ?? null;
}

function reportExisting(id: string, state: ActionState): PlanResult {
  if (state === "reconciled") return { ok: true, actionId: id, state };
  if (state === "uncertain") return { ok: false, status: 409, error: "The last attempt to send this email has an unknown outcome. A person has to check and settle it before anything else is done.", actionId: id, state };
  if (state === "executing" || state === "provider_accepted") return { ok: false, status: 409, error: "This email is being sent right now.", actionId: id, state };
  if (state === "cancelled") return { ok: false, status: 409, error: "The plan to send this email was cancelled.", actionId: id, state };
  return { ok: true, actionId: id, state };
}

export type SendOutcome = { ok: true; state: ActionState; summary: string; data: Record<string, unknown> } | { ok: false; status: number; error: string; state?: ActionState };

/** The agent's own send tool, expressed as the engine's outcome. */
export function toExecOutcome(r: { success: boolean; data: Record<string, unknown>; summary: string }): ExecOutcome {
  if (r.success && r.data.sent) return { kind: "accepted", providerRef: r.data.already_sent ? "already-sent" : `crm-activity:${String(r.data.pipedrive_activity_id ?? "logged")}`, detail: { summary: r.summary } };
  // marked sent but the CRM write failed: part of it happened, so nobody should send it again
  if (r.data.sent) return { kind: "unknown", reason: `The email was marked sent but the CRM write failed: ${r.summary}` };
  return { kind: "refused", error: r.summary };
}

/**
 * A person approves exactly this plan and it runs. The database checks that they have standing, that the plan is
 * the one approved and that the agent still has its authority, immediately before it starts.
 */
export async function approveAndSend(sb: Sb, i: { tenantId: string; actionId: string; approver: UserLike; send: () => Promise<{ success: boolean; data: Record<string, unknown>; summary: string }>; audit?: (e: AuditEntry) => Promise<void> }): Promise<SendOutcome> {
  const audit = i.audit ?? recordAudit;
  const rpc = supabaseRpc(sb);
  const view = await getAction(rpc, i.actionId);
  if (!view || view.tenant_id !== i.tenantId) return { ok: false, status: 404, error: "Action not found" };
  const approver: Actor = userActor(i.approver);
  const who: Who = { kind: "approver", id: approver.id, email: approver.email };

  if (view.state === "reconciled") return { ok: true, state: "reconciled", summary: "Email was already sent", data: { sent: true, already_sent: true } };
  if (view.state === "uncertain") return { ok: false, status: 409, error: "The outcome of the last attempt is unknown. Check whether the email went out and settle it first.", state: "uncertain" };
  if (view.state === "executing" || view.state === "provider_accepted") return { ok: false, status: 409, error: "This email is being sent right now.", state: view.state };
  if (view.state === "blocked") return { ok: false, status: 409, error: "This approval is blocked because its reviewer is no longer available. An administrator has to reassign it.", state: "blocked" };

  if (view.state === "awaiting_approval") {
    const a = await authorize(rpc, i.actionId, who);
    if (!a.ok) return { ok: false, status: a.failure.kind === "STANDING" ? 403 : 409, error: a.failure.message, state: view.state };
    await audit({ actor: approver, tenant_id: i.tenantId, entity_type: "email", entity_id: view.target_id, action: "agent.action.approved", metadata: { action_id: i.actionId, plan_hash: view.plan_hash } });
  } else if (view.state !== "authorized") {
    return { ok: false, status: 409, error: `This action is ${view.state}, so it cannot be approved now.`, state: view.state };
  }

  let result: { success: boolean; data: Record<string, unknown>; summary: string } = { success: false, data: {}, summary: "" };
  const run = async () => { result = await i.send(); return toExecOutcome(result); };
  const done = await execute(rpc, i.actionId, run, { recheck: () => emailSendGates(sb, view.target_id, view.plan as { inputs?: Record<string, unknown> }) });
  await audit({
    actor: governedActorFor(view.requested_by, view.on_behalf_of), tenant_id: i.tenantId, entity_type: "email", entity_id: view.target_id, action: `agent.action.${done.state}`,
    metadata: { action_id: i.actionId, called: done.called, message: done.message ?? null },
  });
  if (done.state === "reconciled" || done.state === "provider_accepted") return { ok: true, state: done.state, summary: result.summary, data: result.data };
  if (done.state === "uncertain") return { ok: false, status: 409, error: done.message ?? "The outcome is unknown; a person has to settle it.", state: "uncertain" };
  return { ok: false, status: done.state === "failed" ? 409 : 500, error: done.message ?? `The action ended ${done.state}.`, state: done.state };
}

function governedActorFor(requestedBy: string, onBehalfOf: string | null): Actor {
  const name = requestedBy.replace(/^agent:/, "").replace(/@v\d+$/, "");
  return { kind: "agent", id: requestedBy, label: `${name} agent`, onBehalfOf };
}

/** Drives a plan for any caller that can supply the run function (used by sweeps and tests). */
export { drive };
export type { WriteResult };
