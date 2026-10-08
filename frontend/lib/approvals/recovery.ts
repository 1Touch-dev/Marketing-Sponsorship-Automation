import type { WriteResult } from "../accounts/store";
import { isMissingMigration } from "../proposals/revision-store";
import { block, cancel, transition, type Who } from "../actions/engine";
import { supabaseRpc } from "../actions/broker";

type Sb = any;

/** A run paused for approval for longer than this with nobody acting on it is surfaced, not left to sit. */
export const STALE_RUN_DAYS = 7;

export interface BlockRow {
  id: string; subject_type: "agent_action" | "agent_run"; subject_id: string; reviewer_email: string | null; reason: string; due_at: string | null;
  escalated_to: string; status: "open" | "resolved"; created_at: string; resolved_at: string | null; resolved_by: string | null; resolution: string | null; resolution_note: string | null;
}
const COLS = "id, subject_type, subject_id, reviewer_email, reason, due_at, escalated_to, status, created_at, resolved_at, resolved_by, resolution, resolution_note";

const notSetUp = "Approval recovery is not set up yet (migration 0070).";

export async function listBlocks(sb: Sb, tenantId: string, status: "open" | "resolved" | "all" = "open"): Promise<WriteResult<BlockRow[]>> {
  let q = sb.from("approval_blocks").select(COLS).eq("tenant_id", tenantId).order("created_at", { ascending: false }).limit(200);
  if (status !== "all") q = q.eq("status", status);
  const { data, error } = await q;
  if (error) return isMissingMigration(error) ? { ok: false, status: 503, error: notSetUp } : { ok: false, status: 500, error: error.message };
  return { ok: true, value: (data ?? []) as BlockRow[] };
}

/** True while a run or action is blocked: nothing may approve or resume it until an administrator has dealt with it. */
export async function hasOpenBlock(sb: Sb, subjectType: BlockRow["subject_type"], subjectId: string): Promise<BlockRow | null> {
  const { data, error } = await sb.from("approval_blocks").select(COLS).eq("subject_type", subjectType).eq("subject_id", subjectId).eq("status", "open").maybeSingle();
  return error ? null : ((data as BlockRow | null) ?? null);
}

export interface ScanResult { checked: { actions: number; runs: number }; blocked: Array<{ subject_type: string; subject_id: string; reason: string }>; cannot_escalate: string | null }

const hasStanding = (users: Array<{ email: string; role: string }>, email: string | null, roles: string[]) =>
  !!email && users.some((u) => u.email.toLowerCase() === email.toLowerCase() && roles.includes(u.role));

/**
 * Finds approvals that can no longer be given by the person they are waiting on, or by anyone, and blocks them with a
 * reason and a path out, instead of leaving them to sit. Run when someone is deactivated or loses a role, and on a schedule.
 */
export async function scanApprovals(sb: Sb, tenantId: string, now = new Date()): Promise<WriteResult<ScanResult>> {
  const { data: users, error: uErr } = await sb.from("platform_users").select("email, role").eq("tenant_id", tenantId).eq("is_active", true);
  if (uErr) return { ok: false, status: 500, error: uErr.message };
  const active = (users ?? []) as Array<{ email: string; role: string }>;
  const admin = active.find((u) => u.role === "admin")?.email ?? null;
  const out: ScanResult = { checked: { actions: 0, runs: 0 }, blocked: [], cannot_escalate: admin ? null : "There is no active administrator to escalate to." };

  const effects = await sb.from("agent_effects").select("effect, approver_roles");
  if (effects.error) return isMissingMigration(effects.error) ? { ok: false, status: 503, error: notSetUp } : { ok: false, status: 500, error: effects.error.message };
  const rolesOf = new Map<string, string[]>(((effects.data ?? []) as Array<{ effect: string; approver_roles: string[] }>).map((e) => [e.effect, e.approver_roles]));

  const rpc = supabaseRpc(sb);
  const { data: waiting } = await sb.from("agent_actions").select("id, effect, reviewer_email, review_due_at").eq("tenant_id", tenantId).eq("state", "awaiting_approval");
  for (const a of (waiting ?? []) as Array<{ id: string; effect: string; reviewer_email: string | null; review_due_at: string | null }>) {
    out.checked.actions++;
    const roles = rolesOf.get(a.effect) ?? ["admin"];
    let reason: string | null = null;
    if (a.reviewer_email && !hasStanding(active, a.reviewer_email, roles)) reason = `The reviewer ${a.reviewer_email} is no longer an active member who can approve this.`;
    else if (!a.reviewer_email && !active.some((u) => roles.includes(u.role))) reason = "Nobody in the club currently holds a role that can approve this.";
    else if (a.review_due_at && new Date(a.review_due_at) < now) reason = `The review was due ${a.review_due_at.slice(0, 10)} and nobody has acted on it.`;
    if (!reason) continue;
    if (!admin) continue;
    const r = await block(rpc, a.id, reason, admin);
    if (r.ok) out.blocked.push({ subject_type: "agent_action", subject_id: a.id, reason });
  }

  const { data: runs } = await sb.from("agent_runs").select("id, status, updated_at").eq("tenant_id", tenantId).in("status", ["paused_for_approval", "paused_for_proposal_approval"]);
  for (const run of (runs ?? []) as Array<{ id: string; status: string; updated_at: string }>) {
    out.checked.runs++;
    if (await hasOpenBlock(sb, "agent_run", run.id)) continue;
    const approvers = active.some((u) => u.role === "admin" || u.role === "approver");
    const ageDays = (now.getTime() - new Date(run.updated_at).getTime()) / 86_400_000;
    let reason: string | null = null;
    if (!approvers) reason = "Nobody in the club currently holds a role that can approve this run.";
    else if (ageDays > STALE_RUN_DAYS) reason = `This run has been waiting for approval for ${Math.floor(ageDays)} days.`;
    if (!reason || !admin) continue;
    const ins = await sb.from("approval_blocks").insert({ tenant_id: tenantId, subject_type: "agent_run", subject_id: run.id, reviewer_email: null, reason, escalated_to: admin });
    if (!ins.error) out.blocked.push({ subject_type: "agent_run", subject_id: run.id, reason });
  }
  return { ok: true, value: out };
}

export type ResolveInput = { action: "reassign" | "cancel" | "dismiss"; newReviewerEmail?: string | null; note?: string | null };

/** An administrator deals with a blocked approval: gives it to someone who can act on it, cancels it, or says it is no longer a problem. */
export async function resolveBlock(sb: Sb, tenantId: string, blockId: string, input: ResolveInput, actor: { id: string; email: string }): Promise<WriteResult<{ id: string; resolution: string }>> {
  const { data: b } = await sb.from("approval_blocks").select(COLS).eq("id", blockId).eq("tenant_id", tenantId).maybeSingle();
  if (!b) return { ok: false, status: 404, error: "Blocked approval not found" };
  const row = b as BlockRow;
  if (row.status !== "open") return { ok: false, status: 409, error: "That blocked approval was already resolved." };
  const rpc = supabaseRpc(sb);
  const who: Who = { kind: "human", id: actor.id, email: actor.email };

  if (row.subject_type === "agent_action") {
    if (input.action === "reassign") {
      const r = await transition(rpc, row.subject_id, "awaiting_approval", who, { new_reviewer_email: input.newReviewerEmail ?? null, note: input.note ?? null });
      return r.ok ? { ok: true, value: { id: blockId, resolution: "reassigned" } } : { ok: false, status: r.failure.kind === "STANDING" ? 409 : 500, error: r.failure.message };
    }
    if (input.action === "cancel") {
      const r = await cancel(rpc, row.subject_id, who, input.note ?? undefined);
      return r.ok ? { ok: true, value: { id: blockId, resolution: "cancelled" } } : { ok: false, status: 409, error: r.failure.message };
    }
    return { ok: false, status: 400, error: "An action that is blocked is reassigned or cancelled; it cannot just be dismissed." };
  }

  // a paused agent run
  if (input.action === "reassign") {
    const { data: u } = input.newReviewerEmail
      ? await sb.from("platform_users").select("email, role, is_active").eq("tenant_id", tenantId).ilike("email", input.newReviewerEmail).maybeSingle()
      : { data: null };
    if (input.newReviewerEmail && !(u && u.is_active && ["admin", "approver"].includes(u.role))) return { ok: false, status: 409, error: `${input.newReviewerEmail} is not an active member who can approve this.` };
    if (!input.newReviewerEmail && !(await anyApprover(sb, tenantId))) return { ok: false, status: 409, error: "Nobody in the club can approve this right now." };
  }
  if (input.action === "cancel") await sb.from("agent_runs").update({ status: "cancelled", updated_at: new Date().toISOString() }).eq("id", row.subject_id).eq("tenant_id", tenantId);
  const resolution = input.action === "reassign" ? "reassigned" : input.action === "cancel" ? "cancelled" : "dismissed";
  const upd = await sb.from("approval_blocks").update({ status: "resolved", resolved_at: new Date().toISOString(), resolved_by: actor.email, resolution, resolution_note: input.note ?? null }).eq("id", blockId).eq("status", "open");
  return upd.error ? { ok: false, status: 500, error: upd.error.message } : { ok: true, value: { id: blockId, resolution } };
}

async function anyApprover(sb: Sb, tenantId: string): Promise<boolean> {
  const { data } = await sb.from("platform_users").select("id").eq("tenant_id", tenantId).eq("is_active", true).in("role", ["admin", "approver"]).limit(1);
  return (data?.length ?? 0) > 0;
}
