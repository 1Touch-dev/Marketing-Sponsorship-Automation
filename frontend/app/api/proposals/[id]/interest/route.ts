import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { CORITIBA_TENANT_ID } from "@/lib/tenants/types";

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

  await sb.from("audit_logs").insert({
    tenant_id: proposal?.tenant_id ?? CORITIBA_TENANT_ID,
    action: "proposal.interest_submitted",
    entity_type: "proposal",
    entity_id: params.id,
    metadata: {
      contact_name: body.name,
      contact_email: body.email,
      contact_phone: body.phone,
      company: body.company,
      message: body.message,
      lgpd_consent: body.lgpdConsent,
    },
  });

  return NextResponse.json({ ok: true });
}
