import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { CORITIBA_TENANT_ID } from "@/lib/tenants/types";
import { externalActor } from "@/lib/identity/actor";
import { recordAudit } from "@/lib/audit/log";
import { logFingerprint } from "@/lib/identity/privacy";

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const body = await req.json();
  const sb = supabaseAdmin();

  // Public, unauthenticated route (a sponsor viewing the share link) — there
  // is no session to resolve a tenant from, so the tenant must come from the
  // proposal itself, not resolveTenantId()'s session-based fallback (which
  // would silently misattribute every submission to the Coritiba default).
  const { data: proposal } = await sb
    .from("proposals")
    .select("tenant_id")
    .eq("id", params.id)
    .maybeSingle();

  const tenantId = proposal?.tenant_id ?? CORITIBA_TENANT_ID;
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
