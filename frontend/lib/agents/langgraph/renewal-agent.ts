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
import { StateGraph, Annotation, START, END } from "@langchain/langgraph";
import { supabaseAdmin } from "@/lib/supabase/server";
import { invokeClaude } from "@/lib/bedrock/client";
import { proposalPrompt, PROMPT_VERSION } from "@/lib/bedrock/prompts";
import { resolveClubContext } from "@/lib/tenants/club-context";
import { proposalContentSchema, validateAiOutput, type ProposalContentAI } from "@/lib/ai/schemas";
import type { ProposalContent } from "@/types/database";

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
  drafted: Annotation<RenewalDraft[]>,
  skipped: Annotation<RenewalSkipped[]>,
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

async function draftRenewals(state: typeof RenewalState.State): Promise<Partial<typeof RenewalState.State>> {
  const sb = supabaseAdmin();
  const drafted: RenewalDraft[] = [];
  const skipped: RenewalSkipped[] = [];
  const now = Date.now();

  for (const contract of state.rawContracts) {
    const daysUntilExpiry = Math.floor((new Date(contract.end_date).getTime() - now) / 86_400_000);
    const severity: RenewalDraft["severity"] =
      daysUntilExpiry <= CRITICAL_DAYS ? "critical" : daysUntilExpiry <= WARNING_DAYS ? "warning" : "watch";

    if (!contract.company_id) {
      skipped.push({ contractId: contract.id, reason: "No company linked to this contract" });
      continue;
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
      skipped.push({ contractId: contract.id, reason: "Renewal already drafted" });
      continue;
    }

    const { data: company } = await sb
      .from("companies")
      .select("id, company_name, industry, website, country, notes")
      .eq("id", contract.company_id)
      .eq("tenant_id", state.tenantId)
      .maybeSingle();
    if (!company) {
      skipped.push({ contractId: contract.id, reason: "Linked company not found" });
      continue;
    }

    const valueNote = contract.total_value_brl
      ? `The prior contract was worth R$ ${Number(contract.total_value_brl).toLocaleString("pt-BR")}.`
      : "The prior contract's value is not on file — do not invent a figure.";
    const campaignCtx = {
      title: `Renovação — ${company.company_name}`,
      summary: `This is a RENEWAL of an existing sponsorship (deal type: ${contract.deal_type ?? "sponsorship"}), expiring ${contract.end_date}. ${valueNote} Frame the proposal around continuity and the results already delivered, not a first-time pitch.`,
      activation: null,
      cta: "Confirmar renovação antes do vencimento do contrato atual.",
    };

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
        skipped.push({ contractId: contract.id, reason: vr.error ?? "AI generation failed validation" });
        continue;
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
          raw_output: { renewal_of_contract_id: contract.id },
        })
        .select("id")
        .single();
      if (campErr || !campaign) {
        skipped.push({ contractId: contract.id, reason: campErr?.message ?? "Failed to create campaign" });
        continue;
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
        skipped.push({ contractId: contract.id, reason: propErr?.message ?? "Failed to create proposal" });
        continue;
      }

      drafted.push({
        contractId: contract.id,
        companyId: company.id,
        companyName: company.company_name,
        daysUntilExpiry,
        severity,
        proposalId: proposal.id,
        proposalTitle: proposal.title,
      });
    } catch (err) {
      skipped.push({ contractId: contract.id, reason: err instanceof Error ? err.message : "Unknown error" });
    }
  }

  return { drafted, skipped };
}

const graph = new StateGraph(RenewalState)
  .addNode("scan_expiring_contracts", scanExpiringContracts)
  .addNode("draft_renewals", draftRenewals)
  .addEdge(START, "scan_expiring_contracts")
  .addEdge("scan_expiring_contracts", "draft_renewals")
  .addEdge("draft_renewals", END)
  .compile();

export interface RenewalAgentReport {
  drafted: RenewalDraft[];
  skipped: RenewalSkipped[];
  generatedAt: string;
}

export async function runRenewalAgent(tenantId: string): Promise<RenewalAgentReport> {
  const finalState = await graph.invoke({ tenantId } as typeof RenewalState.State);
  return {
    drafted: finalState.drafted ?? [],
    skipped: finalState.skipped ?? [],
    generatedAt: new Date().toISOString(),
  };
}
