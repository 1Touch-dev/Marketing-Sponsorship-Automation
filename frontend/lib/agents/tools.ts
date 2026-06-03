/**
 * Agent tool implementations.
 * Each function is called by the orchestrator when Claude requests a tool call.
 * All tools are non-throwing — they return { success, data, error } objects.
 */

import { supabaseAdmin } from "@/lib/supabase/server";
import { searchDomain } from "@/lib/intelligence/hunter";
import { enrichCompanyApollo } from "@/lib/intelligence/apollo";
import { enrichCompanySocial } from "@/lib/intelligence/social-scraper";
import { generatePersonalizedProposalForCompany } from "@/lib/proposals/generate-for-company";
import { invokeClaude } from "@/lib/bedrock/client";
import { outreachEmailPrompt } from "@/lib/bedrock/prompts";
import { logEmailToPipedrive } from "@/lib/pipedrive/email";
import { enqueueCrmSync, resolveProposalPipedriveIds } from "@/lib/pipedrive/sync";
import { guardColumns } from "@/lib/db/column-guard";
import { serverEnv } from "@/lib/env";
import { emailOutputSchema, validateAiOutput } from "@/lib/ai/schemas";
import { PROMPT_VERSION } from "@/lib/bedrock/prompts";
import { logger } from "@/lib/monitoring/logger";

export type ToolResult = {
  success: boolean;
  data: Record<string, unknown>;
  summary: string;
};

// ── Tool 1: Enrich Contacts (Hunter.io + Apollo.io) ─────────────────────────

export async function toolEnrichContacts(input: {
  company_id: string;
  domain: string;
}): Promise<ToolResult> {
  try {
    const [hunterResult, apolloResult] = await Promise.all([
      searchDomain(input.domain, 10).catch((err) => {
        logger.warn("Agent Hunter enrich failed", { error: String(err) });
        return null;
      }),
      enrichCompanyApollo(input.domain).catch((err) => {
        logger.warn("Agent Apollo enrich failed", { error: String(err) });
        return null;
      }),
    ]);

    const hunterDecisionMakers = hunterResult?.decision_makers ?? [];
    const allContacts = hunterResult?.emails ?? [];
    const apolloPeople = apolloResult?.decision_makers ?? [];
    const topHunter = hunterDecisionMakers[0] ?? allContacts[0] ?? null;
    const topApollo = apolloPeople[0] ?? null;

    const topContactEmail = topHunter?.email ?? topApollo?.email ?? null;
    const topContactName = topHunter?.full_name ?? topApollo?.name ?? null;
    const topContactPosition = topHunter?.position ?? topApollo?.title ?? null;
    const topContactSeniority = topHunter?.seniority ?? topApollo?.seniority ?? null;
    const topContactConfidence = topHunter?.confidence ?? 0;

    const org = apolloResult?.organization;
    const data: Record<string, unknown> = {
      found: allContacts.length > 0 || apolloPeople.length > 0 || !!org,
      contacts_found: allContacts.length,
      decision_makers: hunterDecisionMakers.length + apolloPeople.length,
      top_contact: topContactEmail
        ? {
            email: topContactEmail,
            name: topContactName,
            position: topContactPosition,
            confidence: topContactConfidence,
            seniority: topContactSeniority,
          }
        : null,
      all_contacts: allContacts.slice(0, 5).map((c) => ({
        email: c.email,
        name: c.full_name || null,
        position: c.position || null,
        confidence: c.confidence,
      })),
      apollo: org
        ? {
            industry: org.industry,
            employees: org.estimated_num_employees,
            marketing_team_size: org.marketing_team_size,
            revenue: org.annual_revenue_printed,
            funding_stage: org.latest_funding_stage,
          }
        : null,
      apollo_people: apolloPeople.slice(0, 5).map((p) => ({
        name: p.name,
        title: p.title,
        email: p.email,
        linkedin_url: p.linkedin_url,
      })),
    };

    const parts: string[] = [];
    if (allContacts.length) parts.push(`${allContacts.length} emails (Hunter)`);
    if (org?.marketing_team_size) parts.push(`~${org.marketing_team_size} marketing staff (Apollo)`);
    if (apolloPeople.length) parts.push(`${apolloPeople.length} decision makers (Apollo)`);

    // Persist for personalized proposal generation
    if (hunterResult || apolloResult) {
      await mergeCompanyEnrichment(input.company_id, {
        hunter: hunterResult,
        apollo: apolloResult,
      });
    }

    return {
      success: true,
      data,
      summary: parts.length
        ? parts.join(" · ")
        : topContactEmail
          ? `Top contact: ${topContactName || topContactEmail}`
          : "No contacts found — check Hunter/Apollo API keys",
    };
  } catch (err) {
    logger.warn("Agent tool enrich_contacts failed", { error: String(err) });
    return {
      success: false,
      data: { found: false, contacts_found: 0, decision_makers: 0, top_contact: null },
      summary: `Contact enrichment failed: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

// ── Tool 2: Scrape Company Intelligence (Apify) ───────────────────────────────

export async function toolScrapeIntelligence(input: {
  company_id: string;
  company_name: string;
  domain: string;
}): Promise<ToolResult> {
  try {
    const sb = supabaseAdmin();
    const { data: company } = await sb
      .from("companies")
      .select("full_intelligence")
      .eq("id", input.company_id)
      .maybeSingle();

    const existingIntel = ((company?.full_intelligence as Record<string, unknown>) ?? {});
    const scrapeData = (existingIntel.scrape_metadata as Record<string, unknown>) ?? {};

    const result = await enrichCompanySocial(input.company_name, input.domain, scrapeData);

    await mergeCompanyEnrichment(input.company_id, {
      social: result,
      enriched_at: new Date().toISOString(),
      domain: input.domain,
    });

    const data: Record<string, unknown> = {
      found: true,
      linkedin_found: !!result.linkedin,
      employee_count: result.linkedin?.employee_count ?? null,
      industry: result.linkedin?.industry ?? null,
      headquarters: result.linkedin?.headquarters ?? null,
      social_score: result.social.total_social_score,
      has_active_ads: result.ads.has_active_google_ads || result.ads.has_active_meta_ads,
      ad_spend_signal: result.ads.estimated_ad_spend_signal,
      active_campaigns: result.ads.active_campaigns,
      instagram: result.social.instagram_handle,
      linkedin_url: result.social.linkedin_url,
    };

    return {
      success: true,
      data,
      summary: `Social score: ${result.social.total_social_score}/10 · Ads: ${result.ads.estimated_ad_spend_signal} · LinkedIn: ${result.linkedin?.name ?? "not found"}`,
    };
  } catch (err) {
    logger.warn("Agent tool scrape_intelligence failed", { error: String(err) });
    return {
      success: false,
      data: { found: false, social_score: 0 },
      summary: `Intelligence scrape failed: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

// ── Tool 3: Generate Personalized Proposal ───────────────────────────────────

export async function toolGeneratePersonalizedProposal(input: {
  company_id: string;
}): Promise<ToolResult> {
  try {
    const generated = await generatePersonalizedProposalForCompany(input.company_id);

    return {
      success: true,
      data: {
        found: true,
        proposal_id: generated.proposal_id,
        proposal_title: generated.title,
        executive_summary: generated.executive_summary,
        status: generated.status,
        was_created: true,
        requires_approval: true,
      },
      summary: `Generated personalized proposal: "${generated.title}" (awaiting your approval)`,
    };
  } catch (err) {
    logger.warn("Agent tool generate_personalized_proposal failed", { error: String(err) });
    return {
      success: false,
      data: { found: false },
      summary: `Proposal generation failed: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

// ── Tool 4: Generate Outreach Email ──────────────────────────────────────────

export async function toolGenerateOutreachEmail(input: {
  proposal_id: string;
  recipient_email: string;
  recipient_name?: string;
  recipient_title?: string;
  intelligence_context?: Record<string, unknown>;
}): Promise<ToolResult> {
  const sb = supabaseAdmin();
  const env = serverEnv();

  try {
    const { data: proposal } = await sb
      .from("proposals")
      .select("id, title, status, content, company_id, share_token, companies(id, company_name, industry, website, country)")
      .eq("id", input.proposal_id)
      .single();

    if (!proposal) {
      return { success: false, data: {}, summary: "Proposal not found" };
    }
    if (proposal.status !== "approved") {
      return {
        success: false,
        data: {},
        summary: "Proposal must be approved before generating outreach email",
      };
    }

    const company = (proposal as unknown as { companies: Record<string, unknown> | null }).companies;
    if (!company) return { success: false, data: {}, summary: "Company not found on proposal" };

    const content = proposal.content as Record<string, string> | null;
    const summary =
      content?.executive_summary || content?.campaign_rationale || proposal.title;

    const { system, user } = outreachEmailPrompt({
      company: company as unknown as Parameters<typeof outreachEmailPrompt>[0]["company"],
      proposalTitle: proposal.title,
      proposalSummary: summary,
      contactName: input.recipient_name,
      contactTitle: input.recipient_title ?? null,
      proposalLink: proposal.share_token
        ? `${env.APP_URL ?? "https://eligibly-facing-unloved.ngrok-free.dev"}/proposals/view/${proposal.share_token}`
        : `${env.APP_URL ?? "https://eligibly-facing-unloved.ngrok-free.dev"}/proposals/${proposal.id}/view`,
      senderName: process.env.SENDER_NAME ?? "Departamento Comercial",
      senderTitle: process.env.SENDER_TITLE ?? null,
    });

    let emailOutput = null;
    for (let attempt = 1; attempt <= 2; attempt++) {
      const claude = await invokeClaude<unknown>({
        system,
        messages: [{ role: "user", content: user }],
        json: true,
        maxTokens: 800,
        temperature: 0.5,
      });
      const vr = validateAiOutput(emailOutputSchema, claude.json, {
        workflow: "agent.generate_email",
        entity_id: proposal.id,
      });
      if (vr.ok && vr.data) { emailOutput = vr.data; break; }
    }

    if (!emailOutput) {
      return { success: false, data: {}, summary: "Email generation failed after 2 attempts" };
    }

    const { data: emailRow } = await sb
      .from("emails")
      .insert(
        guardColumns("emails", {
          proposal_id: proposal.id,
          recipient: input.recipient_email,
          subject: emailOutput.subject,
          body_text: emailOutput.body_text,
          body_html: emailOutput.body_html ?? `<p>${emailOutput.body_text.replace(/\n/g, "</p><p>")}</p>`,
          status: "pending_approval",
          generated_by: "bedrock-claude-agent",
          sender: env.DEFAULT_FROM_EMAIL ?? null,
          prompt_version: PROMPT_VERSION,
          metadata: {
            model_id: env.BEDROCK_MODEL_ID,
            agent_generated: true,
            recipient_name: input.recipient_name ?? null,
          },
        })
      )
      .select("*")
      .single();

    if (!emailRow) {
      return { success: false, data: {}, summary: "Failed to save email to database" };
    }

    const preview = emailOutput.body_text.slice(0, 150).replace(/\n/g, " ") + "…";

    return {
      success: true,
      data: {
        email_id: emailRow.id,
        subject: emailOutput.subject,
        preview,
        recipient: input.recipient_email,
        recipient_name: input.recipient_name ?? null,
        body_text: emailOutput.body_text,
      },
      summary: `Email drafted: "${emailOutput.subject}" → ${input.recipient_email}`,
    };
  } catch (err) {
    logger.warn("Agent tool generate_outreach_email failed", { error: String(err) });
    return {
      success: false,
      data: {},
      summary: `Email generation failed: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

// ── Tool 5: Send Email via Pipedrive ─────────────────────────────────────────

export async function toolSendEmail(input: {
  email_id: string;
}): Promise<ToolResult> {
  const sb = supabaseAdmin();

  try {
    const { data: email } = await sb
      .from("emails")
      .select("*")
      .eq("id", input.email_id)
      .single();

    if (!email) return { success: false, data: { sent: false }, summary: "Email not found" };
    if (email.status === "sent") {
      return {
        success: true,
        data: { sent: true, already_sent: true },
        summary: "Email was already sent",
      };
    }

    let pipedriveDealId: number | null = null;
    let pipedriveOrgId: number | null = null;

    if (email.proposal_id) {
      const ids = await resolveProposalPipedriveIds(sb, email.proposal_id as string);
      pipedriveDealId = ids.dealId;
      pipedriveOrgId = ids.orgId;

      if (!pipedriveDealId) {
        const { result } = await enqueueCrmSync({
          entity_type: "proposal",
          entity_id: email.proposal_id as string,
          operation: "create",
        });
        pipedriveDealId = (result.pipedrive_deal_id as number) ?? null;
        pipedriveOrgId = (result.pipedrive_org_id as number) ?? pipedriveOrgId;
      }
    }

    const { activity_id, error: pdError } = await logEmailToPipedrive({
      subject: email.subject,
      bodyHtml: email.body_html ?? email.body_text ?? "",
      pipedrive_deal_id: pipedriveDealId,
      pipedrive_org_id: pipedriveOrgId,
      pipedrive_person_id: null,
    });

    await sb.from("emails").update({
      status: "sent",
      approved_at: new Date().toISOString(),
      sent_at: new Date().toISOString(),
      metadata: {
        ...(email.metadata as Record<string, unknown> ?? {}),
        pipedrive_activity_id: activity_id,
        pipedrive_error: pdError ?? null,
        sent_by_agent: true,
      },
    }).eq("id", email.id);

    return {
      success: !pdError,
      data: {
        sent: true,
        pipedrive_activity_id: activity_id,
        pipedrive_error: pdError ?? null,
      },
      summary: pdError
        ? `Email sent but Pipedrive logging failed: ${pdError}`
        : `Email sent · Pipedrive activity #${activity_id}`,
    };
  } catch (err) {
    logger.warn("Agent tool send_email failed", { error: String(err) });
    return {
      success: false,
      data: { sent: false },
      summary: `Send failed: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

async function mergeCompanyEnrichment(
  companyId: string,
  patch: Record<string, unknown>
): Promise<void> {
  const sb = supabaseAdmin();
  const { data: company } = await sb
    .from("companies")
    .select("full_intelligence")
    .eq("id", companyId)
    .maybeSingle();

  const existing = (company?.full_intelligence as Record<string, unknown>) ?? {};
  const enrichment = {
    ...((existing.enrichment as Record<string, unknown>) ?? {}),
    ...patch,
  };

  await sb
    .from("companies")
    .update({
      full_intelligence: { ...existing, enrichment },
    })
    .eq("id", companyId);
}
