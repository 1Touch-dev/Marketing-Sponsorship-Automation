import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { resolveTenantId } from "@/lib/tenants/current";
import { traceAllocation } from "@/lib/allocations/store";
import { isMissingMigration } from "@/lib/proposals/revision-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Everything that happened to one allocation: quote line, frozen revisions, contract, delivery tasks and renewals. */
export async function GET(_req: Request, ctx: { params: { id: string } }) {
  if (!UUID_RE.test(ctx.params.id)) return NextResponse.json({ error: "Invalid allocation id" }, { status: 400 });
  const tenantId = await resolveTenantId();
  try {
    const trace = await traceAllocation(supabaseAdmin(), tenantId, ctx.params.id);
    if (!trace.quote_line && trace.contracts.length === 0) return NextResponse.json({ error: "Allocation not found" }, { status: 404 });
    return NextResponse.json(trace);
  } catch (err) {
    if (isMissingMigration(err as { message?: string })) return NextResponse.json({ error: "Migration 0053 not applied yet", migration_needed: true }, { status: 503 });
    return NextResponse.json({ error: err instanceof Error ? err.message : "Trace failed" }, { status: 500 });
  }
}
