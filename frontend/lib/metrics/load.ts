import {
  DEFINITIONS, LIVE_STATUSES, OPEN_PIPELINE_STATUSES, PROPOSAL_STAGES, contractedValue, percent, pipelineRange,
  type MetricId, type MetricUnit, type MetricValue, type MetricsSnapshot,
} from "./definitions";

type Sb = any;

function metric(id: MetricId, unit: MetricUnit, value: number | null, more: Partial<MetricValue> = {}): MetricValue {
  const d = DEFINITIONS[id];
  return { id, label: d.label, unit, value, definition: d.definition, source: d.source, href: d.href, caveats: [], ...more };
}

async function count(q: PromiseLike<{ count: number | null; error: { message: string } | null }>): Promise<{ n: number | null; error?: string }> {
  const r = await q;
  return r.error ? { n: null, error: r.error.message } : { n: r.count ?? 0 };
}

/** Counts a failed query as "not computable", never as zero. */
function counted(id: MetricId, c: { n: number | null; error?: string }, more: Partial<MetricValue> = {}) {
  return metric(id, "count", c.n, c.error ? { ...more, caveats: [...(more.caveats ?? []), `Could not be computed: ${c.error}`] } : more);
}

export async function loadMetrics(sb: Sb, tenantId: string): Promise<MetricsSnapshot> {
  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);

  const sent = () => sb.from("emails").select("id", { count: "exact", head: true }).eq("tenant_id", tenantId).eq("status", "sent");

  const [proposalsRes, contractsRes, awaitingEmails, markedSent, sentThisMonth, opened, clicked, packagesRes] = await Promise.all([
    sb.from("proposals").select("id, status").eq("tenant_id", tenantId),
    sb.from("contracts").select("id, proposal_id, status, total_value_brl").eq("tenant_id", tenantId),
    count(sb.from("emails").select("id", { count: "exact", head: true }).eq("tenant_id", tenantId).eq("status", "pending_approval")),
    count(sent()),
    count(sent().gte("sent_at", monthStart.toISOString())),
    count(sent().not("opened_at", "is", null)),
    count(sent().not("clicked_at", "is", null)),
    sb.from("proposal_packages").select("proposal_id, price_brl, proposals!inner(status)").eq("tenant_id", tenantId).in("proposals.status", OPEN_PIPELINE_STATUSES),
  ]);

  const out: Record<string, MetricValue> = {};
  const add = (m: MetricValue) => { out[m.id] = m; };

  // ── Proposals, tallied from one read so every stage count comes from the same moment
  const proposalRows = (proposalsRes.error ? null : proposalsRes.data ?? []) as Array<{ id: string; status: string }> | null;
  const tally = (statuses: readonly string[]) => (proposalRows ? proposalRows.filter((p) => statuses.includes(p.status)).length : null);
  const proposalsError = proposalsRes.error ? [`Could not be computed: ${proposalsRes.error.message}`] : [];
  const stage = (id: MetricId, statuses: readonly string[]) => add(metric(id, "count", tally(statuses), { caveats: proposalsError }));

  stage("proposals_live", LIVE_STATUSES);
  stage("proposals_awaiting_approval", PROPOSAL_STAGES.awaiting_approval);
  stage("proposals_sent_back", PROPOSAL_STAGES.sent_back);
  stage("proposals_approved", PROPOSAL_STAGES.approved);
  stage("proposals_won", PROPOSAL_STAGES.won);
  stage("proposals_lost", PROPOSAL_STAGES.lost);

  // ── Approvals: everything an approver has to decide on right now
  add(counted("emails_awaiting_approval", awaitingEmails));
  const awaitingProposals = out.proposals_awaiting_approval.value;
  add(metric("approvals_pending_total", "count", awaitingProposals !== null && awaitingEmails.n !== null ? awaitingProposals + awaitingEmails.n : null, {
    extra: { proposals: awaitingProposals ?? 0, emails: awaitingEmails.n ?? 0 },
  }));

  // ── Contracts
  const contractRows = (contractsRes.error ? null : contractsRes.data ?? []) as Array<{ id: string; proposal_id: string | null; status: string; total_value_brl: number | null }> | null;
  const contractsError = contractsRes.error ? [`Could not be computed: ${contractsRes.error.message}`] : [];
  const active = contractRows?.filter((c) => c.status === "active") ?? [];
  const wonIds = proposalRows ? proposalRows.filter((p) => (PROPOSAL_STAGES.won as readonly string[]).includes(p.status)).map((p) => p.id) : [];
  const withRecord = new Set((contractRows ?? []).map((c) => c.proposal_id).filter(Boolean));
  const wonWithoutContract = proposalRows && contractRows ? wonIds.filter((id) => !withRecord.has(id)).length : null;

  const wonCount = out.proposals_won.value;
  add(metric("contracts_active", "count", contractRows ? active.length : null, {
    caveats: [...contractsError, ...(wonCount !== null && contractRows && wonCount !== active.length ? [`${wonCount} proposals are marked in contract, but there are ${active.length} active contract records.`] : [])],
  }));
  add(metric("proposals_won_without_contract", "count", wonWithoutContract));

  const value = contractedValue(active);
  add(metric("contracted_value_brl", "brl", contractRows ? value.total : null, {
    extra: { contracts: value.contracts, with_value: value.withValue, without_value: value.withoutValue },
    caveats: [...contractsError, ...(value.withoutValue > 0 ? [`${value.withoutValue} of ${value.contracts} active contracts have no value recorded.`] : [])],
  }));

  // ── Emails: "sent" means logged in the CRM
  const logged = "Logged in the CRM only: this platform does not email recipients yet.";
  add(counted("emails_marked_sent", markedSent, { caveats: [logged] }));
  add(counted("emails_marked_sent_this_month", sentThisMonth, { caveats: [logged] }));
  add(counted("emails_opened", opened));
  add(counted("emails_clicked", clicked));
  const openRate = markedSent.n !== null && opened.n !== null ? percent(opened.n, markedSent.n) : null;
  add(metric("email_open_rate", "percent", openRate, { numerator: opened.n ?? 0, denominator: markedSent.n ?? 0 }));

  // ── Win rate: decided proposals only
  const won = out.proposals_won.value;
  const lost = out.proposals_lost.value;
  add(metric("win_rate", "percent", won !== null && lost !== null ? percent(won, won + lost) : null, {
    numerator: won ?? 0,
    denominator: (won ?? 0) + (lost ?? 0),
  }));

  // ── Pipeline: package options are alternatives
  const openCount = proposalRows ? proposalRows.filter((p) => OPEN_PIPELINE_STATUSES.includes(p.status as never)).length : 0;
  if (packagesRes.error) {
    add(metric("pipeline_value_brl", "brl", null, { caveats: [`Could not be computed: ${packagesRes.error.message}`] }));
  } else {
    const range = pipelineRange((packagesRes.data ?? []) as Array<{ proposal_id: string; price_brl: number | null }>, openCount);
    add(metric("pipeline_value_brl", "brl", range.low, {
      extra: { ceiling: range.high, priced_proposals: range.pricedProposals, open_proposals: range.openProposals },
      caveats: [`Priced on ${range.pricedProposals} of ${range.openProposals} open proposals.`],
    }));
  }

  return { generated_at: new Date().toISOString(), metrics: out };
}
