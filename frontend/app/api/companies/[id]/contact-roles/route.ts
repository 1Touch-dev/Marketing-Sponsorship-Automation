import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { resolveTenantId } from "@/lib/tenants/current";
import { companyRoles } from "@/lib/contacts/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Who at this company holds which role right now (decision-maker, billing, signatory...). */
export async function GET(_req: Request, ctx: { params: { id: string } }) {
  const res = await companyRoles(supabaseAdmin(), await resolveTenantId(), ctx.params.id);
  if (!res.ok) return NextResponse.json({ error: res.error }, { status: res.status });
  return NextResponse.json({ data: res.value });
}
