/**
 * Agent tool implementations.
 * Each function is called by the orchestrator when Claude requests a tool call.
 * All tools are non-throwing — they return { success, data, error } objects.
 */

import { checkRecipient, checkSend, stampSigner } from "@/lib/contacts/store";
import { loadOutreachContext, stampEmail } from "@/lib/playbooks/store";
import { checkPlaybook } from "@/lib/playbooks/definitions";
import { supabaseAdmin } from "@/lib/supabase/server";
import { searchDomain } from "@/lib/intelligence/hunter";
import { enrichCompanyApollo } from "@/lib/intelligence/apollo";
import { enrichCompanySocial } from "@/lib/intelligence/social-scraper";
import { resolveCompanyDomain, extractDomainFromWebsite } from "@/lib/intelligence/domain-resolution";
import { generatePersonalizedProposalForCompany } from "@/lib/proposals/generate-for-company";
import { invokeClaude } from "@/lib/bedrock/client";
import { outreachEmailPrompt } from "@/lib/bedrock/prompts";
import { resolveClubContext } from "@/lib/tenants/club-context";
import { resolveAppUrl } from "@/lib/url";
import {
  loadDefaultEmailTemplate,
  generateEmailWithTemplate,
  resolveDefaultSender,
  type EmailTemplateVariables,
} from "@/lib/email/template-engine";
import { logEmailToPipedrive } from "@/lib/pipedrive/email";
import { loadDelivery, recordMessageEventSafe } from "@/lib/messaging/store";
import { enqueueCrmSync } from "@/lib/crm/sync";
import { resolveProposalPipedriveIds } from "@/lib/pipedrive/sync";
import { pushContext, agent } from "@/lib/pipedrive/context";
import { guardColumns } from "@/lib/db/column-guard";
import { serverEnv } from "@/lib/env";
import { emailOutputSchema, validateAiOutput } from "@/lib/ai/schemas";
import { PROMPT_VERSION } from "@/lib/bedrock/prompts";
import { logger } from "@/lib/monitoring/logger";
import { isUncertainSesFailure, sendOutreachEmail } from "@/lib/mail/outreach";
import { reservedRecipientBlock } from "@/lib/email/reserved-recipient";
import type { MailSender } from "@/lib/mail/ses";

export type ToolResult = {
  success: boolean;
  data: Record<string, unknown>;
  summary: string;
};

// ── Tool 1: Enrich Contacts (Hunter.io + Apollo.io) ─────────────────────────

export async function toolEnrichContacts(input: {
  company_id: string;
  domain?: string;
}): Promise<ToolResult> {
  try {
    // Resolve domain via fallback chain so enrichment works even without a website
    const sb = supabaseAdmin();
    const { data: company } = await sb
      .from("companies")
      .select("id, company_name, website, country")
      .eq("id", input.company_id)
      .maybeSingle();

    let resolvedDomain = input.domain || extractDomainFromWebsite(company?.website ?? "") || "";

    if (!resolvedDomain && company) {
      const resolution = await resolveCompanyDomain({
        id: company.id,
        company_name: company.company_name,
        website: company.website,
        country: company.country,
      });
      resolvedDomain = resolution.final_domain ?? "";

      if (resolvedDomain && !company.website) {
        // Write discovered domain back so future enrichments and proposals can use it
        try {
          await sb
            .from("companies")
            .update({
              website: `https://${resolvedDomain}`,
              domain_source: resolution.source,
              domain_updated_at: new Date().toISOString(),
            })
            .eq("id", company.id);
        } catch {
          // non-fatal
        }
      }
    }

    const [hunterResult, apolloResult] = await Promise.all([
      resolvedDomain
        ? searchDomain(resolvedDomain, 10).catch((err) => {
            logger.warn("Agent Hunter enrich failed", { error: String(err) });
            return null;
          })
        : Promise.resolve(null),
      enrichCompanyApollo(resolvedDomain || (company?.company_name ?? "")).catch((err) => {
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

    if (resolvedDomain) data.domain = resolvedDomain;

    // Persist for personalized proposal generation
    if (hunterResult || apolloResult) {
      await mergeCompanyEnrichment(input.company_id, {
        hunter: hunterResult,
        apollo: apolloResult,
        domain: resolvedDomain || undefined,
      });
    }

    return {
      success: true,
      data,
      summary: parts.length
        ? parts.join(" · ")
        : topContactEmail
          ? `Top contact: ${topContactName || topContactEmail}`
          : resolvedDomain
            ? `No contacts found for ${resolvedDomain} — API keys may need checking`
            : "No contacts found — domain could not be resolved (website, Apollo, CRM, Hunter all tried)",
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
      .select("id, title, status, content, company_id, share_token, tenant_id, companies(id, company_name, industry, website, country)")
      .eq("id", input.proposal_id)
      .single();

    if (!proposal) {
      return { success: false, data: {}, summary: "Proposal not found" };
    }
    const tenantId = (proposal as { tenant_id: string }).tenant_id;
    if (proposal.status !== "approved") {
      return {
        success: false,
        data: {},
        summary: "Proposal must be approved before generating outreach email",
      };
    }

    const company = (proposal as unknown as { companies: Record<string, unknown> | null }).companies;
    if (!company) return { success: false, data: {}, summary: "Company not found on proposal" };

    // An agent may only pitch an account a person has qualified. Checked before any AI call.
    const outreachCtx = await loadOutreachContext(sb, tenantId, String(company.id));
    if (outreachCtx) {
      const verdict = checkPlaybook({ playbook: "pitch", stage: outreachCtx.stage, firstTouch: outreachCtx.firstTouch, hasApprovedProposal: true, actor: { kind: "agent", name: "outreach-agent" } });
      if (!verdict.allowed) return { success: false, data: { blocked: true }, summary: `Not drafting a pitch: ${verdict.reason}` };
    }

    const content = proposal.content as Record<string, string> | null;
    const summary =
      content?.executive_summary || content?.campaign_rationale || proposal.title;

    // Do-not-contact and dead addresses are refused before any AI call.
    const rc = await checkRecipient(sb, tenantId, { email: input.recipient_email, companyId: String(company.id) });
    if (!rc.allowed) return { success: false, data: { blocked: true }, summary: `Not drafting an email: ${rc.blocks[0].message}` };

    const { senderName, senderTitle, memberId: signerId } = await resolveDefaultSender(sb, tenantId);
    const appBase = resolveAppUrl();
    const proposalLink = proposal.share_token
      ? `${appBase}/proposals/view/${proposal.share_token}`
      : `${appBase}/proposals/${proposal.id}`;

    const templateVars: EmailTemplateVariables = {
      company_name: String(company.company_name ?? ""),
      contact_name: input.recipient_name?.trim() || "Prezado(a)",
      contact_title: input.recipient_title?.trim() || "",
      proposal_summary: summary,
      proposal_link: proposalLink,
      sender_name: senderName,
      sender_title: senderTitle || "Gerente de Patrocínios",
    };

    let emailOutput: { subject: string; body_text: string; body_html?: string | null } | null = null;
    let templateMeta: Record<string, unknown> = {};

    const emailTemplate = await loadDefaultEmailTemplate(tenantId);
    if (emailTemplate) {
      const templated = await generateEmailWithTemplate({
        template: emailTemplate,
        variables: templateVars,
        companyName: String(company.company_name ?? ""),
        proposalTitle: proposal.title,
      });
      if (templated) {
        emailOutput = templated.output;
        templateMeta = { email_template_id: templated.templateId, email_template_name: templated.templateName };
      }
    }

    if (!emailOutput) {
      const tenant = await resolveClubContext(tenantId);
      const { system, user } = outreachEmailPrompt({
        company: company as unknown as Parameters<typeof outreachEmailPrompt>[0]["company"],
        proposalTitle: proposal.title,
        proposalSummary: summary,
        contactName: input.recipient_name,
        contactTitle: input.recipient_title ?? null,
        proposalLink,
        senderName,
        senderTitle,
        tenant,
      });

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
    }

    if (!emailOutput) {
      return { success: false, data: {}, summary: "Email generation failed after 2 attempts" };
    }

    const { data: emailRow } = await sb
      .from("emails")
      .insert(
        guardColumns("emails", {
          tenant_id: tenantId,
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
            ...templateMeta,
          },
        })
      )
      .select("*")
      .single();

    if (!emailRow) {
      return { success: false, data: {}, summary: "Failed to save email to database" };
    }
    if (outreachCtx) await stampEmail(sb, tenantId, emailRow.id as string, { companyId: outreachCtx.company.id, playbook: "pitch" });
    await stampSigner(sb, tenantId, emailRow.id as string, signerId);

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

// ── Tool 5: Send Email via Amazon SES ────────────────────────────────────────

export async function toolSendEmail(
  input: { email_id: string },
  deps: { send?: MailSender; appUrl?: string; sb?: ReturnType<typeof supabaseAdmin> } = {},
): Promise<ToolResult> {
  const sb = deps.sb ?? supabaseAdmin();

  const { data: row } = await sb
    .from("emails")
    .select("id, status, recipient, company_id, proposal_id, sender_member_id, tenant_id, subject, body_text, body_html, approved_at, metadata")
    .eq("id", input.email_id)
    .maybeSingle();
  if (!row) return { success: false, data: { sent: false }, summary: "Email not found" };

  // Same gates as the human send route: never self-approve; only send approved content.
  if (row.status !== "approved") {
    return {
      success: false,
      data: { sent: false, blocked: true },
      summary: `Email must be approved before sending (current status: "${row.status}"). The agent cannot approve its own emails.`,
    };
  }

  const reserved = reservedRecipientBlock(String(row.recipient ?? ""));
  if (reserved) {
    return { success: false, data: { sent: false, blocked: true }, summary: `Not sending: ${reserved.message}` };
  }

  const pre = await loadDelivery(sb, null, input.email_id);
  if (pre && !pre.view.canSend && pre.view.state !== "crm_activity_recorded") {
    return { success: false, data: { sent: false }, summary: `Not sending: ${pre.view.blockedReason}` };
  }

  const standing = await checkSend(
    sb,
    (row as { tenant_id: string }).tenant_id,
    row as { recipient: string; company_id?: string | null; proposal_id?: string | null; sender_member_id?: string | null },
  );
  if (!standing.allowed) {
    return { success: false, data: { sent: false, blocked: true }, summary: `Not sending: ${standing.blocks[0].message}` };
  }

  const { data: claimed } = await sb
    .from("emails")
    .update({ status: "sending" })
    .eq("id", input.email_id)
    .eq("status", "approved")
    .select("*")
    .maybeSingle();

  if (!claimed) {
    const { data: existing } = await sb.from("emails").select("status").eq("id", input.email_id).maybeSingle();
    if (!existing) return { success: false, data: { sent: false }, summary: "Email not found" };
    if (existing.status === "sent") {
      return { success: true, data: { sent: true, already_sent: true }, summary: "Email was already sent" };
    }
    return {
      success: false,
      data: { sent: false },
      summary: `Email is currently "${existing.status}" — not sending (already in flight or in a non-sendable state)`,
    };
  }

  const email = claimed;
  const tenantId = String(email.tenant_id);

  await recordMessageEventSafe(sb, tenantId, String(email.id), {
    event_type: "send_attempted",
    source: "platform",
    detail: { by: "agent" },
  });

  let bareMessageId: string;
  let rawMessageId: string;
  try {
    const club = await resolveClubContext(tenantId);
    const clubName = club.club_facts.short_name ?? club.club_facts.club_name;
    const sesResult = await sendOutreachEmail(
      {
        to: String(email.recipient ?? ""),
        subject: String(email.subject ?? ""),
        bodyText: String(email.body_text ?? ""),
        bodyHtml: email.body_html ? String(email.body_html) : null,
        tenantId,
        appUrl: deps.appUrl ?? resolveAppUrl(),
        clubName,
      },
      { send: deps.send },
    );
    bareMessageId = sesResult.bareMessageId;
    rawMessageId = sesResult.rawMessageId;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.warn("Agent tool send_email SES failed", { error: message });
    if (isUncertainSesFailure(err)) {
      await recordMessageEventSafe(sb, tenantId, String(email.id), {
        event_type: "outcome_unknown",
        source: "provider",
        provider: "ses",
        detail: { error: message, by: "agent" },
      });
      await sb
        .from("emails")
        .update({ status: "sending", status_reason: "Send unconfirmed — do not retry until reconciled" })
        .eq("id", input.email_id)
        .eq("status", "sending");
      return {
        success: false,
        data: { sent: false, unconfirmed: true },
        summary: `Send unconfirmed via Amazon SES (do not retry): ${message}`,
      };
    }
    await recordMessageEventSafe(sb, tenantId, String(email.id), {
      event_type: "failed",
      source: "provider",
      provider: "ses",
      detail: { error: message, by: "agent" },
    });
    await sb
      .from("emails")
      .update({ status: "approved", status_reason: null })
      .eq("id", input.email_id)
      .eq("status", "sending");
    return { success: false, data: { sent: false }, summary: `Send failed via Amazon SES: ${message}` };
  }

  await recordMessageEventSafe(sb, tenantId, String(email.id), {
    event_type: "provider_accepted",
    source: "provider",
    provider: "ses",
    provider_receipt_id: bareMessageId,
    detail: { by: "agent", provider_message_id_raw: rawMessageId },
  });

  const sentMetadata = {
    ...(email.metadata as Record<string, unknown> ?? {}),
    provider_message_id: bareMessageId,
    provider_message_id_raw: rawMessageId,
    sent_by_agent: true,
  };

  try {
    const pd = pushContext(sb, tenantId, agent("outreach-agent"), "email_logged", String(email.id));
    if (email.proposal_id) {
      const ids = await resolveProposalPipedriveIds(sb, email.proposal_id as string);
      if (!ids.dealId) await enqueueCrmSync({ entity_type: "proposal", entity_id: email.proposal_id as string, operation: "create" }, pd);
    }

    const { activity_id, error: pdError } = await logEmailToPipedrive(pd, (email.proposal_id as string | null) ?? null, {
      subject: email.subject,
      bodyHtml: email.body_html ?? email.body_text ?? "",
    });

    await sb.from("emails").update({
      status: "sent",
      // Preserve existing approval — never approve as a side effect of send.
      approved_at: email.approved_at,
      sent_at: new Date().toISOString(),
      status_reason: null,
      metadata: {
        ...sentMetadata,
        pipedrive_activity_id: activity_id,
        pipedrive_error: pdError ?? null,
      },
    }).eq("id", email.id);

    await recordMessageEventSafe(sb, tenantId, String(email.id), {
      event_type: pdError ? "crm_activity_failed" : "crm_activity_recorded",
      source: "crm",
      detail: { pipedrive_activity_id: activity_id, error: pdError ?? null, by: "agent" },
    });

    return {
      success: true,
      data: {
        sent: true,
        provider_message_id: bareMessageId,
        pipedrive_activity_id: activity_id,
        pipedrive_error: pdError ?? null,
      },
      summary: pdError
        ? `Email accepted by Amazon SES (message ${bareMessageId}); CRM logging failed: ${pdError}`
        : `Email sent via Amazon SES (message ${bareMessageId}) and logged in Pipedrive (activity #${activity_id})`,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error("Agent outreach SES accepted but DB/CRM persistence failed — do not retry send", {
      email_id: input.email_id,
      provider_message_id: bareMessageId,
      provider_message_id_raw: rawMessageId,
      error: message,
    });
    const { data: fallback } = await sb.from("emails").update({
      status: "sent",
      sent_at: new Date().toISOString(),
      status_reason: null,
      metadata: { ...sentMetadata, pipedrive_error: message },
    }).eq("id", input.email_id).eq("status", "sending").select("id").maybeSingle();

    if (!fallback) {
      await recordMessageEventSafe(sb, tenantId, String(email.id), {
        event_type: "outcome_unknown",
        source: "platform",
        provider: "ses",
        provider_receipt_id: bareMessageId,
        detail: { error: message, by: "agent" },
      });
      await sb.from("emails").update({
        status: "sending",
        status_reason: `Send unconfirmed after SES accept (message ${bareMessageId}) — do not retry`,
        metadata: sentMetadata,
      }).eq("id", input.email_id);
    }

    return {
      success: true,
      data: { sent: true, provider_message_id: bareMessageId },
      summary: `Email accepted by Amazon SES (message ${bareMessageId}); CRM update failed: ${message}`,
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
