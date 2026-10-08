import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { resolveTenantId } from "@/lib/tenants/current";
import { renewalBasis } from "@/lib/recap/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * The sponsor recap for a contract as it stands now: what was sold, scheduled, delivered, evidenced and
 * accepted; measured results (each with its source) kept apart from modeled estimates; recorded cash and
 * barter; and every gap, named. Also the reading of it that a renewal draft is built from. Changes nothing.
 */
export async function GET(_req: Request, ctx: { params: { id: string } }) {
  const res = await renewalBasis(supabaseAdmin(), await resolveTenantId(), ctx.params.id);
  if (!res.ok) return NextResponse.json({ error: res.error }, { status: res.status });
  return NextResponse.json({ recap: res.value.recap, renewal: res.value.recommendation, checksum: res.value.checksum });
}
