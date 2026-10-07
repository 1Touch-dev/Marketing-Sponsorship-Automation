import { CORITIBA_CLUB_CONTEXT_INPUT, type ClubContextInput } from "../bedrock/prompts";
import { PLAYBOOKS, type PlaybookId } from "./definitions";

const PURPOSE: Record<Exclude<PlaybookId, "pitch">, (detail: string) => string> = {
  conversation: (detail) =>
    `Purpose: open a conversation. Say who you are, why you are writing to this company in ONE sentence that uses only the facts given, and ask ONE genuine question about their goals, or offer a 15-minute call.${detail ? ` Topic to raise: ${detail}` : ""}`,
  invitation: (detail) =>
    `Purpose: invite the recipient to the following, stating the details exactly as given and inventing nothing (no dates, places, guests or benefits beyond these): ${detail}. Ask them to reply to confirm.`,
  introduction: (detail) =>
    `Purpose: introduce the following club work and why it might matter to them, with no ask beyond "happy to share more if it is useful": ${detail}`,
};

/**
 * The email for a relationship-first playbook (Task 13): short, human, no
 * proposal, no price, no link. The model gets only the facts a person supplied.
 */
export function relationshipEmailPrompt(args: {
  playbook: Exclude<PlaybookId, "pitch">;
  companyName: string;
  industry?: string | null;
  contactName?: string | null;
  contactTitle?: string | null;
  senderName?: string | null;
  senderTitle?: string | null;
  detail?: string | null;
  /** The verified club figures block (lib/claims), or the "none available" block. */
  verifiedClaims?: string;
  /** A buyer brief block, if a person has already written one. */
  buyerBrief?: string;
  tenant?: ClubContextInput;
}) {
  const tenant = args.tenant ?? CORITIBA_CLUB_CONTEXT_INPUT;
  const club = tenant.club_facts.club_name;
  const sender = args.senderName
    ? `Sender: ${args.senderName}${args.senderTitle ? `, ${args.senderTitle}` : ""} — Departamento Comercial, ${club}`
    : `Sender: Departamento Comercial, ${club}`;
  const def = PLAYBOOKS[args.playbook];

  return {
    system: [
      `You write short, human emails in Brazilian Portuguese for ${club}'s commercial department.`,
      `This is a RELATIONSHIP email (${def.label}), not a sales pitch. The recipient has not asked to hear from us.`,
      "Tone: warm, respectful, curious, never salesy.",
      "HARD RULES:",
      "1. Under 120 words.",
      "2. No proposal, no sponsorship package, no price, discount, budget or return-on-investment claim.",
      "3. No link, no attachment, no tracking mention.",
      "4. Use only the facts provided below about the company. Do not invent facts about the company, its plans, results or people.",
      "5. Do not state any number about the club unless it appears in the VERIFIED CLUB FIGURES block.",
      "6. Exactly one soft call to action (a reply, a short call, or confirming an invitation).",
      "7. Never use [Nome] or any placeholder: use the names provided, or a polite greeting if no name is given.",
      "8. Output MUST be valid JSON only, no markdown fences.",
      "",
      args.verifiedClaims ?? "VERIFIED CLUB FIGURES: none are currently available. State no number about the club.",
    ].join("\n"),
    user: [
      `Company: ${args.companyName}`,
      args.industry ? `Industry: ${args.industry}` : null,
      args.contactName ? `Contact name: ${args.contactName}` : null,
      args.contactTitle ? `Contact title: ${args.contactTitle}` : null,
      sender,
      "",
      PURPOSE[args.playbook](args.detail?.trim() ?? ""),
      args.buyerBrief ? `\nBackground only (do not quote it back to them):\n${args.buyerBrief}` : null,
      "",
      `Return JSON: {"subject": "short, specific subject line, no sales language", "body_text": "plain text body", "body_html": "HTML version with <p> tags and no links"}`,
    ]
      .filter(Boolean)
      .join("\n"),
  };
}
