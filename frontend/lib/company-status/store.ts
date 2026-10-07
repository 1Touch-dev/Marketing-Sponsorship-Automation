import { isMissingMigration } from "../proposals/revision-store";
import type { WriteResult } from "../accounts/store";
import { listObligations } from "../obligations/store";
import { listProjects } from "../projects/store";
import { loadEdges } from "../schedule/dependencies";
import { loadProof } from "../contracts/evidence-store";
import { loadOpportunities } from "../opportunities/store";
import { deriveCompanyStatus, statusSignature, type CompanyStatus, type ContractFacts, type EdgeFact, type ProjectFact, type WorkFact } from "./model";

type Sb = any;

const todayStr = () => new Date().toISOString().slice(0, 10);

interface Loaded { contracts: Array<ContractFacts & { company_id: string }>; work: Array<WorkFact & { company_id: string }>; edges: EdgeFact[]; projects: Array<ProjectFact & { company_id: string }> }

async function loadFacts(sb: Sb, tenantId: string, companyId: string | null): Promise<WriteResult<Loaded>> {
  let cq = sb.from("contracts").select("id, contract_number, status, start_date, end_date, company_id").eq("tenant_id", tenantId).not("company_id", "is", null).limit(2000);
  if (companyId) cq = cq.eq("company_id", companyId);
  const { data: cs, error } = await cq;
  if (error) return { ok: false, status: 500, error: error.message };
  const contracts = (cs ?? []) as Array<{ id: string; contract_number: string | null; status: string; start_date: string | null; end_date: string | null; company_id: string }>;

  const obs = await listObligations(sb, tenantId, companyId ? { companyId } : {});
  // before migration 0064 there is no scheduled work: every contract in force reads as promised
  const work = obs.ok ? obs.value.map((o) => ({ id: o.id, contract_id: o.contract_id, company_id: o.company_id, title: o.title, owner_email: o.owner_email, due_date: o.due_date, status: o.status, proof: o.proof })) : [];
  const edges = (await loadEdges(sb, tenantId, {})).map((e) => ({ obligation_id: e.obligation_id, predecessor_id: e.predecessor_id }));
  const projs = await listProjects(sb, tenantId, { type: "delivery", companyId });
  const projects = projs.ok ? projs.value.map((p) => ({ contract_id: p.contract_id, company_id: p.company_id, project_type: p.project_type, status: p.status })) : [];

  const facts: Loaded["contracts"] = [];
  for (const c of contracts) {
    let signature: ContractFacts["signature"] = null;
    if (["active", "completed", "expired"].includes(c.status)) {
      try {
        const proof = await loadProof(sb, tenantId, c.id);
        if (proof) signature = { verified: proof.proof.verified, label: proof.proof.label };
      } catch { /* the signature line is optional */ }
    }
    facts.push({ ...c, signature });
  }
  return { ok: true, value: { contracts: facts, work, edges, projects } };
}

/** Derive one company's status now. Changes nothing. */
export async function loadCompanyStatus(sb: Sb, tenantId: string, companyId: string): Promise<WriteResult<CompanyStatus>> {
  const { data: company } = await sb.from("companies").select("id").eq("id", companyId).eq("tenant_id", tenantId).maybeSingle();
  if (!company) return { ok: false, status: 404, error: "Company not found" };
  const f = await loadFacts(sb, tenantId, companyId);
  if (!f.ok) return f;
  return { ok: true, value: deriveCompanyStatus({ companyId, today: todayStr(), contracts: f.value.contracts, work: f.value.work, edges: f.value.edges, projects: f.value.projects }) };
}

/** Every company that has a contract, with its status. Companies with nothing promised are left out. */
export async function loadCompanyStatuses(sb: Sb, tenantId: string): Promise<WriteResult<CompanyStatus[]>> {
  const f = await loadFacts(sb, tenantId, null);
  if (!f.ok) return f;
  const ids = [...new Set(f.value.contracts.map((c) => c.company_id))];
  const today = todayStr();
  const out = ids.map((id) => deriveCompanyStatus({
    companyId: id, today, contracts: f.value.contracts.filter((c) => c.company_id === id), work: f.value.work.filter((w) => w.company_id === id),
    edges: f.value.edges, projects: f.value.projects.filter((p) => p.company_id === id),
  }));
  return { ok: true, value: out };
}

/** The company's opportunities by status, so the page can show what is being sold next to what is being delivered. */
export async function opportunityCounts(sb: Sb, tenantId: string, companyId: string): Promise<Record<string, number> | null> {
  const opps = await loadOpportunities(sb, tenantId, { companyId });
  if (!opps.ok) return null;
  const out: Record<string, number> = {};
  for (const o of opps.value) out[o.status] = (out[o.status] ?? 0) + 1;
  return out;
}

// ── the log ─────────────────────────────────────────────────────────────────

export interface LogRow { id: string; delivery_status: string; at_risk: boolean; risk_reasons: Array<{ kind: string; severity: string; contract_id: string; message: string }>; counts: Record<string, number>; source: string; created_at: string }
const LOG_COLS = "id, delivery_status, at_risk, risk_reasons, counts, source, created_at";

const sigOfRow = (r: LogRow) => statusSignature({ delivery_status: r.delivery_status as CompanyStatus["delivery_status"], risks: r.risk_reasons as never });

export async function loadHistory(sb: Sb, tenantId: string, companyId: string, limit = 50): Promise<WriteResult<LogRow[]>> {
  const { data, error } = await sb.from("company_status_log").select(LOG_COLS).eq("tenant_id", tenantId).eq("company_id", companyId).order("created_at", { ascending: false }).limit(limit);
  if (error) return isMissingMigration(error) ? { ok: false, status: 503, error: "Status history is not set up yet (migration 0068)." } : { ok: false, status: 500, error: error.message };
  return { ok: true, value: (data ?? []) as LogRow[] };
}

/** When the current status and risk set began: the first row of the unbroken run that matches it. */
export function sinceOf(history: LogRow[]): string | null {
  if (history.length === 0) return null;
  const sig = sigOfRow(history[0]);
  let since = history[0].created_at;
  for (const r of history.slice(1)) { if (sigOfRow(r) === sig) since = r.created_at; else break; }
  return since;
}

async function appendIfChanged(sb: Sb, tenantId: string, status: CompanyStatus, source: string): Promise<{ logged: boolean; changed: boolean; reason?: string }> {
  const last = await sb.from("company_status_log").select(LOG_COLS).eq("tenant_id", tenantId).eq("company_id", status.company_id).order("created_at", { ascending: false }).limit(1);
  if (last.error) return { logged: false, changed: false, reason: isMissingMigration(last.error) ? "not set up" : last.error.message };
  const prev = (last.data?.[0] as LogRow | undefined) ?? null;
  // a company that never had commitments and has none now needs no row
  if (!prev && status.delivery_status === "no_commitments" && !status.at_risk) return { logged: false, changed: false };
  if (prev && sigOfRow(prev) === statusSignature(status)) return { logged: false, changed: false };
  const { error } = await sb.from("company_status_log").insert({
    tenant_id: tenantId, company_id: status.company_id, delivery_status: status.delivery_status, at_risk: status.at_risk,
    risk_reasons: status.risks.map((r) => ({ kind: r.kind, severity: r.severity, contract_id: r.contract_id, message: r.message })), counts: status.counts, source,
  });
  return error ? { logged: false, changed: false, reason: error.message } : { logged: true, changed: true };
}

/** Derive a company's status and record it if it changed. Never throws: a failed refresh must not break the action that caused it. */
export async function refreshCompanyStatus(sb: Sb, tenantId: string, companyId: string | null | undefined, source: string): Promise<{ logged: boolean; changed: boolean; reason?: string }> {
  if (!companyId) return { logged: false, changed: false, reason: "no company" };
  try {
    const s = await loadCompanyStatus(sb, tenantId, companyId);
    if (!s.ok) return { logged: false, changed: false, reason: s.error };
    return await appendIfChanged(sb, tenantId, s.value, source);
  } catch (err) {
    return { logged: false, changed: false, reason: err instanceof Error ? err.message : "failed" };
  }
}

export async function refreshForObligation(sb: Sb, tenantId: string, obligationId: string, source: string) {
  try {
    const { data } = await sb.from("obligations").select("company_id").eq("id", obligationId).eq("tenant_id", tenantId).maybeSingle();
    return refreshCompanyStatus(sb, tenantId, data?.company_id, source);
  } catch { return { logged: false, changed: false }; }
}
export async function refreshForContract(sb: Sb, tenantId: string, contractId: string, source: string) {
  try {
    const { data } = await sb.from("contracts").select("company_id").eq("id", contractId).eq("tenant_id", tenantId).maybeSingle();
    return refreshCompanyStatus(sb, tenantId, data?.company_id, source);
  } catch { return { logged: false, changed: false }; }
}
export async function refreshForProject(sb: Sb, tenantId: string, projectId: string, source: string) {
  try {
    const { data } = await sb.from("projects").select("company_id").eq("id", projectId).eq("tenant_id", tenantId).maybeSingle();
    return refreshCompanyStatus(sb, tenantId, data?.company_id, source);
  } catch { return { logged: false, changed: false }; }
}

/** Refresh every company that has a contract or a recorded status. For a daily run, or after a bulk change. */
export async function refreshAll(sb: Sb, tenantId: string, source: string): Promise<WriteResult<{ checked: number; logged: number }>> {
  const all = await loadCompanyStatuses(sb, tenantId);
  if (!all.ok) return all;
  let logged = 0;
  for (const s of all.value) { const r = await appendIfChanged(sb, tenantId, s, source); if (r.logged) logged++; }
  return { ok: true, value: { checked: all.value.length, logged } };
}
