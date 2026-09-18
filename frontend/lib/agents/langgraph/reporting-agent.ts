/**
 * Reporting Agent — Phase 8, Team 2's fourth and final agent
 * (`master_report.md` Section 7.3): "Generates the sponsor/donor-facing
 * ROI dashboard updates and monthly report emails automatically."
 *
 * The ROI numbers themselves already exist and are already real —
 * lib/proposals/roi.ts (Phase 5) computes them from real per-match reach
 * data (match_media_reach) and has always refused to fabricate a figure
 * (has_data is false, and the caller renders nothing, until real reach
 * data exists). This agent is the "monthly report email" half: for each
 * signed, active contract with real reach data available, it drafts a
 * report email summarizing those real numbers — never invents a metric
 * that isn't in match_media_reach.
 *
 * Same pattern as the Negotiation Agent: a plain DRAFT email row
 * (status "pending_approval"), flowing through the existing hardened
 * approval gate — no email is sent automatically. Idempotent per
 * calendar month per contract, so re-running this on-demand doesn't
 * spam duplicate drafts.
 */
import { StateGraph, Annotation, START, END } from "@langchain/langgraph";
import { supabaseAdmin } from "@/lib/supabase/server";
import { invokeClaude } from "@/lib/bedrock/client";
import { validateAiOutput, emailOutputSchema } from "@/lib/ai/schemas";
import { resolveClubContext } from "@/lib/tenants/club-context";
import { getProposalRoiData } from "@/lib/proposals/roi";
import { guardColumns } from "@/lib/db/column-guard";
import { serverEnv } from "@/lib/env";

type ActiveContract = {
  id: string;
  company_id: string | null;
  proposal_id: string | null;
};

export interface ReportDrafted {
  contractId: string;
  companyName: string;
  emailId: string;
  subject: string;
  totalReach: number;
  matchesCovered: number;
}

export interface ReportSkipped {
  contractId: string;
  reason: string;
}

const ReportingState = Annotation.Root({
  tenantId: Annotation<string>,
  rawContracts: Annotation<ActiveContract[]>,
  drafted: Annotation<ReportDrafted[]>,
  skipped: Annotation<ReportSkipped[]>,
});

async function scanActiveContracts(state: typeof ReportingState.State): Promise<Partial<typeof ReportingState.State>> {
  const sb = supabaseAdmin();
  const { data, error } = await sb
    .from("contracts")
    .select("id, company_id, proposal_id")
    .eq("tenant_id", state.tenantId)
    .eq("status", "active");

  if (error) throw new Error(`Active contract scan failed: ${error.message}`);
  return { rawContracts: (data ?? []) as ActiveContract[] };
}

async function draftReports(state: typeof ReportingState.State): Promise<Partial<typeof ReportingState.State>> {
  const sb = supabaseAdmin();
  const env = serverEnv();
  const drafted: ReportDrafted[] = [];
  const skipped: ReportSkipped[] = [];
  const monthKey = new Date().toISOString().slice(0, 7); // "2026-09"

  for (const contract of state.rawContracts) {
    if (!contract.proposal_id || !contract.company_id) {
      skipped.push({ contractId: contract.id, reason: "No linked proposal/company" });
      continue;
    }

    // Idempotency: at most one report draft per contract per calendar month.
    const { data: existing } = await sb
      .from("emails")
      .select("id")
      .eq("tenant_id", state.tenantId)
      .contains("metadata", { reporting_agent_contract_id: contract.id, report_month: monthKey })
      .limit(1)
      .maybeSingle();
    if (existing) {
      skipped.push({ contractId: contract.id, reason: `Already reported for ${monthKey}` });
      continue;
    }

    const { data: proposal } = await sb
      .from("proposals")
      .select("id, title, match_id, approved_at, created_at, company_id, companies(company_name, contact_email)")
      .eq("id", contract.proposal_id)
      .eq("tenant_id", state.tenantId)
      .maybeSingle();
    if (!proposal) {
      skipped.push({ contractId: contract.id, reason: "Linked proposal not found" });
      continue;
    }

    const company = (proposal as unknown as { companies: { company_name: string; contact_email: string | null } | null }).companies;
    if (!company?.contact_email) {
      skipped.push({ contractId: contract.id, reason: "No contact email on file for this company" });
      continue;
    }

    const roi = await getProposalRoiData(sb, {
      id: proposal.id,
      match_id: proposal.match_id,
      approved_at: proposal.approved_at,
      created_at: proposal.created_at,
    });
    if (!roi.has_data) {
      skipped.push({ contractId: contract.id, reason: "No real match reach data yet — nothing to report" });
      continue;
    }

    try {
      const tenant = await resolveClubContext(state.tenantId);
      const club = tenant.club_facts.club_name;
      const matchLines = roi.matches
        .slice(-6)
        .map((m) => `- ${m.match_date} vs ${m.opponent} (${m.competition ?? "match"}): ${m.official_views + m.unofficial_fan_views + m.rival_account_views + m.media_tv_radio_views} total views`)
        .join("\n");

      const system = [
        `You are writing a monthly sponsorship ROI report email on behalf of ${club} to a real, signed sponsor.`,
        "Use ONLY the real numbers provided below — never estimate, round up meaningfully, or invent a metric that isn't listed.",
        "Tone: professional account-management update, not a sales pitch — this sponsor already signed.",
        "Output MUST be valid JSON only: {\"subject\": string, \"body_text\": string}. No markdown fences.",
      ].join("\n");
      const user = [
        `Sponsor: ${company.company_name}`,
        `Proposal: ${proposal.title}`,
        `Matches covered: ${roi.matches_covered}`,
        `Total official views: ${roi.total_official_views}`,
        `Total unofficial fan views: ${roi.total_unofficial_fan_views}`,
        `Total rival-account views: ${roi.total_rival_account_views}`,
        `Total media (TV/radio) views: ${roi.total_media_tv_radio_views}`,
        `Total combined reach: ${roi.total_reach}`,
        "Recent matches:",
        matchLines || "(none individually listed)",
        "",
        "Write the report email now, in Brazilian Portuguese, citing only the numbers above.",
      ].join("\n");

      const result = await invokeClaude<unknown>({
        system,
        messages: [{ role: "user", content: user }],
        json: true,
        maxTokens: 1500,
        temperature: 0.5,
        entityType: "contract",
        entityId: contract.id,
      });
      const vr = validateAiOutput(emailOutputSchema, result.json, {
        workflow_name: "reporting_agent.draft",
        entity_id: contract.id,
      });
      if (!vr.ok || !vr.data) {
        skipped.push({ contractId: contract.id, reason: vr.error ?? "AI generation failed validation" });
        continue;
      }
      const { subject, body_text } = vr.data;

      const { data: emailRow, error: insErr } = await sb
        .from("emails")
        .insert(
          guardColumns("emails", {
            tenant_id: state.tenantId,
            proposal_id: proposal.id,
            recipient: company.contact_email,
            subject,
            body_text,
            body_html: `<p>${body_text.replace(/\n/g, "</p><p>")}</p>`,
            status: "pending_approval",
            generated_by: "reporting-agent-langgraph",
            sender: env.DEFAULT_FROM_EMAIL ?? null,
            metadata: {
              agent_generated: true,
              reporting_agent_contract_id: contract.id,
              report_month: monthKey,
              total_reach: roi.total_reach,
            },
          }),
        )
        .select("id")
        .single();
      if (insErr || !emailRow) {
        skipped.push({ contractId: contract.id, reason: insErr?.message ?? "Failed to save draft" });
        continue;
      }

      drafted.push({
        contractId: contract.id,
        companyName: company.company_name,
        emailId: emailRow.id,
        subject,
        totalReach: roi.total_reach,
        matchesCovered: roi.matches_covered,
      });
    } catch (err) {
      skipped.push({ contractId: contract.id, reason: err instanceof Error ? err.message : "Unknown error" });
    }
  }

  return { drafted, skipped };
}

const graph = new StateGraph(ReportingState)
  .addNode("scan_active_contracts", scanActiveContracts)
  .addNode("draft_reports", draftReports)
  .addEdge(START, "scan_active_contracts")
  .addEdge("scan_active_contracts", "draft_reports")
  .addEdge("draft_reports", END)
  .compile();

export interface ReportingAgentReport {
  drafted: ReportDrafted[];
  skipped: ReportSkipped[];
  generatedAt: string;
}

export async function runReportingAgent(tenantId: string): Promise<ReportingAgentReport> {
  const finalState = await graph.invoke({ tenantId } as typeof ReportingState.State);
  return {
    drafted: finalState.drafted ?? [],
    skipped: finalState.skipped ?? [],
    generatedAt: new Date().toISOString(),
  };
}
