import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { requirePermission } from "@/lib/auth/server-permission";
import { resolveTenantId } from "@/lib/tenants/current";

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const sb = supabaseAdmin();
  const tenantId = await resolveTenantId();
  const { data: variants } = await sb
    .from("proposal_variants")
    .select("*")
    .eq("proposal_id", params.id)
    .eq("tenant_id", tenantId);
  return NextResponse.json(variants ?? []);
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requirePermission("edit_proposal");
  if ("error" in auth) return auth.error;

  const sb = supabaseAdmin();
  const body = await req.json();
  const { data, error } = await sb
    .from("proposal_variants")
    .insert({ ...body, tenant_id: auth.user.tenant_id, proposal_id: params.id })
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data, { status: 201 });
}
