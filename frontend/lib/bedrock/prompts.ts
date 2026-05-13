/**
 * Centralised prompt templates. Each function returns the
 * { system, user } pair to feed into invokeClaude.
 *
 * PROMPT_VERSION is bumped whenever a prompt changes so that
 * campaigns / proposals / emails can record which prompt generated them.
 */

export const PROMPT_VERSION = "v1.1.0" as const;

export interface CompanyContext {
  company_name: string;
  industry?: string | null;
  website?: string | null;
  country?: string | null;
  notes?: string | null;
}

export function campaignIdeasPrompt(args: {
  company: CompanyContext;
  objective?: string;
  maxIdeas?: number;
}) {
  const max = args.maxIdeas ?? 5;
  return {
    system: [
      "You are a senior sponsorship strategist specialised in the Brazilian market.",
      "Generate creative, realistic sponsorship and activation ideas tailored to the target company.",
      "Your output MUST be a single valid JSON object that matches the requested schema exactly.",
      "Do not include explanations, markdown fences, or commentary outside the JSON.",
    ].join("\n"),
    user: [
      `Target company: ${args.company.company_name}`,
      args.company.industry ? `Industry: ${args.company.industry}` : null,
      args.company.country ? `Country: ${args.company.country}` : null,
      args.company.website ? `Website: ${args.company.website}` : null,
      args.company.notes ? `Notes: ${args.company.notes}` : null,
      args.objective ? `Objective: ${args.objective}` : null,
      "",
      `Generate ${max} distinct sponsorship campaign ideas.`,
      "Return JSON of shape:",
      `{
  "ideas": [
    {
      "title": "string",
      "summary": "1-2 sentence concept",
      "activation": "concrete activation plan",
      "partnership_angle": "why this partnership makes sense",
      "cta": "call to action for outreach"
    }
  ]
}`,
    ]
      .filter(Boolean)
      .join("\n"),
  };
}

export function proposalPrompt(args: {
  company: CompanyContext;
  campaign: { title: string; summary?: string | null; activation?: string | null; cta?: string | null };
}) {
  return {
    system: [
      "You are a senior B2B sponsorship proposal writer.",
      "Write a professional, persuasive sponsorship proposal aimed at the target company.",
      "Output MUST be valid JSON matching the requested schema. No markdown fences.",
    ].join("\n"),
    user: [
      `Company: ${args.company.company_name}`,
      args.company.industry ? `Industry: ${args.company.industry}` : null,
      args.company.country ? `Country: ${args.company.country}` : null,
      "",
      `Campaign: ${args.campaign.title}`,
      args.campaign.summary ? `Summary: ${args.campaign.summary}` : null,
      args.campaign.activation ? `Activation: ${args.campaign.activation}` : null,
      args.campaign.cta ? `CTA: ${args.campaign.cta}` : null,
      "",
      "Return JSON of shape:",
      `{
  "title": "Proposal title",
  "executive_summary": "string (~120 words)",
  "campaign_rationale": "string (~150 words)",
  "sponsorship_value": "string describing the value to the sponsor",
  "activation_plan": "string with concrete steps",
  "deliverables": ["string", "string", "string"],
  "investment_note": "string (high-level, no specific currency)",
  "cta": "single-sentence call to action"
}`,
    ]
      .filter(Boolean)
      .join("\n"),
  };
}

export function outreachEmailPrompt(args: {
  company: CompanyContext;
  proposalTitle: string;
  proposalSummary: string;
  contactName?: string | null;
}) {
  return {
    system: [
      "You write concise, warm B2B outreach emails for sponsorship deals.",
      "Tone: confident, professional, no fluff. Keep under 180 words.",
      "Output MUST be valid JSON. No markdown fences.",
    ].join("\n"),
    user: [
      `Company: ${args.company.company_name}`,
      args.contactName ? `Contact: ${args.contactName}` : null,
      `Proposal title: ${args.proposalTitle}`,
      `Proposal summary: ${args.proposalSummary}`,
      "",
      "Return JSON of shape:",
      `{
  "subject": "short subject line",
  "body_text": "plain text body",
  "body_html": "same body, simple HTML (<p>...</p>)"
}`,
    ]
      .filter(Boolean)
      .join("\n"),
  };
}

export function followupEmailPrompt(args: {
  company: CompanyContext;
  previousSubject: string;
  previousBody: string;
  daysSinceSent: number;
}) {
  return {
    system: [
      "You draft polite, low-pressure follow-up emails for a sponsorship outreach.",
      "Keep under 120 words. Reference the prior message lightly.",
      "Output MUST be valid JSON. No markdown fences.",
    ].join("\n"),
    user: [
      `Company: ${args.company.company_name}`,
      `Original subject: ${args.previousSubject}`,
      `Days since last contact: ${args.daysSinceSent}`,
      "",
      "Original message (for tone, not to be quoted verbatim):",
      args.previousBody,
      "",
      "Return JSON of shape:",
      `{
  "subject": "follow-up subject (reuse or prefix with Re:)",
  "body_text": "plain text body",
  "body_html": "<p>...</p> body"
}`,
    ].join("\n"),
  };
}
