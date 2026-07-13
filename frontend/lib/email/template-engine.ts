import { supabaseAdmin } from "@/lib/supabase/server";
import { invokeClaude } from "@/lib/bedrock/client";
import { validateAiOutput, emailOutputSchema, type EmailOutput } from "@/lib/ai/schemas";
import type { EmailTemplate } from "@/types/database";

export type EmailTemplateVariables = {
  company_name: string;
  contact_name: string;
  contact_title: string;
  proposal_summary: string;
  proposal_link: string;
  sender_name: string;
  sender_title: string;
};

const VAR_PATTERN = /\{\{\s*([a-z_]+)\s*\}\}/gi;
// Also match Portuguese bracket style: [Nome], [Empresa], [Link], [Valor]
const BRACKET_VAR_PATTERN = /\[(Nome|Empresa|Valor|Link|Contato|Gerente)\]/gi;
const BRACKET_VAR_MAP: Record<string, keyof EmailTemplateVariables> = {
  nome: "contact_name",
  empresa: "company_name",
  link: "proposal_link",
  valor: "proposal_summary",
  contato: "contact_name",
  gerente: "sender_name",
};

export function replaceTemplateVariables(
  text: string,
  vars: EmailTemplateVariables
): string {
  const map: Record<string, string> = {
    company_name: vars.company_name,
    contact_name: vars.contact_name,
    nome_contato: vars.contact_name,
    contact_title: vars.contact_title,
    proposal_summary: vars.proposal_summary,
    proposal_link: vars.proposal_link,
    link_proposta: vars.proposal_link,
    sender_name: vars.sender_name,
    nome_gerente: vars.sender_name,
    sender_title: vars.sender_title,
    empresa: vars.company_name,
    valor_proposta: vars.proposal_summary,
  };
  // Replace {{variable}} format
  let result = text.replace(VAR_PATTERN, (_, key: string) => {
    const k = key.toLowerCase();
    return map[k] ?? "";
  });
  // Replace [Nome] / [Empresa] bracket format
  result = result.replace(BRACKET_VAR_PATTERN, (_, key: string) => {
    const varKey = BRACKET_VAR_MAP[key.toLowerCase()];
    if (!varKey) return `[${key}]`;
    return vars[varKey] ?? `[${key}]`;
  });
  return result;
}

export function hasUnresolvedVariables(text: string): string[] {
  const unresolved: string[] = [];
  const bracketMatches = text.match(/\[[A-Z][a-záéíóúâêîôûãõç]+\]/g) ?? [];
  const handlebarMatches = text.match(/\{\{[^}]+\}\}/g) ?? [];
  unresolved.push(...bracketMatches, ...handlebarMatches);
  return unresolved;
}

/** @deprecated Use hasUnresolvedVariables() which returns the list */
export function emailHasUnresolved(text: string): boolean {
  return hasUnresolvedVariables(text).length > 0;
}

export async function loadDefaultEmailTemplate(): Promise<EmailTemplate | null> {
  const sb = supabaseAdmin();
  const { data } = await sb
    .from("email_templates")
    .select("*")
    .eq("active", true)
    .eq("is_default", true)
    .limit(1)
    .maybeSingle();

  if (!data) {
    const { data: fallback } = await sb
      .from("email_templates")
      .select("*")
      .eq("active", true)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    return normalizeTemplate(fallback);
  }
  return normalizeTemplate(data);
}

function normalizeTemplate(row: Record<string, unknown> | null): EmailTemplate | null {
  if (!row) return null;
  let variables: string[] = [];
  const raw = row.variables;
  if (Array.isArray(raw)) variables = raw as string[];
  else if (typeof raw === "string") {
    try {
      variables = JSON.parse(raw) as string[];
    } catch {
      variables = [];
    }
  }
  return { ...(row as unknown as EmailTemplate), variables };
}

export async function generateEmailWithTemplate(args: {
  template: EmailTemplate;
  variables: EmailTemplateVariables;
  companyName: string;
  proposalTitle: string;
}): Promise<{ output: EmailOutput; templateId: string; templateName: string } | null> {
  const { template } = args;
  const filledSubject = replaceTemplateVariables(template.subject, args.variables);
  const filledHtml = replaceTemplateVariables(template.body_html, args.variables);
  const filledText = replaceTemplateVariables(template.body_text ?? "", args.variables);

  const system = [
    "You personalize Coritiba FC sponsorship outreach emails in Brazilian Portuguese.",
    "You receive a pre-filled HTML email template. Improve warmth and clarity while keeping structure, links, and sender signature.",
    "Do NOT leave any {{variable}} placeholders. Do NOT use [Nome] or bracket placeholders.",
    "Return valid JSON only.",
  ].join("\n");

  const user = [
    `Company: ${args.companyName}`,
    `Proposal: ${args.proposalTitle}`,
    "",
    "Filled subject:",
    filledSubject,
    "",
    "Filled HTML template (personalize prose, keep links and signature):",
    filledHtml,
    "",
    "Filled plain text reference:",
    filledText,
    "",
    `Return JSON: { "subject": "...", "body_text": "...", "body_html": "..." }`,
  ].join("\n");

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const claude = await invokeClaude<unknown>({
        system,
        messages: [{ role: "user", content: user }],
        json: true,
        maxTokens: 900,
        temperature: 0.45,
      });
      const vr = validateAiOutput(emailOutputSchema, claude.json, {
        workflow: "email.template",
      });
      if (!vr.ok || !vr.data) continue;

      let subject = vr.data.subject;
      let bodyHtml = vr.data.body_html ?? `<p>${vr.data.body_text.replace(/\n/g, "</p><p>")}</p>`;
      let bodyText = vr.data.body_text;

      if (hasUnresolvedVariables(subject + bodyHtml + bodyText).length > 0) {
        subject = replaceTemplateVariables(subject, args.variables);
        bodyHtml = replaceTemplateVariables(bodyHtml, args.variables);
        bodyText = replaceTemplateVariables(bodyText, args.variables);
      }

      // Ensure proposal link CTA is present even if Claude omitted it
      bodyHtml = injectProposalLinkIfMissing(bodyHtml, args.variables.proposal_link);
      bodyText = injectProposalLinkTextIfMissing(bodyText, args.variables.proposal_link);

      return {
        output: { subject, body_text: bodyText, body_html: bodyHtml },
        templateId: template.id,
        templateName: template.name,
      };
    } catch {
      /* retry */
    }
  }

  if (hasUnresolvedVariables(filledSubject + filledHtml).length > 0) return null;

  // Ensure every email has a proposal link CTA even if the template omits it.
  // We append a minimal branded block only when: proposal_link is non-empty
  // AND neither the filled HTML nor text already contains the link.
  const ensuredHtml = injectProposalLinkIfMissing(filledHtml, args.variables.proposal_link);
  const ensuredText = injectProposalLinkTextIfMissing(
    filledText || filledHtml.replace(/<[^>]+>/g, " "),
    args.variables.proposal_link
  );

  return {
    output: {
      subject: filledSubject,
      body_text: ensuredText,
      body_html: ensuredHtml,
    },
    templateId: template.id,
    templateName: template.name,
  };
}

/**
 * Wraps all external http(s) links with a click-tracking redirect endpoint
 * so we can record when the recipient clicks a link in the email.
 * Skips our own tracking endpoints and unsubscribe links.
 */
export function wrapLinksForTracking(html: string, emailId: string, appUrl: string): string {
  if (!emailId || !appUrl) return html;
  return html.replace(
    /href="(https?:\/\/[^"]+)"/g,
    (match, url: string) => {
      if (url.includes("/api/emails/") || url.includes("/api/newsletter/unsubscribe")) return match;
      return `href="${appUrl}/api/emails/${emailId}/click?url=${encodeURIComponent(url)}"`;
    }
  );
}

/**
 * Appends a 1x1 tracking pixel just before </body> (or at end) so we can
 * detect when the recipient opens the email.
 */
export function injectTrackingPixel(html: string, emailId: string, appUrl: string): string {
  if (!emailId || !appUrl) return html;
  const pixel = `<img src="${appUrl}/api/emails/${emailId}/pixel" width="1" height="1" style="display:none" alt="" />`;
  if (html.includes("</body>")) return html.replace("</body>", `${pixel}</body>`);
  return html + pixel;
}

/**
 * Appends a "Ver Proposta" CTA button to the HTML body if the template
 * does not already include the proposal link.
 */
function injectProposalLinkIfMissing(html: string, proposalLink: string): string {
  if (!proposalLink || html.includes(proposalLink)) return html;
  const ctaBlock = `
<div style="margin:24px 0;text-align:center;">
  <a href="${proposalLink}"
     style="display:inline-block;background:#006B3F;color:#ffffff;font-weight:700;font-size:15px;
            text-decoration:none;padding:14px 32px;border-radius:8px;">
    Ver Proposta Completa →
  </a>
</div>
<p style="font-size:12px;color:#888;text-align:center;">
  Ou acesse: <a href="${proposalLink}" style="color:#006B3F;">${proposalLink}</a>
</p>`;
  // Insert before closing </body> or append at end
  if (html.includes("</body>")) return html.replace("</body>", `${ctaBlock}</body>`);
  return html + ctaBlock;
}

function injectProposalLinkTextIfMissing(text: string, proposalLink: string): string {
  if (!proposalLink || text.includes(proposalLink)) return text;
  return text + `\n\nVer Proposta Completa: ${proposalLink}`;
}

/**
 * Appends an LGPD-compliant footer with unsubscribe link before </body>.
 */
export function injectNewsletterFooter(html: string, recipientEmail: string, appUrl: string): string {
  const footer = `
<div style="margin-top:32px;padding-top:16px;border-top:1px solid #e5e7eb;text-align:center;font-size:11px;color:#9ca3af;line-height:1.6">
  <p>Coritiba FC · Departamento Comercial · Rua Campo Comprido, 669 · Curitiba/PR</p>
  <p>Você está recebendo esta mensagem porque demonstrou interesse em patrocinar o Coritiba FC.</p>
  <p><a href="${appUrl}/api/newsletter/unsubscribe?email=${encodeURIComponent(recipientEmail)}" style="color:#6b7280">Descadastrar-se desta lista</a></p>
</div>`;
  if (html.includes("</body>")) return html.replace("</body>", `${footer}</body>`);
  return html + footer;
}

export async function resolveDefaultSender(sb: ReturnType<typeof supabaseAdmin>) {
  let senderName = "Departamento Comercial";
  let senderTitle = "";
  try {
    const { data: sender, error } = await sb
      .from("team_members")
      .select("full_name, title")
      .eq("default_sender", true)
      .eq("active", true)
      .limit(1)
      .maybeSingle();
    if (!error && sender) {
      senderName = sender.full_name ?? senderName;
      senderTitle = sender.title ?? "";
    }
  } catch {
    /* non-fatal */
  }
  return { senderName, senderTitle };
}
