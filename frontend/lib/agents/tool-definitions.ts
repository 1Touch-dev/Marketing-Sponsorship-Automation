/**
 * Tool definitions in the JSON Schema format required by Bedrock ConverseCommand.
 */
import type { ToolDefinition } from "@/lib/bedrock/client";

export const AGENT_TOOLS: ToolDefinition[] = [
  {
    toolSpec: {
      name: "enrich_contacts",
      description:
        "Find decision maker emails and contacts at the company using Hunter.io and Apollo. Returns contacts with email, name, position, seniority. Call this first.",
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
        "Scrape LinkedIn company profile, detect active Google/Meta ad campaigns, and extract social media presence. Use before generating the proposal.",
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
      name: "generate_personalized_proposal",
      description:
        "Generate a NEW AI sponsorship proposal uniquely tailored to this company using their intelligence data (industry, competitors, ads, contacts). Saves as under_review — human must approve before email is sent. Always call this (do not reuse old proposals).",
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
        "INTERNAL — only called after proposal is approved. Do not call during initial agent run.",
      inputSchema: {
        json: {
          type: "object",
          properties: {
            proposal_id: { type: "string" },
            recipient_email: { type: "string" },
            recipient_name: { type: "string" },
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
        "INTERNAL — only after human approves email draft. Do not call during initial agent run.",
      inputSchema: {
        json: {
          type: "object",
          properties: {
            email_id: { type: "string" },
          },
          required: ["email_id"],
        },
      },
    },
  },
];

/** Tools Claude may call in phase 1 (before proposal approval). */
export const PHASE1_AGENT_TOOLS = AGENT_TOOLS.filter((t) =>
  ["enrich_contacts", "scrape_company_intelligence", "generate_personalized_proposal"].includes(
    t.toolSpec.name
  )
);

export const TOOL_LABELS: Record<string, string> = {
  enrich_contacts: "Finding decision makers (Hunter + Apollo)…",
  scrape_company_intelligence: "Scraping campaigns & social signals (Apify)…",
  generate_personalized_proposal: "Generating personalized proposal (Bedrock)…",
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
  generate_personalized_proposal: (r) =>
    r.found
      ? `Proposal drafted: "${r.proposal_title ?? "N/A"}" — awaiting approval`
      : "Proposal generation failed",
  generate_outreach_email: (r) =>
    r.email_id ? `Email drafted for ${r.recipient ?? "recipient"}` : "Email draft failed",
  send_email: (r) =>
    r.sent
      ? `Sent · Pipedrive activity #${r.pipedrive_activity_id ?? "N/A"}`
      : "Send failed",
};
