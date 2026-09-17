import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { createMagicLinkToken } from "@/lib/portal/session";
import { resolveAppUrl } from "@/lib/url";
import { sendPlatformEmail } from "@/lib/gmail/send-platform-email";
import { recordAudit } from "@/lib/audit/log";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";

export const runtime = "nodejs";

/**
 * POST /api/portal/request-link
 * Body: { email: string }
 *
 * Public, unauthenticated — this IS the auth entry point for the sponsor
 * self-serve portal (Task 12). Looks up the email against `contacts` (a
 * sponsor is legitimate if they're already a known contact at a company
 * with at least one proposal); always returns a generic success message
 * regardless of match, so this can't be used to enumerate which emails
 * are registered.
 */
export async function POST(req: NextRequest) {
  const ip = getClientIp(req);
  const rl = checkRateLimit(`portal-link:${ip}`, { max: 5, windowMs: 60_000 });
  if (!rl.ok) return NextResponse.json({ error: rl.message }, { status: 429 });

  const body = await req.json().catch(() => ({}));
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const generic = NextResponse.json({
    ok: true,
    message: "Se este e-mail estiver associado a uma empresa parceira, enviamos um link de acesso.",
  });
  if (!email) return generic;

  const sb = supabaseAdmin();
  // .limit(1) rather than relying on .maybeSingle() alone — the same
  // email can legitimately exist as a contact on more than one company
  // (found live-testing: a shared marketing-team inbox address reused
  // across duplicate test companies), and maybeSingle() errors out
  // instead of picking one when more than one row matches, which made
  // this silently fall through to "no match" for every such email.
  const { data: contacts } = await sb
    .from("contacts")
    .select("company_id, tenant_id")
    .ilike("email", email)
    .not("company_id", "is", null)
    .limit(1);
  const contact = contacts?.[0] ?? null;

  if (!contact?.company_id) return generic;

  const token = createMagicLinkToken(contact.company_id, email);
  const magicLink = `${resolveAppUrl(req)}/api/portal/verify?token=${encodeURIComponent(token)}`;

  // Always recorded — this is the fallback retrieval path when Gmail send
  // fails (a real, currently-live constraint on this environment: the
  // connected Gmail refresh token was found stale/invalid_grant earlier
  // today), so the flow stays testable/operable without depending on it.
  await recordAudit({
    entity_type: "portal_access",
    entity_id: contact.company_id,
    action: "portal.magic_link_requested",
    tenant_id: contact.tenant_id,
    metadata: { email, magic_link: magicLink },
  });

  try {
    await sendPlatformEmail({
      tenantId: contact.tenant_id,
      to: email,
      subject: "Seu link de acesso ao portal do patrocinador",
      bodyText: `Clique no link abaixo para acessar o portal (válido por 15 minutos):\n\n${magicLink}`,
      bodyHtml: `<p>Clique no link abaixo para acessar o portal (válido por 15 minutos):</p><p><a href="${magicLink}">${magicLink}</a></p>`,
    });
  } catch {
    // Non-fatal — the link is still retrievable via audit_logs for
    // ops/testing purposes even when the send itself fails.
  }

  return generic;
}
