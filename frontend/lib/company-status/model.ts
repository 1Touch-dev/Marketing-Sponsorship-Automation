/**
 * A company's delivery status, derived in one place from its contracts, obligations, proof and projects.
 * Never a field someone sets, and never read off scattered fields on a page. Pure rules only.
 *
 *   no_commitments     no contract in force: nothing has been promised yet
 *   promised           a contract is in force but its commitments have not been turned into scheduled work
 *   scheduled          the commitments exist as owned, dated obligations, and some are not yet delivered
 *   delivered          everything due is marked delivered, but not all of it has accepted evidence
 *   evidence_accepted  everything due is delivered with proof that a second person accepted
 *
 * "At risk" is not a stage but a flag over any of them, always with named reasons.
 */
import { isInForce } from "../finance/model";
import { addDays, type ObligationStatus } from "../obligations/model";

export const DELIVERY_STATUSES = ["no_commitments", "promised", "scheduled", "delivered", "evidence_accepted"] as const;
export type DeliveryStatus = (typeof DELIVERY_STATUSES)[number];

export const STATUS_DEFINITIONS: Record<DeliveryStatus, string> = {
  no_commitments: "No contract is in force, so nothing has been promised to this company yet.",
  promised: "A contract is in force, but its commitments have not been handed off as scheduled work.",
  scheduled: "The commitments exist as owned, dated obligations, and some are not yet delivered.",
  delivered: "Everything due is marked delivered, but not all of it has evidence a second person accepted.",
  evidence_accepted: "Everything due is delivered with proof that a second person accepted. (Waived items are set aside, with their reason.)",
};

const ORDER: Record<DeliveryStatus, number> = { no_commitments: 0, promised: 1, scheduled: 2, delivered: 3, evidence_accepted: 4 };

export type RiskKind = "overdue_work" | "proof_missing" | "ended_unproven" | "renewal_unproven" | "not_scheduled" | "schedule_conflict" | "project_on_hold" | "signature_unproven";

export interface Risk { kind: RiskKind; severity: "high" | "medium" | "low"; contract_id: string; message: string; fix: string }

export interface ContractFacts {
  id: string; contract_number: string | null; status: string; start_date: string | null; end_date: string | null;
  signature: { verified: boolean; label: string } | null;
}
export interface WorkFact { id: string; contract_id: string; title: string; owner_email: string; due_date: string; status: ObligationStatus; proof: "attached" | "stated" | "none" }
export interface EdgeFact { obligation_id: string; predecessor_id: string }
export interface ProjectFact { contract_id: string | null; project_type: string; status: string }

export interface ContractStatus {
  contract_id: string; contract_number: string | null; contract_status: string; in_force: boolean; delivery_status: DeliveryStatus | "not_in_force";
  obligations: number; delivered: number; evidenced: number; accepted: number; waived: number; open: number; overdue: number;
}

export interface Counts { obligations: number; delivered: number; evidenced: number; accepted: number; waived: number; open: number; overdue: number; contracts_in_force: number }

export interface CompanyStatus {
  company_id: string;
  delivery_status: DeliveryStatus;
  definition: string;
  at_risk: boolean;
  risks: Risk[];
  counts: Counts;
  contracts: ContractStatus[];
  next_due: { title: string; due_date: string; owner_email: string } | null;
  owners_with_open_work: string[];
}

const proven = (s: ObligationStatus) => s === "evidenced" || s === "accepted" || s === "waived";
const delivered = (s: ObligationStatus) => s === "delivered" || s === "evidenced" || s === "accepted";

/** The status of one contract in force, from its obligations. */
export function contractDeliveryStatus(obs: WorkFact[]): DeliveryStatus {
  if (obs.length === 0) return "promised";
  const due = obs.filter((o) => o.status !== "waived");
  if (due.length === 0) return "delivered";
  if (due.every((o) => o.status === "accepted")) return "evidence_accepted";
  if (due.every((o) => delivered(o.status))) return "delivered";
  return "scheduled";
}

export function deriveCompanyStatus(i: { companyId: string; today: string; contracts: ContractFacts[]; work: WorkFact[]; edges: EdgeFact[]; projects: ProjectFact[] }): CompanyStatus {
  const risks: Risk[] = [];
  const contracts: ContractStatus[] = [];
  const counts: Counts = { obligations: 0, delivered: 0, evidenced: 0, accepted: 0, waived: 0, open: 0, overdue: 0, contracts_in_force: 0 };
  const statuses: DeliveryStatus[] = [];
  const unfinished: WorkFact[] = [];
  const byId = new Map(i.work.map((w) => [w.id, w]));

  for (const c of i.contracts) {
    const inForce = isInForce(c.status);
    const obs = i.work.filter((w) => w.contract_id === c.id);
    const cs: ContractStatus = {
      contract_id: c.id, contract_number: c.contract_number, contract_status: c.status, in_force: inForce, delivery_status: "not_in_force",
      obligations: obs.length, delivered: obs.filter((o) => delivered(o.status)).length, evidenced: obs.filter((o) => o.status === "evidenced" || o.status === "accepted").length,
      accepted: obs.filter((o) => o.status === "accepted").length, waived: obs.filter((o) => o.status === "waived").length,
      open: obs.filter((o) => o.status === "open").length, overdue: obs.filter((o) => o.status === "open" && o.due_date < i.today).length,
    };
    contracts.push(cs);
    if (!inForce) continue;

    cs.delivery_status = contractDeliveryStatus(obs);
    statuses.push(cs.delivery_status);
    counts.contracts_in_force++;
    for (const k of ["obligations", "delivered", "evidenced", "accepted", "waived", "open", "overdue"] as const) counts[k] += cs[k];
    unfinished.push(...obs.filter((o) => !proven(o.status)));

    const label = c.contract_number ?? c.id.slice(0, 8);
    const risk = (kind: RiskKind, severity: Risk["severity"], message: string, fix: string) => risks.push({ kind, severity, contract_id: c.id, message: `Contract ${label}: ${message}`, fix });

    if (cs.overdue > 0) {
      const oldest = obs.filter((o) => o.status === "open" && o.due_date < i.today).sort((a, b) => a.due_date.localeCompare(b.due_date))[0];
      risk("overdue_work", "high", `${cs.overdue} obligation${cs.overdue === 1 ? " is" : "s are"} overdue; the oldest ("${oldest.title}", ${oldest.owner_email}) was due ${oldest.due_date}`, "Deliver it, move its date with a reason, or waive it with a reason.");
    }
    const lateNoProof = obs.filter((o) => o.status === "delivered" && o.due_date < i.today);
    if (lateNoProof.length > 0) risk("proof_missing", "high", `${lateNoProof.length} obligation${lateNoProof.length === 1 ? " is" : "s are"} marked delivered with no proof, past ${lateNoProof.length === 1 ? "its" : "their"} due date`, "Attach proof of delivery.");
    const ended = !!c.end_date && c.end_date < i.today;
    const stillUnproven = obs.filter((o) => !proven(o.status));
    if (ended && stillUnproven.length > 0) risk("ended_unproven", "high", `the contract ended ${c.end_date} with ${stillUnproven.length} obligation${stillUnproven.length === 1 ? "" : "s"} not proven delivered`, "Prove, waive or explain each one before the recap is issued.");

    const nonWaived = obs.filter((o) => o.status !== "waived");
    const share = nonWaived.length > 0 ? nonWaived.filter((o) => proven(o.status)).length / nonWaived.length : 0;
    const nearEnd = !!c.end_date && c.end_date >= i.today && c.end_date <= addDays(i.today, 60);
    if (nearEnd && obs.length > 0 && share < 0.5) risk("renewal_unproven", "medium", `it ends ${c.end_date} with only ${Math.round(share * 100)}% of the work proven delivered, so a renewal has little to stand on`, "Record delivery and proof before the renewal conversation.");
    if (obs.length === 0 && c.start_date && c.start_date <= addDays(i.today, -14)) risk("not_scheduled", "medium", `started ${c.start_date} and its commitments were never handed off as scheduled work`, "Run the contract handoff.");

    const conflicts = i.edges.filter((e) => {
      const succ = byId.get(e.obligation_id), pred = byId.get(e.predecessor_id);
      return !!succ && !!pred && succ.contract_id === c.id && !proven(succ.status) && !proven(pred.status) && succ.due_date < pred.due_date;
    });
    if (conflicts.length > 0) risk("schedule_conflict", "medium", `${conflicts.length} obligation${conflicts.length === 1 ? " is" : "s are"} due before the work ${conflicts.length === 1 ? "it waits" : "they wait"} on`, "Move one of the dates, or end the dependency, with a reason.");
    if (i.projects.some((p) => p.contract_id === c.id && p.project_type === "delivery" && p.status === "on_hold")) risk("project_on_hold", "medium", "its delivery project is on hold", "Resume the project or say why it should stay paused.");
    if (c.signature && !c.signature.verified) risk("signature_unproven", "low", `its signature is "${c.signature.label}", not proven`, "Record signature evidence (provider record, or a second person's verification).");
  }

  const delivery_status: DeliveryStatus = statuses.length === 0 ? "no_commitments" : statuses.reduce((a, b) => (ORDER[b] < ORDER[a] ? b : a));
  const next = [...unfinished].sort((a, b) => a.due_date.localeCompare(b.due_date))[0] ?? null;
  const sev = { high: 0, medium: 1, low: 2 };
  risks.sort((a, b) => sev[a.severity] - sev[b.severity]);
  return {
    company_id: i.companyId, delivery_status, definition: STATUS_DEFINITIONS[delivery_status], at_risk: risks.length > 0, risks, counts, contracts,
    next_due: next ? { title: next.title, due_date: next.due_date, owner_email: next.owner_email } : null,
    owners_with_open_work: [...new Set(unfinished.map((o) => o.owner_email))].sort(),
  };
}

/** What identifies a status for the log: it is logged only when this changes. */
export const statusSignature = (s: Pick<CompanyStatus, "delivery_status" | "risks">): string =>
  `${s.delivery_status}|${[...new Set(s.risks.map((r) => `${r.kind}:${r.contract_id}`))].sort().join(",")}`;
