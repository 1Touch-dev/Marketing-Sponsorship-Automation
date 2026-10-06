import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { resolveTenantId } from "@/lib/tenants/current";
import { loadStage } from "@/lib/accounts/store";
import { STAGE_DEFINITIONS } from "@/lib/accounts/stage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** The account's stage (directory, researched or qualified), the facts behind it, and its history. */
export async function GET(_req: Request, ctx: { params: { id: string } }) {
  const tenantId = await resolveTenantId();
  const res = await loadStage(supabaseAdmin(), tenantId, ctx.params.id);
  if (!res.ok) return NextResponse.json({ error: res.error }, { status: res.status });
  return NextResponse.json({ ...res.value, definition: STAGE_DEFINITIONS[res.value.stage] });
}
