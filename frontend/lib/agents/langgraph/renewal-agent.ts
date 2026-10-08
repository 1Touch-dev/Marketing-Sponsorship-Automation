/**
 * Renewal Agent — Phase 8, Team 2's third agent (`master_report.md`
 * Section 7.3): "Watches the contracts module's expiry banner (≤15/30/60
 * days) and auto-drafts renewal proposals from the 'Renovar' flow, pausing
 * for approval."
 *
 * `contracts.renewed_from_contract_id` already existed in the schema
 * (migration 0001-era) but was never referenced anywhere in the
 * application — the "Renovar" flow itself was never built. This agent is
 * that flow's first half: it finds contracts nearing expiry and drafts a
 * renewal proposal (a real proposals row, status "under_review", same as
 * every other AI-drafted proposal awaiting human review) grounded in the
 * real contract being renewed — value, dates, deal type — never invented.
 * It does not send anything and does not touch signature_status; a human
 * approves the draft like any other proposal.
 *
 * Deliberately reuses proposalPrompt/proposalContentSchema (the same
 * primitives the production /api/proposals/generate route uses) rather
 * than that route itself, per the Phase 8 framework decision: new agents
 * are separate, self-contained LangGraph graphs that don't risk touching
 * the production-critical generation path.
 */
import { attachNewProposal } from "@/lib/opportunities/store";
import { StateGraph, Annotation, START, END } from "@langchain/langgraph";
import { supabaseAdmin } from "@/lib/supabase/server";
import { invokeClaude } from "@/lib/bedrock/client";
import { proposalPrompt, PROMPT_VERSION } from "@/lib/bedrock/prompts";
import { resolveClubContext } from "@/lib/tenants/club-context";
import { loadVerifiedClaimsBlock } from "@/lib/claims/sponsor-claims";
import { proposalContentSchema, validateAiOutput, type ProposalContentAI } from "@/lib/ai/schemas";
import { carryAllocationsToRenewal } from "@/lib/allocations/store";
import { renewalBasis } from "@/lib/recap/store";
import type { ProposalContent } from "@/types/database";
import { authorizeAgent } from "@/lib/agents/governance";
import { runCheckpointed } from "@/lib/agents/langgraph/checkpointed";

const CRITICAL_DAYS = 15;
const WARNING_DAYS = 30;
const HORIZON_DAYS = 60;

type ExpiringContract = {
  id: string;
  company_id: string | null;
  proposal_id: string | null;
  title: string;
  total_value_brl: number | null;
  deal_type: string | null;
  end_date: string;
};

export interface RenewalDraft {
  contractId: string;
  companyId: string;
  companyName: string;
  daysUntilExpiry: number;
  severity: "critical" | "warning" | "watch";
  proposalId: string;
  proposalTitle: string;
}

export interface RenewalSkipped {
  contractId: string;
  reason: string;
}

const RenewalState = Annotation.Root({
  tenantId: Annotation<string>,
  rawContracts: Annotation<ExpiringContract[]>,
  // one contract is handled per step, so a run that dies resumes at the contract it was on
  cursor: Annotation<number>({ reducer: (_a, b) => b, default: () => 0 }),
  drafted: Annotation<RenewalDraft[]>({ reducer: (a, b) => a.concat(b), default: () => [] }),
  skipped: Annotation<RenewalSkipped[]>({ reducer: (a, b) => a.concat(b), default: () => [] }),
});

function renderMarkdown(c: ProposalContentAI): string {
  return [
    `# ${c.title}`, "", "## Executive Summary", c.executive_summary, "",
    "## Campaign Rationale", c.campaign_rationale, "", "## Sponsorship Value", c.sponsorship_value, "",
    "## Activation Plan", c.activation_plan, "", "## Deliverables",
    (c.deliverables ?? []).map((d) => `- ${d}`).join("\n"), "",
    "## Investment", c.investment_note, "", "## Next Steps", c.cta,
  ].join("\n");
}

/** The campaign context a renewal proposal is written from. Pure, and exported so the evaluation gates test the same wording. */
export function renewalCampaign(i: { companyName: string; dealType: string | null; endDate: string; valueNote: string; recapNote: string }) {
  return {
    title: `Renovação — ${i.companyName}`,
    summary: `This is a RENEWAL of an existing sponsorship (deal type: ${i.dealType ?? "sponsorship"}), expiring ${i.endDate}. ${i.valueNote} ${i.recapNote}`,
    activation: null,
    cta: "Confirmar renovação antes do vencimento do contrato atual.",
  };
}

async function scanExpiringContracts(state: typeof RenewalState.State): Promise<Partial<typeof RenewalState.State>> {
  const sb = supabaseAdmin();
  const horizon = new Date(Date.now() + HORIZON_DAYS * 86_400_000).toISOString().slice(0, 10);

  const { data, error } = await sb
    .from("contracts")
    .select("id, company_id, proposal_id, title, total_value_brl, deal_type, end_date")
    .eq("tenant_id", state.tenantId)
    .eq("status", "active")
    .not("end_date", "is", null)
    .lte("end_date", horizon);

  if (error) throw new Error(`Contract expiry scan failed: ${error.message}`);
  return { rawContracts: (data ?? []) as ExpiringContract[] };
}

async function draftNextRenewal(state: typeof RenewalState.State): Promise<Partial<typeof RenewalState.State>> {
  const contract = state.rawContracts[state.cursor];
  if (!contract) return { cursor: state.cursor + 1 };
  const outcome = await draftOne(state, contract);
  return { cursor: state.cursor + 1, drafted: outcome.drafted ? [outcome.drafted] : [], skipped: outcome.skipped ? [outcome.skipped] : [] };
}

/** Drafts the renewal for one contract, or says why it did not. */
async function draftOne(state: typeof RenewalState.State, contract: ExpiringContract): Promise<{ drafted?: RenewalDraft; skipped?: RenewalSkipped }> {
  const sb = supabaseAdmin();
  const now = Date.now();
  {
    const daysUntilExpiry = Math.floor((new Date(contract.end_date).getTime() - now) / 86_400_000);
    const severity: RenewalDraft["severity"] =
      daysUntilExpiry <= CRITICAL_DAYS ? "critical" : daysUntilExpiry <= WARNING_DAYS ? "warning" : "watch";

    if (!contract.company_id) {
      return { skipped: { contractId: contract.id, reason: "No company linked to this contract" } };
    }

    // The agent works only on companies it is assigned.
    const authority = await authorizeAgent(sb, state.tenantId, "renewal-agent", { companyId: contract.company_id, effects: ["draft_renewal"] });
    if (!authority.ok) {
      return { skipped: { contractId: contract.id, reason: authority.error } };
    }

    // Idempotency: don't draft a second renewal if one is already pending for this contract.
    const { data: existingCampaign } = await sb
      .from("campaigns")
      .select("id")
      .eq("tenant_id", state.tenantId)
      .contains("raw_output", { renewal_of_contract_id: contract.id })
      .limit(1)
      .maybeSingle();
    if (existingCampaign) {
      return { skipped: { contractId: contract.id, reason: "Renewal already drafted" } };
    }

    const { data: company } = await sb
      .from("companies")
      .select("id, company_name, industry, website, country, notes")
      .eq("id", contract.company_id)
      .eq("tenant_id", state.tenantId)
      .maybeSingle();
    if (!company) {
      return { skipped: { contractId: contract.id, reason: "Linked company not found" } };
    }

    // The renewal case comes from the reconciled recap, never from general enthusiasm: no proven delivery,
    // no AI call. Where recaps are not set up yet the old behaviour stands.
    const basis = await renewalBasis(sb, state.tenantId, contract.id);
    if (basis.ok && basis.value.recommendation.tier === "insufficient_evidence") {
      return { skipped: { contractId: contract.id, reason: `No proven delivery to build a renewal on (${basis.value.recommendation.reasons.join("; ")}). Record delivery and proof first, or write the renewal by hand.` } };
    }
    if (!basis.ok && basis.status !== 503) {
      return { skipped: { contractId: contract.id, reason: `The delivery recap could not be built: ${basis.error}` } };
    }
    const recapNote = basis.ok
      ? `Frame the proposal around continuity, using ONLY the delivery record below; do not describe results it does not contain.\n${basis.value.promptBlock}`
      : "Frame the proposal around continuity and the results already delivered, not a first-time pitch.";

    const valueNote = contract.total_value_brl
      ? `The prior contract was worth R$ ${Number(contract.total_value_brl).toLocaleString("pt-BR")}.`
      : "The prior contract's value is not on file — do not invent a figure.";
    const campaignCtx = renewalCampaign({ companyName: company.company_name, dealType: contract.deal_type, endDate: contract.end_date, valueNote, recapNote });

    try {
      const tenant = await resolveClubContext(state.tenantId);
      const pt = proposalPrompt({
        company: {
          company_name: company.company_name,
          industry: company.industry,
          website: company.website,
          country: company.country ?? "BR",
          notes: company.notes,
        },
        campaign: campaignCtx,
        strategy_variant: "renewal — continuity and proven results",
        tenant,
        verifiedClaims: await loadVerifiedClaimsBlock(sb, state.tenantId),
      });
      const result = await invokeClaude<unknown>({
        system: pt.system,
        messages: [{ role: "user", content: pt.user }],
        json: true,
        maxTokens: 3000,
        temperature: 0.6,
        entityType: "contract",
        entityId: contract.id,
      });
      const vr = validateAiOutput(proposalContentSchema, result.json, {
        workflow_name: "renewal_agent.draft",
        entity_id: contract.id,
      });
      if (!vr.ok || !vr.data) {
        return { skipped: { contractId: contract.id, reason: vr.error ?? "AI generation failed validation" } };
      }
      const content = vr.data as unknown as ProposalContentAI;

      const { data: campaign, error: campErr } = await sb
        .from("campaigns")
        .insert({
          tenant_id: state.tenantId,
          company_id: company.id,
          title: campaignCtx.title,
          summary: campaignCtx.summary,
          cta: campaignCtx.cta,
          generated_by: "renewal-agent",
          status: "draft",
          raw_output: { renewal_of_contract_id: contract.id, ...(basis.ok ? { recap_tier: basis.value.recommendation.tier, recap_checksum: basis.value.checksum } : {}) },
        })
        .select("id")
        .single();
      if (campErr || !campaign) {
        return { skipped: { contractId: contract.id, reason: campErr?.message ?? "Failed to create campaign" } };
      }

      const { data: proposal, error: propErr } = await sb
        .from("proposals")
        .insert({
          tenant_id: state.tenantId,
          company_id: company.id,
          campaign_id: campaign.id,
          title: content.title,
          content: content as unknown as ProposalContent,
          content_md: renderMarkdown(content),
          status: "under_review",
          generated_by: "renewal-agent",
          prompt_version: PROMPT_VERSION,
          metadata: { renewal_of_contract_id: contract.id, days_until_expiry: daysUntilExpiry },
        })
        .select("id, title")
        .single();
      if (propErr || !proposal) {
        return { skipped: { contractId: contract.id, reason: propErr?.message ?? "Failed to create proposal" } };
      }

      // Carry the expiring contract's allocations onto the renewal draft so
      // each asset keeps its identity; a failure here must not lose the draft.
      try {
        await carryAllocationsToRenewal(sb, state.tenantId, contract.id, proposal.id);
      } catch (err) {
        console.error("[renewal-agent] carrying allocations failed", err);
      }

      // A signed contract's renewal is the one rule that opens an opportunity without a person.
      await attachNewProposal(sb, state.tenantId, company.id, proposal.id, {
        actor: { kind: "rule", name: "renewal_of_signed_contract" },
        renewsContractId: contract.id,
      });

      return { drafted: {
        contractId: contract.id,
        companyId: company.id,
        companyName: company.company_name,
        daysUntilExpiry,
        severity,
        proposalId: proposal.id,
        proposalTitle: proposal.title,
      } };
    } catch (err) {
      return { skipped: { contractId: contract.id, reason: err instanceof Error ? err.message : "Unknown error" } };
    }
  }
}

export const RENEWAL_GRAPH = "renewal-agent";

export function buildRenewalGraph(checkpointer?: unknown) {
  return new StateGraph(RenewalState)
    .addNode("scan_expiring_contracts", scanExpiringContracts)
    .addNode("draft_next_renewal", draftNextRenewal)
    .addEdge(START, "scan_expiring_contracts")
    .addConditionalEdges("scan_expiring_contracts", (s: typeof RenewalState.State) => ((s.rawContracts?.length ?? 0) > 0 ? "draft_next_renewal" : END), ["draft_next_renewal", END])
    .addConditionalEdges("draft_next_renewal", (s: typeof RenewalState.State) => (s.cursor < s.rawContracts.length ? "draft_next_renewal" : END), ["draft_next_renewal", END])
    .compile(checkpointer ? { checkpointer: checkpointer as never } : undefined);
}

export interface RenewalAgentReport {
  drafted: RenewalDraft[];
  skipped: RenewalSkipped[];
  generatedAt: string;
}

export async function runRenewalAgent(tenantId: string): Promise<RenewalAgentReport> {
  const values = await runCheckpointed<typeof RenewalState.State>({ tenantId, graph: RENEWAL_GRAPH, build: buildRenewalGraph, initial: { tenantId } });
  return {
    drafted: values.drafted ?? [],
    skipped: values.skipped ?? [],
    generatedAt: new Date().toISOString(),
  };
}
