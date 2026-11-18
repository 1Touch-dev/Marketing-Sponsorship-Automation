/**
 * Staff invite / password-reset links.
 *
 * Never email Supabase action_link (Safe Links / scanners burn single-use tokens).
 * Email an app URL with hashed_token; verifyOtp runs only when the user submits Set password.
 *
 * Audit / logs must never receive token_hash, full URL, action_link, or email body.
 */

import { createClient } from "@supabase/supabase-js";
import { supabaseAdmin } from "@/lib/supabase/server";
import { serverEnv } from "@/lib/env";
import { resolveAppUrl } from "@/lib/url";
import { sendSystemEmail } from "@/lib/mail/system";

export type PasswordLinkKind = "invite" | "recovery";

export const PASSWORD_LINK_VALID_MINUTES = 60;

export const FORGOT_PASSWORD_GENERIC_MESSAGE =
  "If this email has an account, we sent a link";

/** Safe audit metadata only — no tokens, URLs, or email bodies. */
export function passwordLinkAuditMeta(
  email: string,
  kind: PasswordLinkKind,
): { email: string; kind: PasswordLinkKind; link_valid_minutes: number } {
  return {
    email: email.trim().toLowerCase(),
    kind,
    link_valid_minutes: PASSWORD_LINK_VALID_MINUTES,
  };
}

/** Anon client with no cookies — for verifying a current password without touching the session. */
export function supabaseAnonNoSession() {
  const env = serverEnv();
  return createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}

export async function findAuthUserByEmail(email: string): Promise<{ id: string; email: string } | null> {
  const normalized = email.trim().toLowerCase();
  if (!normalized) return null;
  const admin = supabaseAdmin();
  // Small staff tenant — one page is enough; paginate if needed.
  let page = 1;
  const perPage = 200;
  for (;;) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage });
    if (error) throw new Error(error.message);
    const users = data?.users ?? [];
    const hit = users.find((u) => (u.email ?? "").toLowerCase() === normalized);
    if (hit?.id) return { id: hit.id, email: hit.email ?? normalized };
    if (users.length < perPage) return null;
    page += 1;
    if (page > 20) return null;
  }
}

/** Build a Set of lowercased Auth emails (for Login accounts has_auth_user enrichment). */
export async function listAuthEmailsLower(): Promise<Set<string>> {
  const admin = supabaseAdmin();
  const out = new Set<string>();
  let page = 1;
  const perPage = 200;
  for (;;) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage });
    if (error) throw new Error(error.message);
    const users = data?.users ?? [];
    for (const u of users) {
      if (u.email) out.add(u.email.toLowerCase());
    }
    if (users.length < perPage) break;
    page += 1;
    if (page > 20) break;
  }
  return out;
}

export function buildSetPasswordAppUrl(opts: {
  tokenHash: string;
  kind: PasswordLinkKind;
  appUrl?: string;
}): string {
  const base = (opts.appUrl ?? resolveAppUrl()).replace(/\/$/, "");
  const q = new URLSearchParams({
    token_hash: opts.tokenHash,
    type: opts.kind,
  });
  return `${base}/auth/set-password?${q.toString()}`;
}

/**
 * generateLink → hashed_token app URL. Never returns or emails action_link.
 */
export async function createPasswordLink(opts: {
  email: string;
  kind: PasswordLinkKind;
  appUrl?: string;
}): Promise<{ appLink: string }> {
  const email = opts.email.trim().toLowerCase();
  const admin = supabaseAdmin();
  const { data, error } = await admin.auth.admin.generateLink({
    type: opts.kind,
    email,
  });
  if (error) throw new Error(error.message);
  const hashed = data?.properties?.hashed_token;
  if (!hashed || typeof hashed !== "string") {
    throw new Error("Supabase generateLink did not return hashed_token");
  }
  return {
    appLink: buildSetPasswordAppUrl({
      tokenHash: hashed,
      kind: opts.kind,
      appUrl: opts.appUrl,
    }),
  };
}

export function passwordLinkEmailCopy(opts: {
  appLink: string;
  kind: PasswordLinkKind;
}): { subject: string; bodyText: string; bodyHtml: string } {
  const isInvite = opts.kind === "invite";
  const subject = isInvite
    ? "Defina sua senha / Set your password — Coritiba FC"
    : "Redefinir senha / Reset your password — Coritiba FC";

  const ptLead = isInvite
    ? "Você foi convidado para a plataforma de patrocínios do Coritiba FC. Defina sua senha neste link (válido por 1 hora, uso único):"
    : "Recebemos um pedido para redefinir a senha da sua conta. Use este link (válido por 1 hora, uso único):";
  const enLead = isInvite
    ? "You were invited to the Coritiba FC sponsorship platform. Set your password with this link (valid 1 hour, single use):"
    : "We received a request to reset your account password. Use this link (valid 1 hour, single use):";

  const bodyText = [
    ptLead,
    opts.appLink,
    "",
    enLead,
    opts.appLink,
    "",
    "Se você não solicitou isso, ignore este e-mail. / If you did not request this, ignore this email.",
  ].join("\n");

  const bodyHtml = [
    `<p>${escapeHtml(ptLead)}</p>`,
    `<p><a href="${escapeAttr(opts.appLink)}">${escapeHtml(opts.appLink)}</a></p>`,
    `<p>${escapeHtml(enLead)}</p>`,
    `<p><a href="${escapeAttr(opts.appLink)}">${escapeHtml(opts.appLink)}</a></p>`,
    `<p style="color:#666;font-size:12px">Se você não solicitou isso, ignore este e-mail. / If you did not request this, ignore this email.</p>`,
  ].join("");

  return { subject, bodyText, bodyHtml };
}

export async function sendPasswordLinkEmail(opts: {
  tenantId: string;
  to: string;
  kind: PasswordLinkKind;
  appLink: string;
}): Promise<{ provider: "ses" | "gmail"; messageId?: string }> {
  const copy = passwordLinkEmailCopy({ appLink: opts.appLink, kind: opts.kind });
  return sendSystemEmail({
    tenantId: opts.tenantId,
    to: opts.to.trim().toLowerCase(),
    subject: copy.subject,
    bodyText: copy.bodyText,
    bodyHtml: copy.bodyHtml,
    tag: opts.kind === "invite" ? "auth-invite" : "auth-reset",
  });
}

/** Create link + send SES/Gmail system email. */
export async function issuePasswordLinkEmail(opts: {
  tenantId: string;
  email: string;
  kind: PasswordLinkKind;
  appUrl?: string;
}): Promise<void> {
  const { appLink } = await createPasswordLink({
    email: opts.email,
    kind: opts.kind,
    appUrl: opts.appUrl,
  });
  await sendPasswordLinkEmail({
    tenantId: opts.tenantId,
    to: opts.email,
    kind: opts.kind,
    appLink,
  });
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function escapeAttr(s: string): string {
  return escapeHtml(s).replace(/'/g, "&#39;");
}
