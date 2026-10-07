import { isMissingMigration } from "../proposals/revision-store";
import type { WriteResult } from "../accounts/store";
import { loadOpportunities } from "../opportunities/store";
import { loadProof } from "../contracts/evidence-store";
import {
  TYPE_DEFINITIONS, allowedActions, completionCheck, deriveStatus, eventFor, isTerminal, validateProjectInput,
  type Completion, type EventRow, type ProjectAction, type ProjectInput, type ProjectStatus, type ProjectType,
} from "./model";

type Sb = any;

const notSetUp = "Projects are not set up yet (migration 0063).";
const todayStr = () => new Date().toISOString().slice(0, 10);

export interface ProjectRow {
  id: string; tenant_id: string; project_type: ProjectType; title: string; description: string | null;
  company_id: string; opportunity_id: string | null; proposal_id: string | null; contract_id: string | null;
  owner_email: string; created_by: string; objective: string | null; target_date: string | null; next_action: string | null;
  period_start: string | null; period_end: string | null; external_system: string | null; external_id: string | null;
  created_at: string; updated_at: string;
}

export interface ProjectSummary extends ProjectRow { status: ProjectStatus; actions: string[] }

const COLUMNS = "id, tenant_id, project_type, title, description, company_id, opportunity_id, proposal_id, contract_id, owner_email, created_by, objective, target_date, next_action, period_start, period_end, external_system, external_id, created_at, updated_at";
const chunks = <T,>(xs: T[], n = 100) => Array.from({ length: Math.ceil(xs.length / n) }, (_, i) => xs.slice(i * n, i * n + n));

export async function listProjects(sb: Sb, tenantId: string, f: { type?: string | null; status?: string | null; companyId?: string | null } = {}): Promise<WriteResult<ProjectSummary[]>> {
  let q = sb.from("projects").select(COLUMNS).eq("tenant_id", tenantId).order("created_at", { ascending: false }).limit(2000);
  if (f.type) q = q.eq("project_type", f.type);
  if (f.companyId) q = q.eq("company_id", f.companyId);
  const { data, error } = await q;
  if (error) return { ok: false, status: isMissingMigration(error) ? 503 : 500, error: isMissingMigration(error) ? notSetUp : error.message };
  const rows = (data ?? []) as ProjectRow[];
  const events: Array<EventRow & { project_id: string }> = [];
  for (const part of chunks(rows.map((r) => r.id))) {
    const { data: ev } = await sb.from("project_events").select("project_id, event_type, created_at").in("project_id", part);
    events.push(...(ev ?? []));
  }
  const out = rows.map((r) => {
    const status = deriveStatus(events.filter((e) => e.project_id === r.id));
    return { ...r, status, actions: allowedActions(status) as string[] };
  });
  return { ok: true, value: f.status ? out.filter((p) => p.status === f.status) : out };
}

/** True when a project of this type already works on this opportunity or contract and is not finished. */
async function hasOpenProject(sb: Sb, tenantId: string, link: { opportunity_id?: string; contract_id?: string }): Promise<boolean> {
  const all = await listProjects(sb, tenantId);
  if (!all.ok) return false;
  return all.value.some((p) => !isTerminal(p.status) && ((link.opportunity_id && p.opportunity_id === link.opportunity_id) || (link.contract_id && p.contract_id === link.contract_id)));
}

export async function createProject(sb: Sb, tenantId: string, input: ProjectInput, actorEmail: string): Promise<WriteResult<{ id: string; warnings: string[] }>> {
  if (!actorEmail) return { ok: false, status: 403, error: "A signed-in person is required." };
  const warnings: string[] = [];
  const draft: ProjectInput = { ...input, owner_email: input.owner_email?.trim() || actorEmail };

  const { data: company } = await sb.from("companies").select("id, company_name").eq("id", input.company_id).eq("tenant_id", tenantId).maybeSingle();
  if (!company) return { ok: false, status: 404, error: "Company not found" };

  if (input.type === "delivery" && input.contract_id) {
    const { data: contract } = await sb.from("contracts").select("id, company_id, status, start_date, end_date, proposal_id, title").eq("id", input.contract_id).eq("tenant_id", tenantId).maybeSingle();
    if (!contract) return { ok: false, status: 404, error: "Contract not found" };
    if (contract.company_id !== input.company_id) return { ok: false, status: 409, error: "That contract is not linked to this company." };
    if (contract.status !== "active") return { ok: false, status: 409, error: `A delivery project needs an active contract; this one is "${contract.status}".` };
    draft.period_start = input.period_start || contract.start_date;
    draft.period_end = input.period_end || contract.end_date;
    draft.proposal_id = input.proposal_id || contract.proposal_id;
    draft.title = input.title?.trim() || `Delivery: ${contract.title ?? company.company_name}`;
    try {
      const proof = await loadProof(sb, tenantId, contract.id);
      if (proof && !proof.proof.verified) warnings.push(`The contract's signature is "${proof.proof.label}", not proven: delivery is starting on a claim, not on evidence.`);
    } catch { /* the warning is a courtesy */ }
  }

  if (input.type === "commercial" && input.opportunity_id) {
    const opps = await loadOpportunities(sb, tenantId, { companyId: input.company_id });
    if (!opps.ok) return opps;
    const opp = opps.value.find((o) => o.id === input.opportunity_id);
    if (!opp) return { ok: false, status: 404, error: "That opportunity does not belong to this company." };
    if (opp.status !== "draft" && opp.status !== "open") return { ok: false, status: 409, error: `That opportunity is ${opp.status}; a commercial project works on a deal that is still being worked.` };
    draft.title = input.title?.trim() || `Win: ${opp.title}`;
  }

  const problems = validateProjectInput(draft, todayStr());
  if (problems.length > 0) return { ok: false, status: 400, error: problems.join("; ") };

  if (await hasOpenProject(sb, tenantId, { opportunity_id: draft.opportunity_id ?? undefined, contract_id: draft.contract_id ?? undefined })) {
    return { ok: false, status: 409, error: `There is already an unfinished ${input.type} project for this ${input.type === "delivery" ? "contract" : "opportunity"}.` };
  }

  const { data, error } = await sb
    .from("projects")
    .insert({
      tenant_id: tenantId, project_type: draft.type, title: draft.title, description: draft.description?.trim() || null, company_id: draft.company_id,
      opportunity_id: draft.opportunity_id ?? null, proposal_id: draft.proposal_id ?? null, contract_id: draft.contract_id ?? null,
      owner_email: draft.owner_email, created_by: actorEmail, objective: draft.objective?.trim() || null, target_date: draft.target_date ?? null,
      next_action: draft.next_action?.trim() || null, period_start: draft.period_start ?? null, period_end: draft.period_end ?? null,
    })
    .select("id")
    .single();
  if (error) return { ok: false, status: isMissingMigration(error) ? 503 : 500, error: isMissingMigration(error) ? notSetUp : error.message };
  return { ok: true, value: { id: data.id, warnings } };
}

// ── one project, with the facts that decide whether it can finish ───────────

export interface ProjectFacts {
  opportunityStatus: string | null;
  contractStatus: string | null;
  openTasks: number | null;
  signature: { stage: string; label: string; verified: boolean } | null;
}

export async function loadFacts(sb: Sb, tenantId: string, p: ProjectRow): Promise<ProjectFacts> {
  const facts: ProjectFacts = { opportunityStatus: null, contractStatus: null, openTasks: null, signature: null };
  if (p.project_type === "commercial" && p.opportunity_id) {
    const opps = await loadOpportunities(sb, tenantId, { companyId: p.company_id });
    facts.opportunityStatus = opps.ok ? opps.value.find((o) => o.id === p.opportunity_id)?.status ?? null : null;
  }
  if (p.project_type === "delivery" && p.contract_id) {
    const { data: c } = await sb.from("contracts").select("status, proposal_id").eq("id", p.contract_id).eq("tenant_id", tenantId).maybeSingle();
    facts.contractStatus = c?.status ?? null;
    const proposalId = p.proposal_id ?? c?.proposal_id ?? null;
    if (proposalId) {
      const { data: prop } = await sb.from("proposals").select("content").eq("id", proposalId).eq("tenant_id", tenantId).maybeSingle();
      const tasks = ((prop?.content as { fulfillment_tasks?: Array<{ status: string }> } | null)?.fulfillment_tasks) ?? [];
      facts.openTasks = tasks.filter((t) => t.status !== "done").length;
    } else facts.openTasks = 0;
    try {
      const proof = await loadProof(sb, tenantId, p.contract_id);
      if (proof) facts.signature = { stage: proof.proof.stage, label: proof.proof.label, verified: proof.proof.verified };
    } catch { /* optional */ }
  }
  return facts;
}

export interface ProjectView extends ProjectSummary {
  facts: ProjectFacts;
  completion: Completion;
  definition: (typeof TYPE_DEFINITIONS)[ProjectType];
  history: Array<{ event_type: string; reason: string | null; outcome_note: string | null; actor_email: string; created_at: string }>;
}

export async function getProject(sb: Sb, tenantId: string, id: string): Promise<WriteResult<ProjectView>> {
  const { data: p, error } = await sb.from("projects").select(COLUMNS).eq("id", id).eq("tenant_id", tenantId).maybeSingle();
  if (error) return { ok: false, status: isMissingMigration(error) ? 503 : 500, error: isMissingMigration(error) ? notSetUp : error.message };
  if (!p) return { ok: false, status: 404, error: "Project not found" };
  const { data: ev } = await sb.from("project_events").select("event_type, reason, outcome_note, actor_email, created_at").eq("project_id", id).order("created_at", { ascending: false });
  const status = deriveStatus((ev ?? []) as EventRow[]);
  const facts = await loadFacts(sb, tenantId, p as ProjectRow);
  const completion = completionCheck({ type: p.project_type, today: todayStr(), opportunityStatus: facts.opportunityStatus, contractStatus: facts.contractStatus, periodEnd: p.period_end, openTasks: facts.openTasks ?? 0 });
  return { ok: true, value: { ...(p as ProjectRow), status, actions: allowedActions(status) as string[], facts, completion, definition: TYPE_DEFINITIONS[p.project_type as ProjectType], history: ev ?? [] } };
}

export async function transition(
  sb: Sb, tenantId: string, id: string,
  input: { action: ProjectAction; reason?: string | null; outcomeNote?: string | null; earlyReason?: string | null; actorEmail: string },
): Promise<WriteResult<{ status: ProjectStatus }>> {
  if (!input.actorEmail) return { ok: false, status: 403, error: "A signed-in person is required." };
  const view = await getProject(sb, tenantId, id);
  if (!view.ok) return view;
  const p = view.value;

  const event = eventFor(p.status, input.action);
  if (!event) return { ok: false, status: 409, error: `A ${p.status.replace("_", " ")} project cannot be ${input.action === "complete" ? "completed" : input.action + "d"}. Allowed now: ${p.actions.join(", ") || "nothing"}.` };

  if ((input.action === "pause" || input.action === "cancel") && (!input.reason || input.reason.trim().length < 5)) {
    return { ok: false, status: 400, error: `A reason is required to ${input.action} a project.` };
  }
  if (input.action === "start" && p.project_type === "delivery" && p.facts.contractStatus !== "active") {
    return { ok: false, status: 409, error: `The contract is "${p.facts.contractStatus ?? "missing"}", not active.` };
  }
  if (input.action === "complete") {
    const check = completionCheck({ type: p.project_type, today: todayStr(), opportunityStatus: p.facts.opportunityStatus, contractStatus: p.facts.contractStatus, periodEnd: p.period_end, openTasks: p.facts.openTasks ?? 0, outcomeNote: input.outcomeNote, earlyReason: input.earlyReason });
    if (check.blockers.length > 0 || check.inputs.length > 0) {
      return { ok: false, status: 409, error: `Cannot complete yet: ${[...check.blockers, ...check.inputs.map((i) => `write ${i}`)].join("; ")}.` };
    }
  }

  const { error } = await sb.from("project_events").insert({
    tenant_id: tenantId, project_id: id, event_type: event, actor_email: input.actorEmail,
    reason: (input.reason ?? input.earlyReason ?? null)?.trim() || null, outcome_note: input.outcomeNote?.trim() || null,
  });
  if (error) return { ok: false, status: 500, error: error.message };
  return { ok: true, value: { status: deriveStatus([{ event_type: event, created_at: new Date().toISOString() }]) } };
}

export async function updateProject(
  sb: Sb, tenantId: string, id: string,
  patch: { owner_email?: string; next_action?: string; title?: string; description?: string | null; external_system?: string | null; external_id?: string | null },
): Promise<WriteResult<{ id: string }>> {
  const view = await getProject(sb, tenantId, id);
  if (!view.ok) return view;
  if (isTerminal(view.value.status)) return { ok: false, status: 409, error: "A finished project cannot be edited." };
  const update: Record<string, unknown> = {};
  if (patch.owner_email !== undefined) {
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(patch.owner_email)) return { ok: false, status: 400, error: "owner_email must be a valid email" };
    update.owner_email = patch.owner_email.trim();
  }
  if (patch.next_action !== undefined) {
    if (view.value.project_type !== "commercial") return { ok: false, status: 400, error: "Only a commercial project has a next action." };
    if (!patch.next_action.trim()) return { ok: false, status: 400, error: "next_action cannot be empty" };
    update.next_action = patch.next_action.trim();
  }
  if (patch.title !== undefined) { if (!patch.title.trim()) return { ok: false, status: 400, error: "title cannot be empty" }; update.title = patch.title.trim(); }
  if (patch.description !== undefined) update.description = patch.description?.trim() || null;
  if (patch.external_system !== undefined || patch.external_id !== undefined) {
    if (!!patch.external_system !== !!patch.external_id) return { ok: false, status: 400, error: "Give both external_system and external_id, or neither." };
    update.external_system = patch.external_system?.trim() || null;
    update.external_id = patch.external_id?.trim() || null;
  }
  if (Object.keys(update).length === 0) return { ok: false, status: 400, error: "Nothing to change" };
  const { error } = await sb.from("projects").update(update).eq("id", id).eq("tenant_id", tenantId);
  if (error) return { ok: false, status: error.code === "23505" ? 409 : 500, error: error.code === "23505" ? "Another project already points at that external record." : error.message };
  return { ok: true, value: { id } };
}
