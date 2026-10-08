import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { resolveTenantId } from "@/lib/tenants/current";
import { getLine } from "@/lib/finance/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** One line with where it stands (proposed, contracted, invoiced, settled...) and its full history. */
export async function GET(_req: Request, ctx: { params: { id: string } }) {
  const res = await getLine(supabaseAdmin(), await resolveTenantId(), ctx.params.id);
  if (!res.ok) return NextResponse.json({ error: res.error }, { status: res.status });
  return NextResponse.json(res.value);
}
