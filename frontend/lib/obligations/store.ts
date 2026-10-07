import { isMissingMigration } from "../proposals/revision-store";
import type { WriteResult } from "../accounts/store";
import { createContractAllocations } from "../allocations/store";
import { allocationTaskTitle } from "../allocations/model";
import { createProject, listProjects } from "../projects/store";
import { isTerminal } from "../projects/model";
import { loadProof } from "../contracts/evidence-store";
import { dateInForce, loadDateChanges, type DateChangeRow } from "../schedule/dates";
import { ensureDefaultDependencies, loadEdges } from "../schedule/dependencies";
import {
  allowedActions, deriveStatus, eventFor, evidenceStrength, isProven, legacyProjection, matchingLegacyDone, planObligations, resolveOwner, timing, validateEvent,
  type EventInput, type EventRow, type LegacyTask, type ObligationAction, type ObligationStatus, type OwnerChoice,
} from "./model";

type Sb = any;

const notSetUp = "Obligations are not set up yet (migration 0064).";
const todayStr = () => new Date().toISOString().slice(0, 10);
const chunks = <T,>(xs: T[], n = 100) => Array.from({ length: Math.ceil(xs.length / n) }, (_, i) => xs.slice(i * n, i * n + n));
const fail = (error: { message: string; code?: string }): { ok: false; status: number; error: string } =>
  isMissingMigration(error) ? { ok: false, status: 503, error: notSetUp } : { ok: false, status: 500, error: error.message };

export interface ObligationRow {
  id: string; tenant_id: string; contract_id: string; company_id: string; project_id: string | null; allocation_id: string | null;
  source_key: string; kind: "deliverable" | "onboarding"; title: string; description: string | null; quantity: number | null; unit: string | null;
  due_date: string; due_basis: string; owner_email: string; owner_basis: string; created_by: string; created_at: string; updated_at: string;
}
const COLUMNS = "id, tenant_id, contract_id, company_id, project_id, allocation_id, source_key, kind, title, description, quantity, unit, due_date, due_basis, owner_email, owner_basis, created_by, created_at, updated_at";

type EventFull = EventRow & { obligation_id: string; evidence_kind: string | null; evidence_ref: string | null; note: string | null; reason: string | null; actor_email: string };

export interface ObligationSummary extends ObligationRow {
  /** the date in force: due_date above is the original, which never changes */
  due_date: string;
  original_due_date: string;
  moved: boolean;
  status: ObligationStatus;
  timing: ReturnType<typeof timing>;
  actions: string[];
  proof: "attached" | "stated" | "none";
}

async function loadEvents(sb: Sb, ids: string[]): Promise<EventFull[]> {
  const out: EventFull[] = [];
  for (const part of chunks(ids)) {
    const { data } = await sb.from("obligation_events").select("obligation_id, event_type, evidence_kind, evidence_ref, note, reason, actor_email, created_at").in("obligation_id", part).order("created_at", { ascending: true });
    out.push(...((data ?? []) as EventFull[]));
  }
  return out;
}

function summarise(rows: ObligationRow[], events: EventFull[], today: string, changes: DateChangeRow[] = []): ObligationSummary[] {
  return rows.map((r) => {
    const due = dateInForce(r.due_date, changes, r.id, "due_date");
    const mine = events.filter((e) => e.obligation_id === r.id);
    const status = deriveStatus(mine);
    const lastEvidence = [...mine].reverse().find((e) => e.event_type === "evidenced");
    const sinceReopen = status === "evidenced" || status === "accepted" ? evidenceStrength(lastEvidence?.evidence_kind) : "none";
    return { ...r, due_date: due, original_due_date: r.due_date, moved: due !== r.due_date, status, timing: timing(due, status, today), actions: allowedActions(status) as string[], proof: sinceReopen };
  });
}

export interface ObligationFilter { contractId?: string | null; companyId?: string | null; projectId?: string | null; status?: string | null; owner?: string | null; timing?: string | null }

export async function listObligations(sb: Sb, tenantId: string, f: ObligationFilter = {}): Promise<WriteResult<ObligationSummary[]>> {
  let q = sb.from("obligations").select(COLUMNS).eq("tenant_id", tenantId).order("due_date", { ascending: true }).limit(2000);
  if (f.contractId) q = q.eq("contract_id", f.contractId);
  if (f.companyId) q = q.eq("company_id", f.companyId);
  if (f.projectId) q = q.eq("project_id", f.projectId);
  if (f.owner) q = q.eq("owner_email", f.owner.toLowerCase());
  const { data, error } = await q;
  if (error) return fail(error);
  const rows = (data ?? []) as ObligationRow[];
  const ids = rows.map((r) => r.id);
  let out = summarise(rows, await loadEvents(sb, ids), todayStr(), await loadDateChanges(sb, tenantId, "obligation", ids));
  if (f.status) out = out.filter((o) => o.status === f.status);
  if (f.timing) out = out.filter((o) => o.timing === f.timing);
  return { ok: true, value: out };
}

// ── the handoff ─────────────────────────────────────────────────────────────

export interface HandoffReport {
  contract_id: string;
  created: number;
  already_existed: number;
  total: number;
  owner: OwnerChoice;
  project_id: string | null;
  project_created: boolean;
  marked_delivered_from_checklist: number;
  dependencies_created: number;
  warnings: string[];
}

async function tenantAdminEmail(sb: Sb, tenantId: string): Promise<string | null> {
  const { data } = await sb.from("platform_users").select("email").eq("tenant_id", tenantId).eq("role", "admin").eq("is_active", true).order("created_at", { ascending: true }).limit(1);
  return (data?.[0] as { email?: string } | undefined)?.email ?? null;
}

/**
 * Turns one active contract into owned, dated obligations, linked to its allocations, and into one
 * delivery project that holds them. Safe to run again: what already exists is recognised by its
 * source key and left alone, so a rerun adds only what is missing and never duplicates work.
 */
export async function handoffContract(sb: Sb, tenantId: string, contractId: string, actor: { email: string }): Promise<WriteResult<HandoffReport>> {
  if (!actor.email) return { ok: false, status: 403, error: "A signed-in person is required." };

  const { data: contract } = await sb.from("contracts").select("id, title, company_id, status, start_date, end_date, proposal_id, opportunity_id").eq("id", contractId).eq("tenant_id", tenantId).maybeSingle();
  if (!contract) return { ok: false, status: 404, error: "Contract not found" };
  if (!contract.company_id) return { ok: false, status: 409, error: "This contract is not linked to a company, so its work has nowhere to be owned. Link it to a company first." };
  if (contract.status !== "active") return { ok: false, status: 409, error: `Work is handed off only for an active contract; this one is "${contract.status}".` };

  const probe = await sb.from("obligations").select("id").eq("contract_id", contractId).limit(1);
  if (probe.error) return fail(probe.error);

  const warnings: string[] = [];
  let proposalContent: { deliverables?: string[]; fulfillment_tasks?: LegacyTask[] } = {};
  let proposalOpportunity: string | null = null;
  if (contract.proposal_id) {
    const { data: prop } = await sb.from("proposals").select("content, opportunity_id").eq("id", contract.proposal_id).eq("tenant_id", tenantId).maybeSingle();
    proposalContent = (prop?.content as typeof proposalContent) ?? {};
    proposalOpportunity = prop?.opportunity_id ?? null;
  }

  type AllocRow = { allocation_id: string; inventory_name: string | null; quantity: number; unit: string | null };
  const readAllocations = async (): Promise<AllocRow[]> => {
    const { data } = await sb.from("contract_allocations").select("allocation_id, inventory_name, quantity, unit").eq("contract_id", contractId).eq("tenant_id", tenantId);
    return (data ?? []) as AllocRow[];
  };
  let allocations = await readAllocations();
  if (allocations.length === 0 && contract.proposal_id) {
    const made = await createContractAllocations(sb, tenantId, contractId, contract.proposal_id);
    if (made.ok) allocations = await readAllocations();
  }

  const plan = planObligations({
    startDate: contract.start_date, endDate: contract.end_date, allocations,
    deliverables: Array.isArray(proposalContent.deliverables) ? proposalContent.deliverables : [],
    titleForAllocation: (a) => allocationTaskTitle({ inventory_name: a.inventory_name, quantity: a.quantity, unit: a.unit ?? "" }),
  });
  if (!plan.ok) return { ok: false, status: 409, error: `Cannot hand off this contract: ${plan.problems.join("; ")}.` };
  if (allocations.length === 0) warnings.push("The contract has no recorded allocations, so deliverables come from the proposal's text; they are not tied to an inventory line.");

  const oppId = contract.opportunity_id ?? proposalOpportunity;
  let opportunityOwner: string | null = null;
  if (oppId) {
    const { data: opp } = await sb.from("opportunities").select("owner_email").eq("id", oppId).eq("tenant_id", tenantId).maybeSingle();
    opportunityOwner = opp?.owner_email ?? null;
  }
  const owner = resolveOwner({ opportunityOwner, actorEmail: actor.email, tenantAdmin: await tenantAdminEmail(sb, tenantId) });
  if (!owner) return { ok: false, status: 409, error: "Cannot hand off this contract: no owner can be chosen (no opportunity owner, no signed-in person, no active admin)." };

  // What is already there stays as it is.
  const { data: have } = await sb.from("obligations").select("source_key").eq("contract_id", contractId);
  const haveKeys = new Set(((have ?? []) as Array<{ source_key: string }>).map((r) => r.source_key));
  const missing = plan.items.filter((p) => !haveKeys.has(p.source_key));

  let created: Array<{ id: string; source_key: string }> = [];
  if (missing.length > 0) {
    const rows = missing.map((p) => ({
      tenant_id: tenantId, contract_id: contractId, company_id: contract.company_id, allocation_id: p.allocation_id, source_key: p.source_key, kind: p.kind,
      title: p.title, quantity: p.quantity, unit: p.unit, due_date: p.due_date, due_basis: p.due_basis, owner_email: owner.email, owner_basis: owner.basis,
      created_by: actor.email,
    }));
    const { data, error } = await sb.from("obligations").upsert(rows, { onConflict: "contract_id,source_key", ignoreDuplicates: true }).select("id, source_key");
    if (error) return fail(error);
    created = (data ?? []) as typeof created;
  }

  // Work already ticked off in the old checklist is carried over as delivered, so nothing done is reopened.
  let carried = 0;
  const legacy = Array.isArray(proposalContent.fulfillment_tasks) ? proposalContent.fulfillment_tasks : [];
  for (const row of created) {
    const planned = missing.find((m) => m.source_key === row.source_key);
    const done = planned ? matchingLegacyDone(legacy, planned) : null;
    if (!done) continue;
    const { error } = await sb.from("obligation_events").insert({
      tenant_id: tenantId, obligation_id: row.id, event_type: "delivered", actor_email: "legacy-checklist",
      note: `Marked done in the proposal checklist${done.completed_at ? ` on ${done.completed_at.slice(0, 10)}` : ""}, before obligations existed. No proof was attached.`,
    });
    if (!error) carried++;
  }
  if (carried > 0) warnings.push(`${carried} item${carried === 1 ? " was" : "s were"} already ticked in the old checklist and carried over as delivered, without proof.`);

  // One delivery project holds them.
  let projectId: string | null = null;
  let projectCreated = false;
  const projects = await listProjects(sb, tenantId, { type: "delivery", companyId: contract.company_id });
  if (projects.ok) {
    const open = projects.value.find((p) => p.contract_id === contractId && !isTerminal(p.status));
    if (open) projectId = open.id;
    else {
      const made = await createProject(sb, tenantId, { type: "delivery", company_id: contract.company_id, contract_id: contractId, owner_email: owner.email }, actor.email);
      if (made.ok) { projectId = made.value.id; projectCreated = true; warnings.push(...made.value.warnings); }
      else warnings.push(`The delivery project was not created: ${made.error}`);
    }
  } else warnings.push(`The delivery project was not created: ${projects.error}`);
  if (projectId) await sb.from("obligations").update({ project_id: projectId }).eq("contract_id", contractId).is("project_id", null);

  // The usual order of onboarding work, so a date that slips shows what waits on it.
  const deps = await ensureDefaultDependencies(sb, tenantId, contractId, actor.email);

  await syncChecklist(sb, tenantId, contract.proposal_id);

  const all = await sb.from("obligations").select("id", { count: "exact", head: true }).eq("contract_id", contractId);
  return {
    ok: true,
    value: { contract_id: contractId, created: created.length, already_existed: haveKeys.size, total: all.count ?? haveKeys.size + created.length, owner, project_id: projectId, project_created: projectCreated, marked_delivered_from_checklist: carried, dependencies_created: deps.created, warnings },
  };
}

/** Rebuilds the checklist stored in the proposal (still read by the proposal page and the portal) from obligations. */
export async function syncChecklist(sb: Sb, tenantId: string, proposalId: string | null | undefined): Promise<void> {
  if (!proposalId) return;
  try {
    const { data: cs } = await sb.from("contracts").select("id").eq("proposal_id", proposalId).eq("tenant_id", tenantId);
    const ids = ((cs ?? []) as Array<{ id: string }>).map((c) => c.id);
    if (ids.length === 0) return;
    const { data: rows } = await sb.from("obligations").select(COLUMNS).eq("tenant_id", tenantId).in("contract_id", ids).order("created_at", { ascending: true }).order("source_key", { ascending: true });
    const list = (rows ?? []) as ObligationRow[];
    if (list.length === 0) return;
    const events = await loadEvents(sb, list.map((r) => r.id));
    const projection = legacyProjection(list.map((r) => {
      const mine = events.filter((e) => e.obligation_id === r.id);
      const status = deriveStatus(mine);
      const doneAt = [...mine].reverse().find((e) => e.event_type === "delivered" || e.event_type === "waived" || e.event_type === "evidenced")?.created_at ?? null;
      return { id: r.id, title: r.title, created_at: r.created_at, allocation_id: r.allocation_id, status, doneAt };
    }));
    const { data: prop } = await sb.from("proposals").select("content").eq("id", proposalId).eq("tenant_id", tenantId).maybeSingle();
    if (!prop) return;
    await sb.from("proposals").update({ content: { ...((prop.content as Record<string, unknown>) ?? {}), fulfillment_tasks: projection } }).eq("id", proposalId).eq("tenant_id", tenantId);
  } catch (err) {
    console.error("[obligations] checklist sync failed", err);
  }
}

// ── one obligation ──────────────────────────────────────────────────────────

export interface ObligationView extends ObligationSummary {
  history: Array<{ event_type: string; evidence_kind: string | null; evidence_ref: string | null; note: string | null; reason: string | null; actor_email: string; created_at: string }>;
  contract: { id: string; contract_number: string | null; status: string; signature: { stage: string; label: string; verified: boolean } | null } | null;
  /** what this waits on and what waits on it, with the dates in force and who owns each */
  dependencies: { waiting_on: DependencyLink[]; blocks: DependencyLink[] };
  date_history: Array<{ old_value: string; new_value: string; reason: string; changed_by: string; created_at: string; automatic: boolean }>;
}

export interface DependencyLink { dependency_id: string; id: string; title: string; owner_email: string; due_date: string; status: ObligationStatus }

export async function getObligation(sb: Sb, tenantId: string, id: string): Promise<WriteResult<ObligationView>> {
  const { data, error } = await sb.from("obligations").select(COLUMNS).eq("id", id).eq("tenant_id", tenantId).maybeSingle();
  if (error) return fail(error);
  if (!data) return { ok: false, status: 404, error: "Obligation not found" };
  const events = await loadEvents(sb, [id]);
  const changes = await loadDateChanges(sb, tenantId, "obligation", [id]);
  const [summary] = summarise([data as ObligationRow], events, todayStr(), changes);
  const edges = await loadEdges(sb, tenantId, { obligationId: id });
  const otherIds = [...new Set(edges.map((e) => (e.obligation_id === id ? e.predecessor_id : e.obligation_id)))];
  const others = otherIds.length > 0 ? await listObligations(sb, tenantId, { contractId: data.contract_id }) : null;
  const link = (e: { id: string }, otherId: string): DependencyLink | null => {
    const o = others?.ok ? others.value.find((x) => x.id === otherId) : null;
    return o ? { dependency_id: e.id, id: o.id, title: o.title, owner_email: o.owner_email, due_date: o.due_date, status: o.status } : null;
  };
  const dependencies = {
    waiting_on: edges.filter((e) => e.obligation_id === id).map((e) => link(e, e.predecessor_id)).filter((x): x is DependencyLink => !!x),
    blocks: edges.filter((e) => e.predecessor_id === id).map((e) => link(e, e.obligation_id)).filter((x): x is DependencyLink => !!x),
  };
  const { data: c } = await sb.from("contracts").select("id, contract_number, status").eq("id", data.contract_id).eq("tenant_id", tenantId).maybeSingle();
  let signature: { stage: string; label: string; verified: boolean } | null = null;
  try {
    const proof = await loadProof(sb, tenantId, data.contract_id);
    if (proof) signature = { stage: proof.proof.stage, label: proof.proof.label, verified: proof.proof.verified };
  } catch { /* optional */ }
  return {
    ok: true,
    value: { ...summary, history: [...events].reverse().map(({ obligation_id: _o, ...e }) => e), contract: c ? { id: c.id, contract_number: c.contract_number, status: c.status, signature } : null,
      dependencies,
      date_history: [...changes].reverse().map((c) => ({ old_value: c.old_value, new_value: c.new_value, reason: c.reason, changed_by: c.changed_by, created_at: c.created_at, automatic: !!c.parent_change_id })) },
  };
}

export async function recordEvent(sb: Sb, tenantId: string, id: string, input: EventInput, actorEmail: string): Promise<WriteResult<{ status: ObligationStatus }>> {
  if (!actorEmail) return { ok: false, status: 403, error: "A signed-in person is required." };
  const view = await getObligation(sb, tenantId, id);
  if (!view.ok) return view;
  const o = view.value;

  const event = eventFor(o.status, input.action);
  if (!event) return { ok: false, status: 409, error: `A ${o.status} obligation cannot be ${input.action === "evidence" ? "given proof" : input.action + (input.action.endsWith("e") ? "d" : "ed")}. Allowed now: ${o.actions.join(", ") || "nothing"}.` };
  const problems = validateEvent(input);
  if (problems.length > 0) return { ok: false, status: 400, error: problems.join("; ") };
  if (input.action === "accept") {
    const last = o.history.find((h) => h.event_type === "delivered" || h.event_type === "evidenced");
    if (last && last.actor_email.toLowerCase() === actorEmail.toLowerCase()) return { ok: false, status: 409, error: "A different person has to accept delivery than the one who recorded it." };
  }

  const { error } = await sb.from("obligation_events").insert({
    tenant_id: tenantId, obligation_id: id, event_type: event, actor_email: actorEmail,
    evidence_kind: input.action === "evidence" ? input.evidenceKind : null, evidence_ref: input.action === "evidence" ? input.evidenceRef?.trim() : null,
    note: input.note?.trim() || null, reason: input.reason?.trim() || null,
  });
  if (error) return { ok: false, status: error.message.includes("different person") ? 409 : 500, error: error.message };

  const { data: c } = await sb.from("contracts").select("proposal_id").eq("id", o.contract_id).maybeSingle();
  await syncChecklist(sb, tenantId, c?.proposal_id);
  return { ok: true, value: { status: deriveStatus([{ event_type: event, created_at: new Date().toISOString() }]) } };
}

/** Only who owns it and how it is described can change; its dates and quantity are fixed (Task 17). */
export async function updateObligation(sb: Sb, tenantId: string, id: string, patch: { owner_email?: string; description?: string | null }): Promise<WriteResult<{ id: string }>> {
  const update: Record<string, unknown> = {};
  if (patch.owner_email !== undefined) {
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(patch.owner_email)) return { ok: false, status: 400, error: "owner_email must be a valid email" };
    update.owner_email = patch.owner_email.trim().toLowerCase();
    update.owner_basis = "assigned";
  }
  if (patch.description !== undefined) update.description = patch.description?.trim() || null;
  if (Object.keys(update).length === 0) return { ok: false, status: 400, error: "Nothing to change" };
  const { data, error } = await sb.from("obligations").update(update).eq("id", id).eq("tenant_id", tenantId).select("id").maybeSingle();
  if (error) return fail(error);
  if (!data) return { ok: false, status: 404, error: "Obligation not found" };
  return { ok: true, value: { id } };
}

// ── what is missing ─────────────────────────────────────────────────────────

export interface HandoffGaps {
  contracts_without_obligations: Array<{ contract_id: string; contract_number: string | null; title: string; reason: string }>;
  overdue: number;
  delivered_without_proof: number;
}

/** Active contracts that nothing has been handed off for, and work that is late or has no proof. */
export async function findGaps(sb: Sb, tenantId: string): Promise<WriteResult<HandoffGaps>> {
  const { data: contracts, error } = await sb.from("contracts").select("id, contract_number, title, company_id, start_date, end_date").eq("tenant_id", tenantId).eq("status", "active");
  if (error) return fail(error);
  const all = await listObligations(sb, tenantId);
  if (!all.ok) return all;
  const withWork = new Set(all.value.map((o) => o.contract_id));
  const out: HandoffGaps["contracts_without_obligations"] = [];
  for (const c of (contracts ?? []) as Array<{ id: string; contract_number: string | null; title: string; company_id: string | null; start_date: string | null; end_date: string | null }>) {
    if (withWork.has(c.id)) continue;
    const reason = !c.company_id ? "not linked to a company" : !c.start_date || !c.end_date ? "missing start or end date" : "handoff has not been run";
    out.push({ contract_id: c.id, contract_number: c.contract_number, title: c.title, reason });
  }
  return { ok: true, value: { contracts_without_obligations: out, overdue: all.value.filter((o) => o.timing === "overdue").length, delivered_without_proof: all.value.filter((o) => o.status === "delivered").length } };
}

export type { ObligationAction };
