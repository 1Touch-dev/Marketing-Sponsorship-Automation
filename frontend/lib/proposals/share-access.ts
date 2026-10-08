import crypto from "crypto";

type Sb = any;

/**
 * The proposal a visitor is allowed to touch, found by its id AND its share token. The token is the only credential a
 * sponsor has, so the public routes that act on a proposal (a view, an expression of interest) check it, instead of
 * trusting an id that anyone can see in a URL. Returns null for a wrong token, a withdrawn or rejected proposal, and an
 * expired link, all the same, so a caller cannot tell which.
 */
export async function sharedProposalFor(sb: Sb, proposalId: string, token: string | null | undefined): Promise<{ id: string; tenant_id: string } | null> {
  if (!token || token.length < 8 || !/^[0-9a-f-]{36}$/i.test(proposalId)) return null;
  const { data } = await sb.from("proposals").select("id, tenant_id, share_token, status, expires_at").eq("id", proposalId).maybeSingle();
  const row = data as { id: string; tenant_id: string; share_token: string | null; status: string; expires_at?: string | null } | null;
  if (!row?.share_token || row.status === "rejected") return null;
  if (row.expires_at && new Date(row.expires_at).getTime() < Date.now()) return null;
  const a = Buffer.from(row.share_token);
  const b = Buffer.from(token);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  return { id: row.id, tenant_id: row.tenant_id };
}

/** Limits on what an anonymous visitor may send in a lead form. */
export interface LeadInput { name: string; email: string; phone: string | null; company: string | null; message: string | null; lgpdConsent: true }

export function validateLead(body: unknown): { ok: true; lead: LeadInput } | { ok: false; error: string } {
  const b = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;
  const text = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");
  const name = text(b.name, 120);
  const email = text(b.email, 200).toLowerCase();
  if (name.length < 2) return { ok: false, error: "Please tell us your name." };
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return { ok: false, error: "Please give a valid email address." };
  if (b.lgpdConsent !== true) return { ok: false, error: "Please accept the LGPD terms to continue." };
  return { ok: true, lead: { name, email, phone: text(b.phone, 40) || null, company: text(b.company, 160) || null, message: text(b.message, 2000) || null, lgpdConsent: true } };
}
