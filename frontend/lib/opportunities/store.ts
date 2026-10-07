import { isMissingMigration } from "../proposals/revision-store";
import { loadStage, recordQualification, type WriteResult } from "../accounts/store";
import {
  deriveOpportunityStatus, isAttachable, kindFromProposalType, KIND_LABELS, OPPORTUNITY_KINDS,
  type Actor, type OpportunityKind, type OpportunityStatus,
} from "./model";

type Sb = any;

export interface OpportunityView {
  id: string;
  company_id: string;
  kind: OpportunityKind;
  title: string;
  owner_email: string | null;
  renews_contract_id: string | null;
  created_by_kind: string;
  created_by: string;
  rule_name: string | null;
  pipedrive_deal_id: number | null;
  created_at: string;
  status: OpportunityStatus;
  proposals: Array<{ id: string; title: string; status: string; proposal_type: string | null; pipedrive_deal_id: number | null; created_at: string }>;
  contracts: Array<{ id: string; status: string; total_value_brl: number | null }>;
  last_event: { event_type: "closed" | "reopened"; reason: string; actor_email: string; created_at: string } | null;
}

const OPP_COLUMNS = "id, company_id, kind, title, owner_email, renews_contract_id, created_by_kind, created_by, rule_name, pipedrive_deal_id, created_at";
const chunks = <T,>(xs: T[], n = 100) => Array.from({ length: Math.ceil(xs.length / n) }, (_, i) => xs.slice(i * n, i * n + n));

export async function loadOpportunities(sb: Sb, tenantId: string, opts: { companyId?: string } = {}): Promise<WriteResult<OpportunityView[]>> {
  let q = sb.from("opportunities").select(OPP_COLUMNS).eq("tenant_id", tenantId).order("created_at", { ascending: true }).limit(5000);
  if (opts.companyId) q = q.eq("company_id", opts.companyId);
  const { data: opps, error } = await q;
  if (error) return { ok: false, status: isMissingMigration(error) ? 503 : 500, error: isMissingMigration(error) ? "Opportunities are not set up yet (migration 0059)." : error.message };
  const rows = (opps ?? []) as Array<Omit<OpportunityView, "status" | "proposals" | "contracts" | "last_event">>;
  const ids = rows.map((o) => o.id);

  const proposals: any[] = [], contracts: any[] = [], events: any[] = [];
  for (const part of chunks(ids)) {
    const [p, c, e] = await Promise.all([
      sb.from("proposals").select("id, title, status, proposal_type, pipedrive_deal_id, created_at, opportunity_id").in("opportunity_id", part),
      sb.from("contracts").select("id, status, total_value_brl, opportunity_id").in("opportunity_id", part),
      sb.from("opportunity_events").select("opportunity_id, event_type, reason, actor_email, created_at").in("opportunity_id", part).order("created_at", { ascending: false }),
    ]);
    proposals.push(...(p.data ?? [])); contracts.push(...(c.data ?? [])); events.push(...(e.data ?? []));
  }

  const view = rows.map((o): OpportunityView => {
    const ps = proposals.filter((p) => p.opportunity_id === o.id);
    const cs = contracts.filter((c) => c.opportunity_id === o.id);
    const last = events.find((e) => e.opportunity_id === o.id) ?? null; // newest first
    return {
      ...o,
      proposals: ps.map(({ opportunity_id: _o, ...rest }) => rest),
      contracts: cs.map(({ opportunity_id: _o, ...rest }) => rest),
      last_event: last ? { event_type: last.event_type, reason: last.reason, actor_email: last.actor_email, created_at: last.created_at } : null,
      status: deriveOpportunityStatus({
        proposalStatuses: ps.map((p) => p.status),
        hasActiveContract: cs.some((c) => c.status === "active"),
        lastEvent: last?.event_type ?? null,
      }),
    };
  });
  return { ok: true, value: view };
}

/**
 * Opens an opportunity. Only a person or the one named renewal rule can: an
 * agent cannot, so research and outreach never create a deal on their own. A
 * person opening one is also the human decision that the account is a real sales
 * opportunity, so the account is qualified if it is not already.
 */
export async function createOpportunity(
  sb: Sb,
  tenantId: string,
  companyId: string,
  input: { kind: OpportunityKind; title?: string; ownerEmail?: string | null; renewsContractId?: string | null; actor: Actor },
): Promise<WriteResult<{ id: string; qualifiedAccount: boolean }>> {
  const { actor } = input;
  if (actor.kind === "agent") return { ok: false, status: 403, error: "An agent cannot open an opportunity. A person has to." };
  if (!OPPORTUNITY_KINDS.includes(input.kind)) return { ok: false, status: 400, error: `kind must be one of ${OPPORTUNITY_KINDS.join(", ")}` };
  if (actor.kind === "human" && !actor.email) return { ok: false, status: 403, error: "An opportunity must be opened by a signed-in person." };
  if (actor.kind === "rule" && (input.kind !== "renewal" || !input.renewsContractId)) {
    return { ok: false, status: 400, error: "The only rule that opens an opportunity is the renewal of a signed contract." };
  }

  const { data: company } = await sb.from("companies").select("id, company_name").eq("id", companyId).eq("tenant_id", tenantId).maybeSingle();
  if (!company) return { ok: false, status: 404, error: "Company not found" };
  if (input.renewsContractId) {
    const { data: contract } = await sb.from("contracts").select("id").eq("id", input.renewsContractId).eq("tenant_id", tenantId).eq("company_id", companyId).maybeSingle();
    if (!contract) return { ok: false, status: 404, error: "The contract being renewed was not found for this company" };
  }

  const title = (input.title ?? "").trim() || KIND_LABELS[input.kind];
  const { data, error } = await sb
    .from("opportunities")
    .insert({
      tenant_id: tenantId,
      company_id: companyId,
      kind: input.kind,
      title,
      owner_email: input.ownerEmail ?? (actor.kind === "human" ? actor.email : null),
      renews_contract_id: input.renewsContractId ?? null,
      created_by_kind: actor.kind,
      created_by: actor.kind === "human" ? actor.email : actor.name,
      rule_name: actor.kind === "rule" ? actor.name : null,
    })
    .select("id")
    .single();
  if (error) return { ok: false, status: isMissingMigration(error) ? 503 : 500, error: isMissingMigration(error) ? "Opportunities are not set up yet (migration 0059)." : error.message };

  let qualifiedAccount = false;
  if (actor.kind === "human") {
    const stage = await loadStage(sb, tenantId, companyId);
    if (stage.ok && stage.value.stage !== "qualified") {
      const q = await recordQualification(sb, tenantId, companyId, {
        decision: "qualified",
        reason: `Opened the opportunity "${title}"`,
        actorEmail: actor.email,
        actorUserId: actor.userId ?? null,
      });
      qualifiedAccount = q.ok;
    }
  }
  return { ok: true, value: { id: data.id, qualifiedAccount } };
}

export async function closeOrReopen(
  sb: Sb,
  tenantId: string,
  opportunityId: string,
  input: { action: "close" | "reopen"; reason: string; actorEmail: string },
): Promise<WriteResult<{ status: OpportunityStatus }>> {
  if (!input.actorEmail) return { ok: false, status: 403, error: "A signed-in person has to close or reopen an opportunity." };
  if (!input.reason || input.reason.trim().length < 5) return { ok: false, status: 400, error: "A reason is required." };
  const current = await loadOpportunities(sb, tenantId);
  if (!current.ok) return current;
  const opp = current.value.find((o) => o.id === opportunityId);
  if (!opp) return { ok: false, status: 404, error: "Opportunity not found" };
  const isClosed = opp.last_event?.event_type === "closed";
  if (input.action === "close" && isClosed) return { ok: false, status: 409, error: "This opportunity is already closed." };
  if (input.action === "reopen" && !isClosed) return { ok: false, status: 409, error: "Only a closed opportunity can be reopened." };

  const { error } = await sb.from("opportunity_events").insert({
    tenant_id: tenantId,
    opportunity_id: opportunityId,
    event_type: input.action === "close" ? "closed" : "reopened",
    reason: input.reason.trim(),
    actor_email: input.actorEmail,
  });
  if (error) return { ok: false, status: 500, error: error.message };
  const after = await loadOpportunities(sb, tenantId, { companyId: opp.company_id });
  const status = after.ok ? after.value.find((o) => o.id === opportunityId)?.status ?? "draft" : "draft";
  return { ok: true, value: { status } };
}

/** Moves a proposal (and its contract) to an opportunity of the same company, or detaches it. */
export async function assignProposal(sb: Sb, tenantId: string, proposalId: string, opportunityId: string | null): Promise<WriteResult<{ opportunity_id: string | null }>> {
  const { data: proposal } = await sb.from("proposals").select("id, company_id").eq("id", proposalId).eq("tenant_id", tenantId).maybeSingle();
  if (!proposal) return { ok: false, status: 404, error: "Proposal not found" };

  if (opportunityId) {
    const opps = await loadOpportunities(sb, tenantId, { companyId: proposal.company_id });
    if (!opps.ok) return opps;
    const opp = opps.value.find((o) => o.id === opportunityId);
    if (!opp) return { ok: false, status: 404, error: "That opportunity does not belong to this proposal's company" };
    if (!isAttachable(opp.status) && !opp.proposals.some((p) => p.id === proposalId)) {
      return { ok: false, status: 409, error: `That opportunity is ${opp.status}; a proposal cannot be added to it.` };
    }
  }
  const { error } = await sb.from("proposals").update({ opportunity_id: opportunityId }).eq("id", proposalId).eq("tenant_id", tenantId);
  if (error) return { ok: false, status: 500, error: error.message };
  await sb.from("contracts").update({ opportunity_id: opportunityId }).eq("proposal_id", proposalId).eq("tenant_id", tenantId);
  return { ok: true, value: { opportunity_id: opportunityId } };
}

export interface AttachResult { opportunityId: string | null; created: boolean; reason?: string }

/**
 * Puts a freshly generated proposal under an opportunity. It joins an open one of
 * the same kind; if there is none, a person's proposal opens one, the renewal rule
 * opens a renewal, and an agent's proposal stays unattached (it never opens a deal).
 * It never throws: a proposal must not fail to save because of this.
 */
export async function attachNewProposal(
  sb: Sb,
  tenantId: string,
  companyId: string,
  proposalId: string,
  opts: { proposalType?: string | null; actor: Actor; renewsContractId?: string | null },
): Promise<AttachResult> {
  try {
    const kind: OpportunityKind = opts.renewsContractId ? "renewal" : kindFromProposalType(opts.proposalType);
    const existing = await loadOpportunities(sb, tenantId, { companyId });
    if (!existing.ok) return { opportunityId: null, created: false, reason: existing.error };

    const match = existing.value
      .filter((o) => o.kind === kind && isAttachable(o.status) && (kind !== "renewal" || o.renews_contract_id === (opts.renewsContractId ?? null)))
      .sort((a, b) => (a.created_at < b.created_at ? 1 : -1))[0];

    let opportunityId = match?.id ?? null;
    let created = false;
    if (!opportunityId) {
      if (opts.actor.kind === "agent") return { opportunityId: null, created: false, reason: "no open opportunity; an agent cannot open one" };
      const made = await createOpportunity(sb, tenantId, companyId, { kind, renewsContractId: opts.renewsContractId ?? null, actor: opts.actor });
      if (!made.ok) return { opportunityId: null, created: false, reason: made.error };
      opportunityId = made.value.id;
      created = true;
    }
    await sb.from("proposals").update({ opportunity_id: opportunityId }).eq("id", proposalId).eq("tenant_id", tenantId);
    return { opportunityId, created };
  } catch (err) {
    return { opportunityId: null, created: false, reason: err instanceof Error ? err.message : String(err) };
  }
}
