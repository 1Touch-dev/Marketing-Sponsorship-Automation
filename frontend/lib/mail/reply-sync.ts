/**
 * Match inbound Graph messages to Phase A SES outreach and ingest replies.
 */
import { detectOptOut, emailFromHeader, normalizeEmail } from "@/lib/contacts/model";
import { recordSuppression } from "@/lib/contacts/store";
import { classifyReply } from "@/lib/emails/reply-classifier";
import { recordAudit } from "@/lib/audit/log";
import { serviceActor, type Actor } from "@/lib/identity/actor";
import { normalizeSesMessageId } from "@/lib/mail/outreach";
import {
  fetchInboxDelta,
  graphMailbox,
  headerValue,
  type GraphMessage,
  GraphSyncStateNotFoundError,
} from "@/lib/mail/ms-graph";
import { logger } from "@/lib/monitoring/logger";

type Sb = any;

const LOCK_MINUTES = 4;
const PAGE_CAP = 10;
const SOFT_MATCH_DAYS = 30;

export type ReplySyncCounts = {
  scanned: number;
  hard_matched: number;
  soft_matched: number;
  ooo: number;
  inserted: number;
  skipped: number;
  pages: number;
  truncated: boolean;
  errors: string[];
};

export function extractReferencedMessageIds(headers: { name?: string; value?: string }[] | null | undefined): string[] {
  const raw = [headerValue(headers, "In-Reply-To"), headerValue(headers, "References")]
    .filter(Boolean)
    .join(" ");
  const ids = raw.match(/<[^>]+>/g) ?? raw.split(/\s+/).filter((s) => s.includes("@"));
  const out: string[] = [];
  const seen = new Set<string>();
  for (const id of ids) {
    const { bare } = normalizeSesMessageId(id);
    if (!bare || seen.has(bare)) continue;
    seen.add(bare);
    out.push(bare);
  }
  return out;
}

export function isAutomaticReply(msg: GraphMessage, bodyText: string): boolean {
  const auto = headerValue(msg.internetMessageHeaders, "Auto-Submitted");
  if (auto && auto.toLowerCase() !== "no") return true;
  const sub = (msg.subject ?? "").toLowerCase();
  if (
    sub.includes("automatic reply") ||
    sub.includes("auto-reply") ||
    sub.includes("out of office") ||
    sub.includes("fora do escrit") ||
    sub.includes("resposta autom")
  ) {
    return true;
  }
  const head = bodyText.slice(0, 400).toLowerCase();
  if (head.includes("out of office") || head.includes("automatic reply") || head.includes("resposta automática")) {
    return true;
  }
  return false;
}

export function looksLikeReplySubject(subject: string | null | undefined): boolean {
  return /^(re|res|fw|fwd)\s*:/i.test((subject ?? "").trim());
}

/** Strip scripts/handlers; enough for stored inbound HTML when Prefer-text failed. */
export function sanitizeInboundHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?>[\s\S]*?<\/style>/gi, "")
    .replace(/\son\w+\s*=\s*(['"]).*?\1/gi, "")
    .replace(/\son\w+\s*=\s*[^\s>]+/gi, "")
    .replace(/javascript:/gi, "");
}

export function messageBody(msg: GraphMessage): { text: string; html: string | null } {
  const content = msg.body?.content ?? "";
  const type = (msg.body?.contentType ?? "text").toLowerCase();
  if (type === "html") {
    const html = sanitizeInboundHtml(content);
    const text = html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    return { text, html };
  }
  return { text: content.trim(), html: null };
}

export function dedupeKey(internetMessageId: string): string {
  const { raw } = normalizeSesMessageId(internetMessageId);
  return `msgraph:${raw}`;
}

async function acquireLock(sb: Sb, tenantId: string, mailbox: string): Promise<boolean> {
  const now = new Date();
  const until = new Date(now.getTime() + LOCK_MINUTES * 60_000).toISOString();
  const { data: existing } = await sb
    .from("mail_sync_state")
    .select("lock_until")
    .eq("tenant_id", tenantId)
    .eq("mailbox", mailbox)
    .maybeSingle();

  if (existing?.lock_until && new Date(existing.lock_until).getTime() > now.getTime()) {
    return false;
  }

  if (!existing) {
    const { error } = await sb.from("mail_sync_state").insert({
      tenant_id: tenantId,
      mailbox,
      lock_until: until,
      updated_at: now.toISOString(),
    });
    // Concurrent insert race: treat as locked by the other runner.
    return !error;
  }

  await sb
    .from("mail_sync_state")
    .update({ lock_until: until, updated_at: now.toISOString() })
    .eq("tenant_id", tenantId)
    .eq("mailbox", mailbox);
  return true;
}

async function releaseLock(sb: Sb, tenantId: string, mailbox: string, cursorToSave: string | null, persistCursor: boolean) {
  const patch: Record<string, unknown> = {
    lock_until: null,
    updated_at: new Date().toISOString(),
  };
  if (persistCursor && cursorToSave) patch.delta_link = cursorToSave;
  await sb.from("mail_sync_state").update(patch).eq("tenant_id", tenantId).eq("mailbox", mailbox);
}

async function clearCursor(sb: Sb, tenantId: string, mailbox: string) {
  await sb
    .from("mail_sync_state")
    .update({ delta_link: null, updated_at: new Date().toISOString() })
    .eq("tenant_id", tenantId)
    .eq("mailbox", mailbox);
}

async function loadCursor(sb: Sb, tenantId: string, mailbox: string): Promise<string | null> {
  const { data } = await sb
    .from("mail_sync_state")
    .select("delta_link")
    .eq("tenant_id", tenantId)
    .eq("mailbox", mailbox)
    .maybeSingle();
  return data?.delta_link ?? null;
}

async function findOutboundByBareReceipt(sb: Sb, tenantId: string, bare: string): Promise<{
  id: string;
  proposal_id: string | null;
  recipient: string;
  status: string;
} | null> {
  const { data: ev } = await sb
    .from("message_events")
    .select("email_id")
    .eq("tenant_id", tenantId)
    .eq("event_type", "provider_accepted")
    .eq("provider_receipt_id", bare)
    .order("occurred_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  let emailId = ev?.email_id as string | undefined;
  if (!emailId) {
    const { data: rows } = await sb
      .from("emails")
      .select("id, proposal_id, recipient, status, metadata")
      .eq("tenant_id", tenantId)
      .eq("direction", "outbound")
      .in("status", ["sent", "opened", "replied", "sending"])
      .order("sent_at", { ascending: false })
      .limit(200);
    const hit = (rows ?? []).find(
      (r: { metadata?: { provider_message_id?: string } }) => r.metadata?.provider_message_id === bare,
    );
    if (!hit) return null;
    return hit as { id: string; proposal_id: string | null; recipient: string; status: string };
  }

  const { data: email } = await sb
    .from("emails")
    .select("id, proposal_id, recipient, status")
    .eq("id", emailId)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  return email ?? null;
}

async function findSoftMatchParent(
  sb: Sb,
  tenantId: string,
  fromEmail: string,
): Promise<{ id: string; proposal_id: string | null; recipient: string; status: string } | null> {
  const since = new Date(Date.now() - SOFT_MATCH_DAYS * 86_400_000).toISOString();
  const { data: rows } = await sb
    .from("emails")
    .select("id, proposal_id, recipient, status, sent_at")
    .eq("tenant_id", tenantId)
    .eq("direction", "outbound")
    .in("status", ["sent", "opened", "replied"])
    .gte("sent_at", since)
    .order("sent_at", { ascending: false })
    .limit(100);
  const hit = (rows ?? []).find(
    (r: { recipient?: string }) => normalizeEmail(String(r.recipient ?? "")) === fromEmail,
  );
  return (hit as { id: string; proposal_id: string | null; recipient: string; status: string } | undefined) ?? null;
}

async function alreadyImported(sb: Sb, tenantId: string, key: string): Promise<boolean> {
  const { data } = await sb
    .from("emails")
    .select("id")
    .eq("tenant_id", tenantId)
    .eq("gmail_message_id", key)
    .maybeSingle();
  return !!data;
}

type ClassifyFn = (args: {
  subject: string;
  bodyText: string;
}) => Promise<{ classification: string; confidence: number; summary: string }>;

async function ingestOne(
  sb: Sb,
  tenantId: string,
  mailbox: string,
  msg: GraphMessage,
  actor: Actor,
  counts: ReplySyncCounts,
  classifyFn: ClassifyFn = classifyReply,
): Promise<void> {
  const internetId = msg.internetMessageId?.trim();
  if (!internetId) {
    counts.skipped += 1;
    return;
  }
  const key = dedupeKey(internetId);
  if (await alreadyImported(sb, tenantId, key)) {
    counts.skipped += 1;
    return;
  }

  const { text, html } = messageBody(msg);
  const fromRaw =
    msg.from?.emailAddress?.address
      ? `${msg.from.emailAddress.name ?? ""} <${msg.from.emailAddress.address}>`.trim()
      : headerValue(msg.internetMessageHeaders, "From") ?? "unknown";
  const fromEmail = emailFromHeader(fromRaw) ?? normalizeEmail(msg.from?.emailAddress?.address ?? "");

  if (isAutomaticReply(msg, text)) {
    // Link under parent when In-Reply-To matches — never flip parent to replied.
    let oooParent: { id: string; proposal_id: string | null } | null = null;
    for (const bare of extractReferencedMessageIds(msg.internetMessageHeaders)) {
      oooParent = await findOutboundByBareReceipt(sb, tenantId, bare);
      if (oooParent) break;
    }
    const { data: inserted } = await sb
      .from("emails")
      .upsert(
        {
          tenant_id: tenantId,
          gmail_message_id: key,
          proposal_id: oooParent?.proposal_id ?? null,
          direction: "inbound",
          sender: fromRaw,
          recipient: mailbox,
          subject: msg.subject ?? "(sem assunto)",
          body_text: text,
          body_html: html,
          status: "received",
          reply_classification: "out_of_office",
          reply_classification_confidence: 1,
          reply_summary: "Automatic / out-of-office reply",
          reply_classified_at: new Date().toISOString(),
          created_at: msg.receivedDateTime ?? new Date().toISOString(),
          metadata: {
            match_method: "ooo",
            internet_message_id: internetId,
            ms_graph_id: msg.id,
            ...(oooParent ? { parent_email_id: oooParent.id } : {}),
          },
        },
        { onConflict: "gmail_message_id", ignoreDuplicates: true },
      )
      .select("id")
      .maybeSingle();
    if (inserted?.id) counts.inserted += 1;
    else counts.skipped += 1;
    counts.ooo += 1;
    return;
  }

  const refs = extractReferencedMessageIds(msg.internetMessageHeaders);
  let parent: { id: string; proposal_id: string | null; recipient: string; status: string } | null = null;
  let matchMethod: "hard" | "soft" | null = null;

  for (const bare of refs) {
    parent = await findOutboundByBareReceipt(sb, tenantId, bare);
    if (parent) {
      matchMethod = "hard";
      break;
    }
  }

  if (!parent && fromEmail && looksLikeReplySubject(msg.subject)) {
    parent = await findSoftMatchParent(sb, tenantId, fromEmail);
    if (parent) matchMethod = "soft";
  }

  if (!parent || !matchMethod) {
    counts.skipped += 1;
    return;
  }

  const needsReview = matchMethod === "soft";
  const metadata: Record<string, unknown> = {
    parent_email_id: parent.id,
    match_method: matchMethod,
    needs_review: needsReview,
    internet_message_id: internetId,
    ms_graph_id: msg.id,
  };

  const { data: inserted } = await sb
    .from("emails")
    .upsert(
      {
        tenant_id: tenantId,
        gmail_message_id: key,
        proposal_id: parent.proposal_id,
        direction: "inbound",
        sender: fromRaw,
        recipient: mailbox,
        subject: msg.subject ?? "(sem assunto)",
        body_text: text,
        body_html: html,
        status: "received",
        status_reason: needsReview ? "Needs review" : null,
        created_at: msg.receivedDateTime ?? new Date().toISOString(),
        metadata,
      },
      { onConflict: "gmail_message_id", ignoreDuplicates: true },
    )
    .select("id")
    .maybeSingle();

  if (!inserted?.id) {
    counts.skipped += 1;
    return;
  }
  counts.inserted += 1;
  if (matchMethod === "hard") counts.hard_matched += 1;
  else counts.soft_matched += 1;

  // Soft match: do not flip parent to replied (plan lock).
  if (matchMethod === "hard" && parent.status !== "replied") {
    await sb
      .from("emails")
      .update({ status: "replied", replied_at: new Date().toISOString() })
      .eq("id", parent.id)
      .eq("tenant_id", tenantId);
  }

  await recordAudit({
    actor,
    tenant_id: tenantId,
    entity_type: "email",
    entity_id: parent.id,
    action: "email.reply_detected",
    metadata: {
      source: "ms_graph",
      match_method: matchMethod,
      internet_message_id: internetId,
      inbound_email_id: inserted.id,
      needs_review: needsReview,
    },
  });

  if (text) {
    const optOut = detectOptOut(text);
    if (optOut.optOut && fromEmail) {
      await recordSuppression(sb, tenantId, {
        email: fromEmail,
        decision: "suppressed",
        reasonCode: "asked_to_stop",
        note: `Replied: "${optOut.matched}"`,
        actor: { kind: "system", name: "reply-sync" },
        source: "reply_opt_out",
      });
    }
    if (matchMethod === "hard") {
      try {
        const result = await classifyFn({ subject: msg.subject ?? "", bodyText: text });
        await sb
          .from("emails")
          .update({
            reply_classification: result.classification,
            reply_classification_confidence: result.confidence,
            reply_summary: result.summary,
            reply_classified_at: new Date().toISOString(),
          })
          .eq("id", inserted.id)
          .eq("tenant_id", tenantId);
      } catch (err) {
        logger.warn("reply classification failed", { error: String(err), email_id: inserted.id });
      }
    }
  }
}

/**
 * One sync run for a tenant mailbox. Safe for cron every 5 minutes.
 */
export async function syncMailboxReplies(
  sb: Sb,
  tenantId: string,
  opts: {
    actor?: Actor;
    mailbox?: string;
    pageCap?: number;
    fetch?: typeof fetch;
    /** Tests inject a stub; production uses classifyReply. */
    classifyReply?: ClassifyFn;
  } = {},
): Promise<ReplySyncCounts> {
  const mailbox = (opts.mailbox ?? graphMailbox()).toLowerCase();
  const actor = opts.actor ?? serviceActor("mail-reply-sync");
  const classifyFn = opts.classifyReply ?? classifyReply;
  const counts: ReplySyncCounts = {
    scanned: 0,
    hard_matched: 0,
    soft_matched: 0,
    ooo: 0,
    inserted: 0,
    skipped: 0,
    pages: 0,
    truncated: false,
    errors: [],
  };

  const locked = await acquireLock(sb, tenantId, mailbox);
  if (!locked) {
    counts.errors.push("sync already running");
    return counts;
  }

  let cursor = await loadCursor(sb, tenantId, mailbox);
  let persistCursor = false;
  let cursorToSave: string | null = null;

  try {
    let delta;
    try {
      delta = await fetchInboxDelta(mailbox, cursor, {
        pageCap: opts.pageCap ?? PAGE_CAP,
        fetch: opts.fetch,
      });
    } catch (err) {
      if (err instanceof GraphSyncStateNotFoundError) {
        await clearCursor(sb, tenantId, mailbox);
        cursor = null;
        delta = await fetchInboxDelta(mailbox, null, {
          pageCap: opts.pageCap ?? PAGE_CAP,
          fetch: opts.fetch,
        });
      } else {
        throw err;
      }
    }

    counts.pages = delta.pages;
    counts.truncated = delta.truncated;
    counts.scanned = delta.messages.length;

    for (const msg of delta.messages) {
      try {
        await ingestOne(sb, tenantId, mailbox, msg, actor, counts, classifyFn);
      } catch (err) {
        counts.errors.push(err instanceof Error ? err.message : String(err));
      }
    }

    // Persist cursor after ingest of this window (including truncated nextLink continuation).
    cursorToSave = delta.cursorToSave;
    persistCursor = !!cursorToSave && counts.errors.length === 0;
  } catch (err) {
    counts.errors.push(err instanceof Error ? err.message : String(err));
    persistCursor = false;
  } finally {
    await releaseLock(sb, tenantId, mailbox, cursorToSave, persistCursor);
  }

  return counts;
}
