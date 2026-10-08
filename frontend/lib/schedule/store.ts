import { isMissingMigration } from "../proposals/revision-store";
import type { WriteResult } from "../accounts/store";
import { getObligation, listObligations, type ObligationSummary } from "../obligations/store";
import { isProven } from "../obligations/model";
import { getProject } from "../projects/store";
import { isTerminal } from "../projects/model";
import { asEdges, loadEdges } from "./dependencies";
import {
  impactOfObligationMove, impactOfProjectMove, isIsoDate, unresolvedAfterCascade, validateMove, wouldCycle,
  type Conflict, type DateField, type Node, type ObligationImpact, type ProjectImpact,
} from "./model";

type Sb = any;

const notSetUp = "Dependencies and date changes are not set up yet (migration 0065).";
const todayStr = () => new Date().toISOString().slice(0, 10);

/** A refusal that carries what would be affected, so the caller can show it. */
export type MoveResult<T> = { ok: true; value: T } | { ok: false; status: number; error: string; impact?: ObligationImpact | ProjectImpact; conflicts?: Conflict[] };

const asNode = (o: ObligationSummary): Node => ({ id: o.id, title: o.title, owner_email: o.owner_email, due: o.due_date, finished: isProven(o.status) });

// ── obligations ─────────────────────────────────────────────────────────────

async function obligationContext(sb: Sb, tenantId: string, id: string) {
  const one = await getObligation(sb, tenantId, id);
  if (!one.ok) return one;
  const o = one.value;
  const siblings = await listObligations(sb, tenantId, { contractId: o.contract_id });
  if (!siblings.ok) return siblings;
  const edges = asEdges(await loadEdges(sb, tenantId, { contractId: o.contract_id }));
  const { data: contract } = await sb.from("contracts").select("end_date").eq("id", o.contract_id).eq("tenant_id", tenantId).maybeSingle();
  let projectEnd: string | null = null;
  if (o.project_id) {
    const p = await getProject(sb, tenantId, o.project_id);
    if (p.ok && !isTerminal(p.value.status)) projectEnd = p.value.period_end;
  }
  return { ok: true as const, value: { obligation: o, nodes: siblings.value.map(asNode), edges, contractEnd: (contract?.end_date as string | null) ?? null, projectEnd } };
}

/** What moving this obligation's date would do, and whose work it touches. Changes nothing. */
export async function previewObligationMove(sb: Sb, tenantId: string, id: string, newDue: string | null | undefined): Promise<WriteResult<ObligationImpact>> {
  const ctx = await obligationContext(sb, tenantId, id);
  if (!ctx.ok) return ctx;
  const { obligation: o } = ctx.value;
  if (isProven(o.status)) return { ok: false, status: 409, error: `This obligation is ${o.status}; its date no longer applies. Reopen it first if it was not really finished.` };
  const problems = validateMove({ current: o.due_date, newValue: newDue, reason: "preview" });
  if (problems.length > 0) return { ok: false, status: 400, error: problems.join("; ") };
  const impact = impactOfObligationMove(ctx.value, id, newDue!);
  return impact ? { ok: true, value: impact } : { ok: false, status: 404, error: "Obligation not found" };
}

export interface MoveInput { newDue: string; reason: string; cascade?: boolean; acknowledge?: boolean }

/**
 * Moves an obligation's date and records it with what it affected. Refused while the move leaves
 * work due before what it waits on, or outside the contract or delivery period, unless the person
 * acknowledges that. With cascade, later work that would fall due before it moves along with it.
 */
export async function moveObligation(sb: Sb, tenantId: string, id: string, input: MoveInput, actorEmail: string): Promise<MoveResult<{ change_id: string; cascaded: number; impact: ObligationImpact }>> {
  if (!actorEmail) return { ok: false, status: 403, error: "A signed-in person is required." };
  const preview = await previewObligationMove(sb, tenantId, id, input.newDue);
  if (!preview.ok) return preview;
  const impact = preview.value;
  const problems = validateMove({ current: impact.subject.current_due, newValue: input.newDue, reason: input.reason });
  if (problems.length > 0) return { ok: false, status: 400, error: problems.join("; ") };

  const standing = input.cascade ? unresolvedAfterCascade(impact) : impact.conflicts;
  if (standing.length > 0 && !input.acknowledge) {
    return { ok: false, status: 409, error: `This move leaves ${standing.length} conflict${standing.length === 1 ? "" : "s"}: ${standing.map((c) => c.message).join("; ")}. Acknowledge them, or ${input.cascade ? "fix them first" : "cascade the later work"}.`, impact, conflicts: standing };
  }

  const one = await getObligation(sb, tenantId, id);
  if (!one.ok) return one;
  const o = one.value;
  const snapshot = { ...impact, decision: { cascade: !!input.cascade, acknowledged_conflicts: standing.map((c) => c.message) } };
  const { data: root, error } = await sb.from("date_changes").insert({
    tenant_id: tenantId, company_id: o.company_id, subject_kind: "obligation", subject_id: id, field: "due_date",
    old_value: impact.subject.current_due, new_value: input.newDue, reason: input.reason.trim(), changed_by: actorEmail, impact: snapshot,
  }).select("id").single();
  if (error) return fromDbError(error);

  let cascaded = 0;
  if (input.cascade) {
    for (const d of impact.downstream.filter((x) => x.becomes_late && !x.finished)) {
      const { error: e2 } = await sb.from("date_changes").insert({
        tenant_id: tenantId, company_id: o.company_id, subject_kind: "obligation", subject_id: d.id, field: "due_date",
        old_value: d.due, new_value: input.newDue, reason: `Moved with "${impact.subject.title}": ${input.reason.trim()}`, changed_by: actorEmail,
        parent_change_id: root.id, impact: { caused_by: id, owners: [d.owner_email] },
      });
      if (!e2) cascaded++;
    }
  }
  return { ok: true, value: { change_id: root.id, cascaded, impact } };
}

function fromDbError(error: { message: string; code?: string }): { ok: false; status: number; error: string } {
  if (isMissingMigration(error)) return { ok: false, status: 503, error: notSetUp };
  if (/already moved/.test(error.message)) return { ok: false, status: 409, error: error.message };
  return { ok: false, status: 500, error: error.message };
}

// ── projects ────────────────────────────────────────────────────────────────

const PROJECT_FIELDS: Record<"commercial" | "delivery", DateField[]> = { commercial: ["target_date"], delivery: ["period_start", "period_end"] };

async function projectContext(sb: Sb, tenantId: string, projectId: string, field: string) {
  const view = await getProject(sb, tenantId, projectId);
  if (!view.ok) return view;
  const p = view.value;
  if (isTerminal(p.status)) return { ok: false as const, status: 409, error: `A ${p.status} project's dates cannot be moved.` };
  if (!(PROJECT_FIELDS[p.project_type] as string[]).includes(field)) return { ok: false as const, status: 400, error: `A ${p.project_type} project's movable dates are: ${PROJECT_FIELDS[p.project_type].join(", ")}.` };
  return { ok: true as const, value: p };
}

export async function previewProjectMove(sb: Sb, tenantId: string, projectId: string, field: string, newValue: string | null | undefined): Promise<WriteResult<ProjectImpact>> {
  const ctx = await projectContext(sb, tenantId, projectId, field);
  if (!ctx.ok) return ctx;
  const p = ctx.value;
  const current = (p[field as "period_start" | "period_end" | "target_date"] as string | null) ?? "";
  const problems = validateMove({ current, newValue, reason: "preview" });
  if (problems.length > 0) return { ok: false, status: 400, error: problems.join("; ") };
  const nv = newValue!;
  if (field === "target_date" && nv < todayStr()) return { ok: false, status: 400, error: "A target date cannot be moved into the past." };
  if (field === "period_end" && p.period_start && nv < p.period_start) return { ok: false, status: 400, error: `The period cannot end (${nv}) before it starts (${p.period_start}).` };
  if (field === "period_start" && p.period_end && nv > p.period_end) return { ok: false, status: 400, error: `The period cannot start (${nv}) after it ends (${p.period_end}).` };

  let work: Node[] = [];
  let contractEnd: string | null = null;
  if (p.project_type === "delivery") {
    const obs = await listObligations(sb, tenantId, { projectId });
    if (obs.ok) work = obs.value.map(asNode);
    if (p.contract_id) {
      const { data: c } = await sb.from("contracts").select("end_date").eq("id", p.contract_id).eq("tenant_id", tenantId).maybeSingle();
      contractEnd = (c?.end_date as string | null) ?? null;
    }
  }
  return { ok: true, value: impactOfProjectMove({ type: p.project_type, field: field as DateField, current, newValue: nv, periodStart: p.period_start, periodEnd: p.period_end, contractEnd, work, owner_email: p.owner_email }) };
}

export async function moveProjectDate(sb: Sb, tenantId: string, projectId: string, input: { field: string; newValue: string; reason: string; acknowledge?: boolean }, actorEmail: string): Promise<MoveResult<{ change_id: string; impact: ProjectImpact }>> {
  if (!actorEmail) return { ok: false, status: 403, error: "A signed-in person is required." };
  const preview = await previewProjectMove(sb, tenantId, projectId, input.field, input.newValue);
  if (!preview.ok) return preview;
  const impact = preview.value;
  const problems = validateMove({ current: impact.current, newValue: input.newValue, reason: input.reason });
  if (problems.length > 0) return { ok: false, status: 400, error: problems.join("; ") };
  if (impact.conflicts.length > 0 && !input.acknowledge) {
    return { ok: false, status: 409, error: `This move leaves ${impact.conflicts.length} conflict${impact.conflicts.length === 1 ? "" : "s"}: ${impact.conflicts.map((c) => c.message).join("; ")}. Acknowledge them, or move that work first.`, impact, conflicts: impact.conflicts };
  }
  const view = await getProject(sb, tenantId, projectId);
  if (!view.ok) return view;
  const { data, error } = await sb.from("date_changes").insert({
    tenant_id: tenantId, company_id: view.value.company_id, subject_kind: "project", subject_id: projectId, field: input.field,
    old_value: impact.current, new_value: input.newValue, reason: input.reason.trim(), changed_by: actorEmail,
    impact: { ...impact, decision: { acknowledged_conflicts: impact.conflicts.map((c) => c.message) } },
  }).select("id").single();
  if (error) return fromDbError(error);
  return { ok: true, value: { change_id: data.id, impact } };
}

// ── dependencies ────────────────────────────────────────────────────────────

export async function addDependency(sb: Sb, tenantId: string, obligationId: string, predecessorId: string, actorEmail: string): Promise<WriteResult<{ id: string; warnings: string[] }>> {
  if (!actorEmail) return { ok: false, status: 403, error: "A signed-in person is required." };
  if (obligationId === predecessorId) return { ok: false, status: 400, error: "An obligation cannot wait on itself." };
  const a = await getObligation(sb, tenantId, obligationId);
  if (!a.ok) return a;
  const b = await getObligation(sb, tenantId, predecessorId);
  if (!b.ok) return { ok: false, status: 404, error: "The obligation it should wait on was not found." };
  if (a.value.contract_id !== b.value.contract_id) return { ok: false, status: 409, error: "A dependency links two obligations of the same contract." };
  if (isProven(a.value.status)) return { ok: false, status: 409, error: `This obligation is already ${a.value.status}; there is nothing left to wait on.` };

  const edges = await loadEdges(sb, tenantId, { contractId: a.value.contract_id });
  if (edges.some((e) => e.obligation_id === obligationId && e.predecessor_id === predecessorId)) return { ok: false, status: 409, error: "It already waits on that obligation." };
  if (wouldCycle(asEdges(edges), obligationId, predecessorId)) return { ok: false, status: 409, error: `That would make the work wait on itself: "${b.value.title}" already (directly or through others) waits on "${a.value.title}".` };

  const warnings: string[] = [];
  if (!isProven(b.value.status) && b.value.due_date > a.value.due_date) warnings.push(`"${b.value.title}" is due ${b.value.due_date}, after "${a.value.title}" (${a.value.due_date}), which now waits on it. Move one of the dates.`);
  const { data, error } = await sb.from("obligation_dependencies").insert({ tenant_id: tenantId, contract_id: a.value.contract_id, obligation_id: obligationId, predecessor_id: predecessorId, basis: "manual", created_by: actorEmail }).select("id").single();
  if (error) {
    if (isMissingMigration(error)) return { ok: false, status: 503, error: notSetUp };
    return { ok: false, status: error.code === "23505" || /itself|same contract/.test(error.message) ? 409 : 500, error: error.message };
  }
  return { ok: true, value: { id: data.id, warnings } };
}

export async function removeDependency(sb: Sb, tenantId: string, obligationId: string, dependencyId: string, reason: string | null | undefined, actorEmail: string): Promise<WriteResult<{ id: string }>> {
  if (!actorEmail) return { ok: false, status: 403, error: "A signed-in person is required." };
  if (!reason || reason.trim().length < 5) return { ok: false, status: 400, error: "A reason (5+ characters) is required to end a dependency." };
  const { data: dep, error: readErr } = await sb.from("obligation_dependencies").select("id, removed_at").eq("id", dependencyId).eq("tenant_id", tenantId).eq("obligation_id", obligationId).maybeSingle();
  if (readErr) return isMissingMigration(readErr) ? { ok: false, status: 503, error: notSetUp } : { ok: false, status: 500, error: readErr.message };
  if (!dep) return { ok: false, status: 404, error: "Dependency not found" };
  if (dep.removed_at) return { ok: false, status: 409, error: "That dependency has already been ended." };
  const { error } = await sb.from("obligation_dependencies").update({ removed_at: new Date().toISOString(), removed_by: actorEmail, removed_reason: reason.trim() }).eq("id", dependencyId).eq("tenant_id", tenantId);
  if (error) return { ok: false, status: 500, error: error.message };
  return { ok: true, value: { id: dependencyId } };
}

// ── history ─────────────────────────────────────────────────────────────────

export interface DateChangeView {
  id: string; subject_kind: string; subject_id: string; subject_title: string | null; field: string; old_value: string; new_value: string; reason: string;
  changed_by: string; automatic: boolean; owners_affected: string[]; created_at: string;
}

export async function listDateChanges(sb: Sb, tenantId: string, f: { companyId?: string | null; subjectId?: string | null; limit?: number } = {}): Promise<WriteResult<DateChangeView[]>> {
  let q = sb.from("date_changes").select("id, subject_kind, subject_id, field, old_value, new_value, reason, changed_by, parent_change_id, impact, created_at").eq("tenant_id", tenantId).order("created_at", { ascending: false }).limit(Math.min(f.limit ?? 200, 500));
  if (f.companyId) q = q.eq("company_id", f.companyId);
  if (f.subjectId) q = q.eq("subject_id", f.subjectId);
  const { data, error } = await q;
  if (error) return isMissingMigration(error) ? { ok: false, status: 503, error: notSetUp } : { ok: false, status: 500, error: error.message };
  const rows = (data ?? []) as Array<{ id: string; subject_kind: string; subject_id: string; field: string; old_value: string; new_value: string; reason: string; changed_by: string; parent_change_id: string | null; impact: { owners?: string[] } | null; created_at: string }>;
  const ids = rows.filter((r) => r.subject_kind === "obligation").map((r) => r.subject_id);
  const titles = new Map<string, string>();
  if (ids.length > 0) {
    const { data: obs } = await sb.from("obligations").select("id, title").eq("tenant_id", tenantId).in("id", [...new Set(ids)].slice(0, 200));
    for (const o of (obs ?? []) as Array<{ id: string; title: string }>) titles.set(o.id, o.title);
  }
  return {
    ok: true,
    value: rows.map((r) => ({
      id: r.id, subject_kind: r.subject_kind, subject_id: r.subject_id, subject_title: titles.get(r.subject_id) ?? null, field: r.field, old_value: r.old_value, new_value: r.new_value,
      reason: r.reason, changed_by: r.changed_by, automatic: !!r.parent_change_id, owners_affected: r.impact?.owners ?? [], created_at: r.created_at,
    })),
  };
}

export { isIsoDate };
