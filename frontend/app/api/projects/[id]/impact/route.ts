import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { resolveTenantId } from "@/lib/tenants/current";
import { previewProjectMove } from "@/lib/schedule/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Preview moving a project date (?field=period_start|period_end|target_date&new_date=YYYY-MM-DD): affected work and owners. Changes nothing. */
export async function GET(req: Request, ctx: { params: { id: string } }) {
  const u = new URL(req.url).searchParams;
  const res = await previewProjectMove(supabaseAdmin(), await resolveTenantId(), ctx.params.id, u.get("field") ?? "", u.get("new_date"));
  if (!res.ok) return NextResponse.json({ error: res.error }, { status: res.status });
  return NextResponse.json(res.value);
}
