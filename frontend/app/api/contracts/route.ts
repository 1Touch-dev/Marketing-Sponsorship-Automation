import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { requirePermission } from "@/lib/auth/server-permission";
import { resolveTenantId } from "@/lib/tenants/current";

export async function GET() {
  const tenantId = await resolveTenantId();
  const sb = supabaseAdmin();
  const { data, error } = await sb
    .from("contracts")
    .select("*, companies(company_name), proposals(id, title)")
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data ?? []);
}

export async function POST(req: NextRequest) {
  const auth = await requirePermission("edit_proposal");
  if ("error" in auth) return auth.error;

  const sb = supabaseAdmin();
  const body = await req.json();
  const { data, error } = await sb
    .from("contracts")
    .insert({ ...body, tenant_id: auth.user.tenant_id })
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Update proposal status to active_contract
  if (body.proposal_id) {
    await sb
      .from("proposals")
      .update({ status: "active_contract" })
      .eq("id", body.proposal_id)
      .eq("tenant_id", auth.user.tenant_id);
  }

  await sb.from("audit_logs").insert({
    tenant_id: auth.user.tenant_id,
    action: "contract.created",
    entity_type: "contract",
    entity_id: data.id,
    metadata: { proposal_id: body.proposal_id, value: body.total_value_brl },
  });

  return NextResponse.json(data, { status: 201 });
}
