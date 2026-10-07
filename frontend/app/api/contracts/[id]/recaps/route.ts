import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { resolveTenantId } from "@/lib/tenants/current";
import { listIssued } from "@/lib/recap/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** The versions of this contract's recap that were issued, newest first. */
export async function GET(_req: Request, ctx: { params: { id: string } }) {
  const res = await listIssued(supabaseAdmin(), await resolveTenantId(), { contractId: ctx.params.id });
  if (!res.ok) return NextResponse.json({ error: res.error }, { status: res.status });
  return NextResponse.json({ total: res.value.length, data: res.value });
}
