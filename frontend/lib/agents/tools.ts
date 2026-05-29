/**
 * Agent tool implementations.
 * Each function is called by the orchestrator when Claude requests a tool call.
 * All tools are non-throwing — they return { success, data, error } objects.
 */

import { supabaseAdmin } from "@/lib/supabase/server";
import { searchDomain } from "@/lib/intelligence/hunter";
import { enrichCompanyApollo } from "@/lib/intelligence/apollo";
import { enrichCompanySocial } from "@/lib/intelligence/social-scraper";
import { invokeClaude } from "@/lib/bedrock/client";
import { outreachEmailPrompt } from "@/lib/bedrock/prompts";
import { logEmailToPipedrive } from "@/lib/pipedrive/email";
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

// ── Tool 3: Get or Create Proposal ───────────────────────────────────────────

export async function toolGetOrCreateProposal(input: {
  company_id: string;
}): Promise<ToolResult> {
  const sb = supabaseAdmin();

  try {
    // 1. Look for an already-approved proposal
    const { data: approved } = await sb
      .from("proposals")
      .select("id, title, status, content, pricing_tiers")
      .eq("company_id", input.company_id)
      .eq("status", "approved")
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (approved) {
      const tiers = (approved.pricing_tiers as Array<Record<string, unknown>>) ?? [];
      const packages = tiers.slice(0, 3).map((t) => `${t.name ?? t.tier}: R$${t.price ?? "?"}`);
      return {
        success: true,
        data: {
          found: true,
          proposal_id: approved.id,
          proposal_title: approved.title,
          was_created: false,
          key_packages: packages,
        },
        summary: `Reusing approved proposal: "${approved.title}"`,
      };
    }

    // 2. Look for a draft and auto-approve it
    const { data: draft } = await sb
      .from("proposals")
      .select("id, title, status, content, pricing_tiers")
      .eq("company_id", input.company_id)
      .in("status", ["draft", "under_review", "pending"])
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (draft) {
      await sb.from("proposals").update({ status: "approved" }).eq("id", draft.id);
      const tiers = (draft.pricing_tiers as Array<Record<string, unknown>>) ?? [];
      const packages = tiers.slice(0, 3).map((t) => `${t.name ?? t.tier}: R$${t.price ?? "?"}`);
      return {
        success: true,
        data: {
          found: true,
          proposal_id: draft.id,
          proposal_title: draft.title,
          was_created: false,
          auto_approved: true,
          key_packages: packages,
        },
        summary: `Auto-approved draft proposal: "${draft.title}"`,
      };
    }

    return {
      success: false,
      data: { found: false },
      summary: "No proposal found for this company. Please create a campaign and generate a proposal first.",
    };
  } catch (err) {
    logger.warn("Agent tool get_or_create_proposal failed", { error: String(err) });
    return {
      success: false,
      data: { found: false },
      summary: `Proposal lookup failed: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

// ── Tool 4: Generate Outreach Email ──────────────────────────────────────────

export async function toolGenerateOutreachEmail(input: {
  proposal_id: string;
  recipient_email: string;
  recipient_name?: string;
  intelligence_context?: Record<string, unknown>;
}): Promise<ToolResult> {
  const sb = supabaseAdmin();
  const env = serverEnv();

  try {
    const { data: proposal } = await sb
      .from("proposals")
      .select("id, title, status, content, company_id, companies(id, company_name, industry, website, country)")
      .eq("id", input.proposal_id)
      .single();

    if (!proposal) {
      return { success: false, data: {}, summary: "Proposal not found" };
    }
    if (proposal.status !== "approved") {
      // Auto-approve it for the agent
      await sb.from("proposals").update({ status: "approved" }).eq("id", proposal.id);
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

    // Resolve Pipedrive IDs from linked proposal/company
    let pipedriveDealId: number | null = null;
    let pipedriveOrgId: number | null = null;

    if (email.proposal_id) {
      const { data: proposal } = await sb
        .from("proposals")
        .select("id, title, content, company_id, companies(id, company_name, website, industry, full_intelligence)")
        .eq("id", email.proposal_id)
        .maybeSingle();

      if (proposal) {
        const proposalContent = proposal.content as Record<string, unknown> | null;
        pipedriveDealId = (proposalContent?.pipedrive_deal_id as number) ?? null;

        const companyData = (proposal as Record<string, unknown>).companies as Record<string, unknown> | null;
        const fullIntel = companyData?.full_intelligence as Record<string, unknown> | null;
        pipedriveOrgId = (fullIntel?.pipedrive_org_id as number) ?? null;

        // If no org ID stored locally, search Pipedrive by company name
        if (!pipedriveOrgId && companyData?.company_name) {
          const apiKey = process.env.PIPEDRIVE_API_KEY ?? "";
          if (apiKey) {
            try {
              const searchRes = await fetch(
                `https://api.pipedrive.com/v1/organizations/search?term=${encodeURIComponent(String(companyData.company_name))}&limit=3&api_token=${apiKey}`
              );
              const searchJson = await searchRes.json() as { data?: { items?: Array<{ item: { id: number } }> } };
              const foundOrg = searchJson.data?.items?.[0]?.item?.id ?? null;

              if (foundOrg) {
                pipedriveOrgId = foundOrg;
              } else {
                // Create the org in Pipedrive
                const createRes = await fetch(
                  `https://api.pipedrive.com/v1/organizations?api_token=${apiKey}`,
                  {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                      name: companyData.company_name,
                      visible_to: "3",
                      fbd322ead72aa689d82c6eec5a4df360273c4925: "Plataforma",
                    }),
                  }
                );
                const createJson = await createRes.json() as { data?: { id: number } };
                pipedriveOrgId = createJson.data?.id ?? null;
              }

              // Persist org ID back to DB
              if (pipedriveOrgId && proposal.company_id) {
                const updatedIntel = { ...(fullIntel ?? {}), pipedrive_org_id: pipedriveOrgId };
                await sb.from("companies").update({ full_intelligence: updatedIntel }).eq("id", proposal.company_id as string);
              }
            } catch { /* non-fatal */ }
          }
        }

        // If we have an org but no deal, create the deal
        if (pipedriveOrgId && !pipedriveDealId) {
          const apiKey = process.env.PIPEDRIVE_API_KEY ?? "";
          if (apiKey) {
            try {
              const dealRes = await fetch(
                `https://api.pipedrive.com/v1/deals?api_token=${apiKey}`,
                {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    title: `${companyData?.company_name ?? "Company"} — ${proposal.title ?? "Proposta"}`,
                    org_id: pipedriveOrgId,
                    pipeline_id: 3,   // Patrocínios
                    stage_id: 20,     // Negociação (email sent)
                    currency: "BRL",
                    visible_to: "3",
                  }),
                }
              );
              const dealJson = await dealRes.json() as { data?: { id: number } };
              pipedriveDealId = dealJson.data?.id ?? null;

              // Persist deal ID back to proposal content
              if (pipedriveDealId) {
                const updatedContent = { ...(proposalContent ?? {}), pipedrive_deal_id: pipedriveDealId };
                await sb.from("proposals").update({ content: updatedContent }).eq("id", email.proposal_id as string);
              }
            } catch { /* non-fatal */ }
          }
        }
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
