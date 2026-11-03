import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { resolveClubContext } from "@/lib/tenants/club-context";
import { externalActor } from "@/lib/identity/actor";
import { recordAudit } from "@/lib/audit/log";
import { logFingerprint } from "@/lib/identity/privacy";
import { recordSuppression } from "@/lib/contacts/store";
import { verifyUnsubscribeToken } from "@/lib/mail/unsubscribe";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const page = (inner: string, status = 200) =>
  new NextResponse(
    `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Descadastro</title><style>body{font-family:system-ui,sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;background:#f9fafb;margin:0}main{text-align:center;max-width:420px;padding:40px;background:#fff;border-radius:16px;box-shadow:0 1px 3px rgba(0,0,0,.1)}button{background:#00544d;color:#fff;border:0;border-radius:8px;padding:12px 20px;font-size:15px;cursor:pointer}h2{color:#1a1a1a;margin:0 0 8px}p{color:#6b7280;line-height:1.6}</style></head><body><main>${inner}</main></body></html>`,
    { status, headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" } },
  );
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

/**
 * GET shows a confirmation; it never unsubscribes. Mail programs and security scanners open every link in a message, and
 * that must not remove anyone from the list. The person confirms with the button, which POSTs the same link.
 */
export async function GET(req: NextRequest) {
  const token = new URL(req.url).searchParams.get("t");
  const who = verifyUnsubscribeToken(token);
  if (!who) {
    return page(`<h2>Link inválido</h2><p>Este link de descadastro não é válido. Responda ao e-mail que você recebeu e pediremos a remoção manualmente.</p>`, 400);
  }
  return page(`<h2>Deixar de receber estas mensagens?</h2><p>O e-mail <strong>${esc(who.email)}</strong> será removido da nossa lista.</p><form method="post" action="?t=${encodeURIComponent(token!)}"><button type="submit">Confirmar descadastro</button></form>`);
}

/** The person's confirmation, or the one-click request a mail program sends (List-Unsubscribe-Post). Puts the address on the do-not-contact list. */
export async function POST(req: NextRequest) {
  const who = verifyUnsubscribeToken(new URL(req.url).searchParams.get("t"));
  if (!who) return page(`<h2>Link inválido</h2><p>Este link de descadastro não é válido.</p>`, 400);

  const sb = supabaseAdmin();
  const r = await recordSuppression(sb, who.tenantId, {
    email: who.email, decision: "suppressed", reasonCode: "asked_to_stop", note: "Unsubscribed from a newsletter",
    actor: { kind: "system", name: "newsletter-unsubscribe" }, source: "newsletter_unsubscribe",
  });
  if (!r.ok) return page(`<h2>Não foi possível concluir</h2><p>Tente novamente em instantes ou responda ao e-mail que você recebeu.</p>`, 500);

  // The address is a person's data and the log is permanent, so only a fingerprint of it is written here.
  await recordAudit({
    actor: externalActor("newsletter recipient", `recipient:${logFingerprint(who.email)}`),
    tenant_id: who.tenantId,
    action: "newsletter.unsubscribed",
    entity_type: "contact",
    entity_id: null,
    metadata: { email_fingerprint: logFingerprint(who.email), already: r.value.already, timestamp: new Date().toISOString() },
  });

  const tenant = await resolveClubContext(who.tenantId);
  const clubName = tenant.club_facts.short_name ?? tenant.club_facts.club_name;
  return page(`<div style="font-size:48px;margin-bottom:16px">✅</div><h2>Descadastro realizado</h2><p>O e-mail <strong>${esc(who.email)}</strong> foi removido da nossa lista. Você não receberá mais comunicações da ${esc(String(clubName))}.</p>`);
}
