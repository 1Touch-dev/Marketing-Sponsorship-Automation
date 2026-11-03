import { filterRecipients } from "@/lib/contacts/store";
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { z } from "zod";
import { requirePermission } from "@/lib/auth/server-permission";
import { resolveTenantId } from "@/lib/tenants/current";
import { clubReplyTo, mailProvider } from "@/lib/mail/config";
import { dispatchNewsletter, parseSendTime, queueNewsletter } from "@/lib/mail/newsletter";
import { sendViaSes } from "@/lib/mail/ses";
import { isMissingMigration } from "@/lib/proposals/revision-store";
import { resolveAppUrl } from "@/lib/url";

export const runtime = "nodejs";

const sendSchema = z.object({
  subject: z.string().min(1),
  body_html: z.string().min(1),
  recipient_company_ids: z.array(z.string().uuid()).optional(),
  recipient_emails: z.array(z.string().email()).optional(),
  send_to_all_contacts: z.boolean().optional().default(false),
  /** When to send, as the date picker gives it (no zone = Brasília time). Empty or past = now. */
  scheduled_for: z.string().optional(),
});

/** GET /api/newsletter — list past newsletters */
export async function GET() {
  const sb = supabaseAdmin();
  const tenantId = await resolveTenantId();
  const { data, error } = await sb
    .from("newsletters")
    .select("*")
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) {
    if (error.message?.includes("does not exist") || error.code === "42P01") {
      return NextResponse.json([]);
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json(data ?? []);
}

/** POST /api/newsletter — queue a newsletter, and send it through Amazon SES now or at the chosen time */
export async function POST(req: Request) {
  const auth = await requirePermission("send_proposal");
  if ("error" in auth) return auth.error;

  const body = await req.json().catch(() => ({}));
  const parsed = sendSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload", issues: parsed.error.issues }, { status: 400 });
  }
  const { subject, body_html, recipient_company_ids, recipient_emails, send_to_all_contacts, scheduled_for } = parsed.data;

  // Never say "sent" for mail that cannot go out: without SES switched on, refuse and say why.
  if (mailProvider() !== "ses") {
    return NextResponse.json({ error: "Sending email is not switched on for this server yet (MAIL_PROVIDER is not ses). Nothing was sent." }, { status: 503 });
  }

  let sendAt: Date | null = null;
  if (scheduled_for?.trim()) {
    sendAt = parseSendTime(scheduled_for);
    if (!sendAt) return NextResponse.json({ error: "scheduled_for is not a valid date and time" }, { status: 400 });
  }

  const sb = supabaseAdmin();
  let resolvedEmails: string[] = recipient_emails ?? [];

  if (send_to_all_contacts || (recipient_company_ids && recipient_company_ids.length > 0)) {
    let query = sb.from("contacts").select("email").eq("tenant_id", auth.user.tenant_id);
    if (!send_to_all_contacts && recipient_company_ids?.length) {
      query = query.in("company_id", recipient_company_ids);
    }
    const { data: contacts } = await query;
    const contactEmails = (contacts ?? []).map((c) => c.email).filter(Boolean);
    resolvedEmails = [...new Set([...resolvedEmails, ...contactEmails])];
  }

  // Leave out anyone on the do-not-contact list, at a suppressed company, or with a dead address.
  const filtered = await filterRecipients(sb, auth.user.tenant_id, resolvedEmails);
  if (filtered.allowed.length === 0) {
    return NextResponse.json({ error: "No recipients left to contact", skipped: filtered.skipped }, { status: 400 });
  }

  let newsletter;
  try {
    newsletter = await queueNewsletter(sb, {
      tenantId: auth.user.tenant_id, subject, html: body_html, allowed: filtered.allowed, skipped: filtered.skipped,
      sendAt, createdBy: auth.user.email, replyTo: clubReplyTo(auth.user.email),
    });
  } catch (err) {
    const cause = (err as { cause?: { code?: string; message?: string } }).cause;
    if (cause && isMissingMigration(cause as never)) {
      return NextResponse.json({ error: "Run migration 0077_mail_delivery.sql in Supabase first. Nothing was sent." }, { status: 503 });
    }
    return NextResponse.json({ error: err instanceof Error ? err.message : "Could not save the newsletter" }, { status: 500 });
  }

  const later = !!sendAt && sendAt.getTime() > Date.now() + 30_000;
  if (!later) {
    // Sent in the background so the page is not held for the whole list; a scheduler run picks it up if the server restarts meanwhile.
    void dispatchNewsletter(sb, { newsletterId: newsletter.id, send: sendViaSes, appUrl: resolveAppUrl(req), delayMs: 100 }).catch((e) =>
      console.error("[newsletter] dispatch failed", e instanceof Error ? e.message : e),
    );
  }

  const n = filtered.allowed.length;
  return NextResponse.json({
    success: true,
    newsletter: { ...newsletter, status: later ? "scheduled" : "sending" },
    recipient_count: n,
    skipped: filtered.skipped,
    message: later
      ? `Scheduled for ${sendAt!.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })} (Brasília) to ${n} recipient${n === 1 ? "" : "s"}.`
      : `Sending to ${n} recipient${n === 1 ? "" : "s"}. The Send history shows the result.`,
  });
}
