import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { resolveTenantId } from "@/lib/tenants/current";
import { getIssued } from "@/lib/recap/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** One issued recap exactly as it was issued, with a check that its content still matches its checksum. */
export async function GET(_req: Request, ctx: { params: { id: string } }) {
  const res = await getIssued(supabaseAdmin(), await resolveTenantId(), ctx.params.id);
  if (!res.ok) return NextResponse.json({ error: res.error }, { status: res.status });
  return NextResponse.json(res.value);
}
