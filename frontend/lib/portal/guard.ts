import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { isMissingMigration } from "@/lib/proposals/revision-store";
import { recordAudit } from "@/lib/audit/log";
import { externalActor } from "@/lib/identity/actor";
import { PORTAL_COOKIE, verifySessionToken } from "./session";

type Sb = any;

/** Who a sponsor session is, as the server has just confirmed it. The company and the club come from here, never from the request. */
export interface PortalContext { companyId: string; tenantId: string; email: string; companyName: string; issuedAt: number; expiresAt: number }

export type PortalAuth =
  | { ok: true; ctx: PortalContext }
  | { ok: false; status: 401 | 403; error: string; reason: "no_session" | "company_gone" | "contact_removed" | "access_ended" };

/**
 * THE guard for everything a sponsor session can reach. A signed cookie proves the person once got a link; it does
 * not prove they still have access. So every request is checked again, on the server:
 *   1. the cookie is genuine and unexpired;
 *   2. the sponsor company still exists;
 *   3. that email is still a contact of that company;
 *   4. nobody has ended this access since the session was issued (portal_revocations).
 * Nothing about which company or which club comes from the URL, the body or a header.
 */
export async function resolvePortalSession(sb: Sb, token: string | undefined, now = Date.now()): Promise<PortalAuth> {
  const session = verifySessionToken(token);
  if (!session || session.expiresAt < now) return { ok: false, status: 401, error: "Sign in to the sponsor portal.", reason: "no_session" };
  const email = session.email.trim().toLowerCase();

  const { data: company } = await sb.from("companies").select("id, company_name, tenant_id").eq("id", session.companyId).maybeSingle();
  if (!company) return { ok: false, status: 401, error: "Sign in to the sponsor portal.", reason: "company_gone" };
  const tenantId = (company as { tenant_id: string }).tenant_id;

  const { data: contacts } = await sb.from("contacts").select("id").eq("tenant_id", tenantId).eq("company_id", company.id).ilike("email", email).limit(1);
  if (!contacts || contacts.length === 0) return { ok: false, status: 403, error: "This access has ended.", reason: "contact_removed" };

  const rev = await sb.from("portal_revocations").select("email, revoked_at").eq("tenant_id", tenantId).eq("company_id", company.id).gte("revoked_at", new Date(session.issuedAt).toISOString());
  if (rev.error && !isMissingMigration(rev.error)) return { ok: false, status: 403, error: "This access could not be confirmed.", reason: "access_ended" };
  const ended = ((rev.data ?? []) as Array<{ email: string | null }>).some((r) => r.email === null || r.email === email);
  if (ended) return { ok: false, status: 403, error: "This access has ended.", reason: "access_ended" };

  return { ok: true, ctx: { companyId: company.id, tenantId, email, companyName: company.company_name, issuedAt: session.issuedAt, expiresAt: session.expiresAt } };
}

/** For route handlers: the confirmed sponsor session from the request's cookie, or the response to send back. */
export async function requirePortalSession(sb: Sb = supabaseAdmin()): Promise<{ ctx: PortalContext } | { error: NextResponse }> {
  const auth = await resolvePortalSession(sb, cookies().get(PORTAL_COOKIE)?.value);
  if (auth.ok) return { ctx: auth.ctx };
  // a genuine cookie that no longer works is worth a record; a missing one is just a visitor
  if (auth.reason === "contact_removed" || auth.reason === "access_ended") {
    const session = verifySessionToken(cookies().get(PORTAL_COOKIE)?.value);
    if (session) await recordAudit({ actor: externalActor(`sponsor portal: ${session.email}`, `portal:${session.email}`), entity_type: "portal_access", entity_id: session.companyId, action: "portal.session_rejected", metadata: { reason: auth.reason } });
  }
  const res = NextResponse.json({ error: auth.error }, { status: auth.status });
  if (auth.status === 403 || auth.reason === "company_gone") res.cookies.delete(PORTAL_COOKIE);
  return { error: res };
}
