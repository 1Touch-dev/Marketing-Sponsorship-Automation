import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { resolveTenantId } from "@/lib/tenants/current";
import { loadCompanyStatus, loadHistory, opportunityCounts, sinceOf } from "@/lib/company-status/store";
import { DELIVERY_STATUSES, STATUS_DEFINITIONS, statusSignature } from "@/lib/company-status/model";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * The company's delivery status (no commitments, promised, scheduled, delivered, evidence accepted) and whether it is
 * at risk, derived now from its contracts, obligations, proof and projects, with the named reasons, the contracts
 * behind it, what is being sold next to it (opportunities by status), and the recorded history of changes.
 */
export async function GET(_req: Request, ctx: { params: { id: string } }) {
  const sb = supabaseAdmin();
  const tenantId = await resolveTenantId();
  const current = await loadCompanyStatus(sb, tenantId, ctx.params.id);
  if (!current.ok) return NextResponse.json({ error: current.error }, { status: current.status });
  const hist = await loadHistory(sb, tenantId, ctx.params.id);
  const history = hist.ok ? hist.value : [];
  const recorded = history[0] ?? null;
  return NextResponse.json({
    ...current.value,
    statuses: DELIVERY_STATUSES.map((s) => ({ status: s, definition: STATUS_DEFINITIONS[s] })),
    opportunities: await opportunityCounts(sb, tenantId, ctx.params.id),
    history: hist.ok ? { available: true, since: sinceOf(history), recorded_matches_now: recorded ? recorded.delivery_status === current.value.delivery_status && statusSignature({ delivery_status: recorded.delivery_status as never, risks: recorded.risk_reasons as never }) === statusSignature(current.value) : null, entries: history } : { available: false, reason: hist.error },
  });
}
