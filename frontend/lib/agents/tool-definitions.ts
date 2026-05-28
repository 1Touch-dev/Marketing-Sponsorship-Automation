/**
 * Tool definitions in the JSON Schema format required by Bedrock ConverseCommand.
 * These describe what each tool does and what input Claude should provide.
 */
import type { ToolDefinition } from "@/lib/bedrock/client";

export const AGENT_TOOLS: ToolDefinition[] = [
  {
    toolSpec: {
      name: "enrich_contacts",
      description:
        "Find decision maker emails and contacts at the company using Hunter.io domain search. Returns a list of contacts with email, name, position, seniority, and confidence score. Call this first to identify who to send the outreach email to.",
      inputSchema: {
        json: {
          type: "object",
          properties: {
            company_id: { type: "string", description: "UUID of the company in the database" },
            domain: { type: "string", description: "Company website domain, e.g. redbull.com" },
          },
          required: ["company_id", "domain"],
        },
      },
    },
  },
  {
    toolSpec: {
      name: "scrape_company_intelligence",
      description:
        "Scrape LinkedIn company profile, detect active Google/Meta ad campaigns, and extract social media presence. Returns employee count, headquarters, industry, social score, and active campaign signals. Use this to personalise the outreach email.",
      inputSchema: {
        json: {
          type: "object",
          properties: {
            company_id: { type: "string", description: "UUID of the company" },
            company_name: { type: "string", description: "Full company name" },
            domain: { type: "string", description: "Company website domain" },
          },
          required: ["company_id", "company_name", "domain"],
        },
      },
    },
  },
  {
    toolSpec: {
      name: "get_or_create_proposal",
      description:
        "Find an approved sponsorship proposal for this company, or auto-approve the latest draft proposal. Returns proposal_id, title, and key package highlights needed for email personalisation. Must be called before generate_outreach_email.",
      inputSchema: {
        json: {
          type: "object",
          properties: {
            company_id: { type: "string", description: "UUID of the company" },
          },
          required: ["company_id"],
        },
      },
    },
  },
  {
    toolSpec: {
      name: "generate_outreach_email",
      description:
        "Generate a personalised PT-BR outreach email draft for the top decision maker using the approved proposal content. Creates and stores the email in the database as 'pending_approval'. Returns email_id, subject, and preview.",
      inputSchema: {
        json: {
          type: "object",
          properties: {
            proposal_id: { type: "string", description: "UUID of the approved proposal" },
            recipient_email: { type: "string", description: "Email address of the decision maker" },
            recipient_name: { type: "string", description: "Full name of the decision maker (optional)" },
          },
          required: ["proposal_id", "recipient_email"],
        },
      },
    },
  },
  {
    toolSpec: {
      name: "send_email",
      description:
        "Send the generated email via Pipedrive. Logs it as a Pipedrive Activity and updates the deal stage to Negociação. Only call this after generate_outreach_email. In supervised mode the user approves before this is called.",
      inputSchema: {
        json: {
          type: "object",
          properties: {
            email_id: { type: "string", description: "UUID of the email to send" },
          },
          required: ["email_id"],
        },
      },
    },
  },
];

export const TOOL_LABELS: Record<string, string> = {
  enrich_contacts: "Finding decision makers (Hunter.io)…",
  scrape_company_intelligence: "Scraping campaigns & social signals (Apify)…",
  get_or_create_proposal: "Checking for approved proposal…",
  generate_outreach_email: "Drafting personalised email (Bedrock)…",
  send_email: "Sending via Pipedrive…",
};

export const TOOL_DONE_LABELS: Record<string, (result: Record<string, unknown>) => string> = {
  enrich_contacts: (r) =>
    r.found
      ? `${r.decision_makers ?? 0} decision makers · ${r.contacts_found ?? 0} contacts found`
      : "No contacts found — will use generic recipient",
  scrape_company_intelligence: (r) =>
    r.found
      ? `LinkedIn found · Social score ${r.social_score ?? 0}/10 · Ads: ${r.ad_spend_signal ?? "unknown"}`
      : "Intelligence scraped (partial data)",
  get_or_create_proposal: (r) =>
    r.found
      ? `Proposal: "${r.proposal_title ?? "N/A"}"`
      : "No proposal available — please create one first",
  generate_outreach_email: (r) =>
    r.email_id ? `Email drafted for ${r.recipient ?? "recipient"}` : "Email draft failed",
  send_email: (r) =>
    r.sent
      ? `Sent · Pipedrive activity #${r.pipedrive_activity_id ?? "N/A"}`
      : "Send failed",
};
