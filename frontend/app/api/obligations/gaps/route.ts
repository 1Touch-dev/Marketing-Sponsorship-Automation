import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { resolveTenantId } from "@/lib/tenants/current";
import { findGaps } from "@/lib/obligations/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Active contracts nothing has been handed off for, plus late work and work marked delivered without proof. */
export async function GET() {
  const res = await findGaps(supabaseAdmin(), await resolveTenantId());
  if (!res.ok) return NextResponse.json({ error: res.error }, { status: res.status });
  return NextResponse.json(res.value);
}
