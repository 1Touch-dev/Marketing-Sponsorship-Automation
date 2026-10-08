import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { CORITIBA_TENANT_ID } from "@/lib/tenants/types";
import { externalActor } from "@/lib/identity/actor";
import { recordAudit } from "@/lib/audit/log";
import { logFingerprint } from "@/lib/identity/privacy";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";
import { sharedProposalFor, validateLead } from "@/lib/proposals/share-access";

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const rl = checkRateLimit(`interest:${getClientIp(req)}`, { max: 5, windowMs: 60_000 });
  if (!rl.ok) return NextResponse.json({ error: rl.message }, { status: 429 });
  const body = await req.json().catch(() => ({}));
  const sb = supabaseAdmin();

  // Public, unauthenticated route (a sponsor viewing the share link). The share token is the credential, and it also
  // tells us the tenant: the proposal's own, never a session's.
  const shared = await sharedProposalFor(sb, params.id, typeof body.token === "string" ? body.token : null);
  if (!shared) return NextResponse.json({ error: "Proposal not found" }, { status: 404 });
  const checked = validateLead(body);
  if (!checked.ok) return NextResponse.json({ error: checked.error }, { status: 400 });
  const lead = checked.lead;
  // validated copies replace the raw body from here on
  body.name = lead.name; body.email = lead.email; body.phone = lead.phone; body.company = lead.company; body.message = lead.message; body.lgpdConsent = true;

  const tenantId = shared.tenant_id ?? CORITIBA_TENANT_ID;
  const details = { contact_name: body.name, contact_email: body.email, contact_phone: body.phone, company: body.company, message: body.message, lgpd_consent: body.lgpdConsent };
  // A lead's details are personal data, so they are kept in a table they can be erased from, and the
  // permanent audit log holds only a reference. Before migration 0069 the table does not exist, and the
  // details are then kept in the log as before so that no submission is lost.
  const stored = await sb.from("proposal_interests" as "companies").insert({ tenant_id: tenantId, proposal_id: params.id, ...details } as never).select("id").single();
  const interestId = (stored.data as { id?: string } | null)?.id ?? null;
  await recordAudit({
    actor: externalActor(`proposal viewer: ${String(body.name ?? "unnamed").slice(0, 60)}`, `lead:${logFingerprint(body.email) ?? "anonymous"}`),
    tenant_id: tenantId,
    action: "proposal.interest_submitted",
    entity_type: "proposal",
    entity_id: params.id,
    metadata: interestId ? { interest_id: interestId, lgpd_consent: body.lgpdConsent } : details,
  });

  // Per-visitor identified engagement (2026-09-17) — this is the moment an
  // anonymous viewer becomes a known one. Backfill their identity onto
  // every proposal_views row from this browser (matched by visitor_key,
  // persisted client-side) for this proposal, so the admin engagement view
  // can show a real name/email instead of just a session count.
  if (body.visitor_key) {
    await sb
      .from("proposal_views" as "companies")
      .update({
        visitor_name: body.name ?? null,
        visitor_email: body.email ?? null,
        visitor_company: body.company ?? null,
      } as never)
      .eq("proposal_id", params.id)
      .eq("visitor_key" as "id", body.visitor_key as unknown as string);
  }

  return NextResponse.json({ ok: true });
}
