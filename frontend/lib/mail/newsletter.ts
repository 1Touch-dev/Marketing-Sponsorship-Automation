import { filterRecipients } from "@/lib/contacts/store";
import { injectNewsletterFooter } from "@/lib/email/template-engine";
import { fromFor, replyToFor } from "./config";
import { MailError, type MailSender, type OutgoingMail } from "./ses";
import { makeUnsubscribeToken, unsubscribeHeaders, unsubscribeUrl } from "./unsubscribe";

type Sb = any;

/** How long a newsletter may sit in "sending" before another run takes it over (the server was restarted mid-send). */
export const STALE_SENDING_MINUTES = 5;
const MAX_ATTEMPTS = 3;
const chunk = <T,>(a: T[], n: number) => Array.from({ length: Math.ceil(a.length / n) }, (_, i) => a.slice(i * n, (i + 1) * n));

export function htmlToText(html: string): string {
  return html
    .replace(/<(style|script)[\s\S]*?<\/\1>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|h[1-6]|li|tr)>/gi, "\n")
    .replace(/<a\s[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi, (_m, href, label) => (label.replace(/<[^>]+>/g, "").trim() === href ? href : `${label.replace(/<[^>]+>/g, "").trim()} (${href})`))
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** One recipient's copy: the footer carries THEIR signed unsubscribe link, and the headers let their mail program offer one-click unsubscribe. */
export function buildNewsletterMail(a: { subject: string; html: string; recipient: string; tenantId: string; appUrl: string; replyTo?: string | null }): OutgoingMail {
  const url = unsubscribeUrl(a.appUrl, makeUnsubscribeToken(a.tenantId, a.recipient));
  const html = injectNewsletterFooter(a.html, a.recipient, a.appUrl, url);
  return { to: a.recipient, subject: a.subject, html, text: `${htmlToText(a.html)}\n\n--\nPara não receber mais estas mensagens: ${url}`, kind: "newsletter", replyTo: a.replyTo, headers: unsubscribeHeaders(url), tag: "newsletter" };
}

/**
 * Brazil has no daylight saving since 2019, so a time with no zone, as the page's date picker sends it, is UTC-3.
 * Returns null for something that is not a date.
 */
export function parseSendTime(v: string | null | undefined): Date | null {
  if (!v?.trim()) return null;
  const s = v.trim();
  const d = new Date(/(Z|[+-]\d{2}:?\d{2})$/i.test(s) ? s : `${s.length === 16 ? `${s}:00` : s}-03:00`);
  return Number.isNaN(d.getTime()) ? null : d;
}

export interface QueueInput {
  tenantId: string;
  subject: string;
  html: string;
  allowed: string[];
  skipped: Array<{ email: string; reason: string }>;
  /** When to send. Null or in the past: as soon as a run picks it up. */
  sendAt: Date | null;
  createdBy: string;
  replyTo?: string | null;
  now?: Date;
}

/** Writes the newsletter and one row per recipient. Nothing is sent here. */
export async function queueNewsletter(sb: Sb, q: QueueInput) {
  const now = q.now ?? new Date();
  const when = q.sendAt && q.sendAt.getTime() > now.getTime() ? q.sendAt : now;
  const { data: nl, error } = await sb
    .from("newsletters")
    .insert({
      tenant_id: q.tenantId,
      subject: q.subject,
      body_html: q.html,
      recipient_count: q.allowed.length,
      recipient_emails: q.allowed,
      status: "scheduled",
      scheduled_for: when.toISOString(),
      from_address: fromFor("newsletter").address,
      reply_to: replyToFor(q.replyTo) ?? null,
      created_by: q.createdBy,
    })
    .select("*")
    .single();
  if (error || !nl) throw Object.assign(new Error(error?.message ?? "could not save the newsletter"), { cause: error });
  const rows = [
    ...q.allowed.map((email) => ({ tenant_id: q.tenantId, newsletter_id: nl.id, email, status: "queued" })),
    ...q.skipped.map((s) => ({ tenant_id: q.tenantId, newsletter_id: nl.id, email: s.email.toLowerCase(), status: "skipped", skip_reason: s.reason })),
  ];
  for (const part of chunk(rows, 400)) {
    const { error: e2 } = await sb.from("newsletter_deliveries").insert(part);
    if (e2) throw Object.assign(new Error(e2.message), { cause: e2 });
  }
  return nl as { id: string; status: string; scheduled_for: string; recipient_count: number } & Record<string, unknown>;
}

export interface DispatchResult { claimed: boolean; accepted: number; failed: number; skipped: number; status?: string }

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Sends every queued recipient of one newsletter through `send`, one at a time (SES allows 14 a second; this stays well under).
 * Safe to run twice: only one run can take the newsletter, and only recipients still "queued" are sent. A recipient who was
 * unsubscribed or bounced since the newsletter was queued is skipped, not mailed.
 */
export async function dispatchNewsletter(
  sb: Sb,
  a: { newsletterId: string; send: MailSender; appUrl: string; delayMs?: number; now?: Date; retryDelaysMs?: number[] },
): Promise<DispatchResult> {
  const now = a.now ?? new Date();
  const nowIso = now.toISOString();

  // Take it: scheduled -> sending, or a "sending" one nobody has touched for a while.
  let { data: got } = await sb.from("newsletters").update({ status: "sending", started_at: nowIso }).eq("id", a.newsletterId).eq("status", "scheduled").select("*");
  if (!got?.length) {
    const stale = new Date(now.getTime() - STALE_SENDING_MINUTES * 60_000).toISOString();
    ({ data: got } = await sb.from("newsletters").update({ started_at: nowIso }).eq("id", a.newsletterId).eq("status", "sending").lt("started_at", stale).select("*"));
  }
  const nl = got?.[0];
  if (!nl) return { claimed: false, accepted: 0, failed: 0, skipped: 0 };

  const { data: queued } = await sb.from("newsletter_deliveries").select("id, email, attempts").eq("newsletter_id", nl.id).eq("status", "queued").limit(5000);
  const list = (queued ?? []) as Array<{ id: string; email: string; attempts: number }>;

  // Who may still be mailed right now.
  const verdict = list.length ? await filterRecipients(sb, nl.tenant_id, list.map((r) => r.email)) : { allowed: [], skipped: [] };
  const ok = new Set<string>(verdict.allowed);
  const why = new Map<string, string>((verdict.skipped as Array<{ email: string; reason: string }>).map((s) => [s.email, s.reason]));

  let accepted = 0, failed = 0, skipped = 0;
  const retry = a.retryDelaysMs ?? [500, 2000];
  for (const r of list) {
    const email = r.email.toLowerCase();
    if (!ok.has(email)) {
      await sb.from("newsletter_deliveries").update({ status: "skipped", skip_reason: why.get(email) ?? "not allowed to be contacted", last_event_at: new Date().toISOString() }).eq("id", r.id);
      skipped++;
      continue;
    }
    let attempts = r.attempts, lastErr: MailError | Error | null = null, messageId: string | null = null;
    while (attempts < MAX_ATTEMPTS) {
      attempts++;
      try {
        messageId = (await a.send(buildNewsletterMail({ subject: nl.subject, html: nl.body_html ?? "", recipient: email, tenantId: nl.tenant_id, appUrl: a.appUrl, replyTo: nl.reply_to }))).messageId;
        lastErr = null;
        break;
      } catch (err) {
        lastErr = err as Error;
        if (!(err instanceof MailError && err.transient) || attempts >= MAX_ATTEMPTS) break;
        await sleep(retry[Math.min(attempts - 1, retry.length - 1)] ?? 500);
      }
    }
    const at = new Date().toISOString();
    if (messageId) {
      await sb.from("newsletter_deliveries").update({ status: "accepted", provider_message_id: messageId, attempts, accepted_at: at, last_event_at: at, error: null }).eq("id", r.id);
      accepted++;
    } else {
      await sb.from("newsletter_deliveries").update({ status: "failed", attempts, error: String(lastErr?.message ?? "send failed").slice(0, 300), last_event_at: at }).eq("id", r.id);
      failed++;
    }
    if (a.delayMs) await sleep(a.delayMs);
  }

  // Count what really happened, including recipients an earlier run already handled.
  const { data: all } = await sb.from("newsletter_deliveries").select("status").eq("newsletter_id", nl.id).limit(10000);
  const n = (s: string[]) => (all ?? []).filter((d: { status: string }) => s.includes(d.status)).length;
  const done = n(["accepted", "delivered", "bounced", "complained"]);
  const bad = n(["failed"]);
  const status = done > 0 && bad === 0 ? "sent" : done > 0 ? "partial" : "failed";
  await sb.from("newsletters").update({ status, sent_at: done > 0 ? nowIso : null, finished_at: new Date().toISOString() }).eq("id", nl.id);
  return { claimed: true, accepted, failed, skipped, status };
}

/** Newsletters ready to go: scheduled and due, or stuck in "sending". */
export async function dueNewsletterIds(sb: Sb, now = new Date()): Promise<string[]> {
  const stale = new Date(now.getTime() - STALE_SENDING_MINUTES * 60_000).toISOString();
  const [due, stuck] = await Promise.all([
    sb.from("newsletters").select("id").eq("status", "scheduled").lte("scheduled_for", now.toISOString()).order("scheduled_for", { ascending: true }).limit(10),
    sb.from("newsletters").select("id").eq("status", "sending").lt("started_at", stale).limit(10),
  ]);
  return [...(due.data ?? []), ...(stuck.data ?? [])].map((r: { id: string }) => r.id);
}
