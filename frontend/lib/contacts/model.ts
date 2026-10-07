/**
 * Contact standing (Task 14): roles over time, verified channels, do-not-contact
 * and authorized senders. Every answer is derived from the newest row of an
 * append-only ledger, never from a flag someone can flip back quietly.
 */

export const CONTACT_ROLES = ["decision_maker", "influencer", "champion", "billing", "signatory", "legal", "technical", "other"] as const;
export type ContactRole = (typeof CONTACT_ROLES)[number];

export const SUPPRESSION_REASONS = ["asked_to_stop", "complaint", "bounce", "wrong_person", "client_request", "internal_decision", "other"] as const;
export type SuppressionReason = (typeof SUPPRESSION_REASONS)[number];

export const CHANNELS = ["email", "phone", "linkedin", "whatsapp"] as const;
export type Channel = (typeof CHANNELS)[number];

export const normalizeEmail = (e: string) => e.trim().toLowerCase();

// ── do not contact ──────────────────────────────────────────────────────────

export interface SuppressionRow {
  decision: "suppressed" | "lifted";
  reason_code: SuppressionReason;
  note: string | null;
  actor_kind: "human" | "system";
  actor: string;
  source: string;
  created_at: string;
}

/** The newest row decides. Rows are given in any order. */
export function latest<T extends { created_at: string }>(rows: T[]): T | null {
  let best: T | null = null;
  for (const r of rows) if (!best || r.created_at >= best.created_at) best = r;
  return best;
}

export interface ChannelCheckRow {
  outcome: "verified" | "bounced" | "invalid";
  method: string;
  checked_by: string;
  created_at: string;
}

export type ChannelStatus = "verified" | "bounced" | "invalid" | "unverified";

export const channelStatus = (checks: ChannelCheckRow[]): ChannelStatus => latest(checks)?.outcome ?? "unverified";

export interface Block {
  code: "suppressed_email" | "suppressed_company" | "bad_channel" | "sender_not_authorized" | "check_failed";
  message: string;
}

export interface RecipientVerdict {
  allowed: boolean;
  blocks: Block[];
  warnings: string[];
  channel: ChannelStatus;
}

const REASON_TEXT: Record<SuppressionReason, string> = {
  asked_to_stop: "asked us to stop contacting them",
  complaint: "complained",
  bounce: "their address bounced",
  wrong_person: "is not the right person",
  client_request: "the account asked us not to contact them",
  internal_decision: "an internal decision",
  other: "another reason",
};

/** Can this recipient be contacted? A person-level or company-level suppression, or a dead address, says no. */
export function evaluateRecipient(input: { emailRows: SuppressionRow[]; companyRows: SuppressionRow[]; channelChecks: ChannelCheckRow[] }): RecipientVerdict {
  const blocks: Block[] = [];
  const warnings: string[] = [];

  const e = latest(input.emailRows as Array<SuppressionRow>);
  if (e?.decision === "suppressed") {
    blocks.push({ code: "suppressed_email", message: `Do not contact: ${REASON_TEXT[e.reason_code]}${e.note ? ` ("${e.note}")` : ""}, recorded by ${e.actor} on ${e.created_at.slice(0, 10)}.` });
  }
  const c = latest(input.companyRows as Array<SuppressionRow>);
  if (c?.decision === "suppressed") {
    blocks.push({ code: "suppressed_company", message: `Do not contact this company: ${REASON_TEXT[c.reason_code]}${c.note ? ` ("${c.note}")` : ""}, recorded by ${c.actor} on ${c.created_at.slice(0, 10)}.` });
  }
  const channel = channelStatus(input.channelChecks);
  if (channel === "bounced" || channel === "invalid") {
    blocks.push({ code: "bad_channel", message: `This email address is marked ${channel === "bounced" ? "as bounced" : "as invalid"}. Verify it with the person, or use another address.` });
  } else if (channel === "unverified") {
    warnings.push("This email address has not been verified.");
  }
  return { allowed: blocks.length === 0, blocks, warnings, channel };
}

// ── roles ───────────────────────────────────────────────────────────────────

export interface RoleRow {
  id: string;
  role: ContactRole;
  started_on: string;
  ended_on: string | null;
  note: string | null;
  assigned_by: string;
  ended_by: string | null;
  end_reason: string | null;
}

/** Roles held on a date (default today), and the full history, newest first. */
export function rolesAsOf(rows: RoleRow[], asOf: string): { current: RoleRow[]; history: RoleRow[] } {
  const history = [...rows].sort((a, b) => (a.started_on < b.started_on ? 1 : a.started_on > b.started_on ? -1 : 0));
  const current = history.filter((r) => r.started_on <= asOf && (r.ended_on === null || r.ended_on > asOf));
  return { current, history };
}

// ── opt-out in a reply ──────────────────────────────────────────────────────

const QUOTE_MARKERS = [/^\s*>/m, /^\s*(Em|On)\s.{5,120}(escreveu|wrote)\s*:?\s*$/im, /^-{2,}\s*(Original Message|Mensagem original)/im];

/** What the person wrote, without the email they replied to. */
export function stripQuoted(text: string): string {
  let cut = text.length;
  for (const re of QUOTE_MARKERS) {
    const m = re.exec(text);
    if (m && m.index < cut) cut = m.index;
  }
  return text.slice(0, cut);
}

const OPT_OUT = [
  /\bn[ãa]o\s+(me\s+)?(envie|mande|contate|escreva|ligue)\s+(mais|novamente|de\s+novo)/i,
  /\bpare\s+de\s+(me\s+)?(enviar|mandar|escrever|contatar)/i,
  /\bn[ãa]o\s+quero\s+(mais\s+)?(receber|ser\s+contatad)/i,
  /\b(me\s+)?(remov\w*|tire|exclu\w*)\s+(d[aeo]s?\s+)?(sua|essa|esta|suas|vossa)?\s*(lista|mailing|cadastro)/i,
  /\bremov\w*\s+(meu|o\s+meu)\s+(e-?mail|contato|endere[cç]o)/i,
  /\bdescadastr\w*/i,
  /\bcancel\w*\s+(a\s+)?(minha\s+)?inscri[cç][aã]o/i,
  /\bunsubscribe\b/i,
  /\bremove\s+me\b/i,
  /\b(stop|quit)\s+(emailing|contacting|sending|writing)/i,
  /\bdo\s+not\s+(contact|email)\s+me\b/i,
  /\bdon'?t\s+(contact|email)\s+me\b/i,
  /\btake\s+me\s+off\b/i,
];

/** True when the reply itself asks us to stop. A plain "not interested" is not an opt-out: it declines one pitch. */
export function detectOptOut(replyText: string): { optOut: boolean; matched?: string } {
  const own = stripQuoted(replyText);
  for (const re of OPT_OUT) {
    const m = own.match(re);
    if (m) return { optOut: true, matched: m[0].trim().slice(0, 60) };
  }
  return { optOut: false };
}

/** "Ana Souza <ana@acme.com>" -> "ana@acme.com". */
export function emailFromHeader(from: string): string | null {
  const m = from.match(/<([^>]+@[^>]+)>/) ?? from.match(/([^\s<>"]+@[^\s<>"]+)/);
  return m ? normalizeEmail(m[1]) : null;
}

// ── authorized senders ──────────────────────────────────────────────────────

export interface AuthorizationRow { decision: "granted" | "revoked"; created_at: string }

export const isAuthorized = (rows: AuthorizationRow[]): boolean => latest(rows)?.decision === "granted";
