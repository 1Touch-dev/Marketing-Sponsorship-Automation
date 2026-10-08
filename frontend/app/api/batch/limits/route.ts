import { NextResponse } from "next/server";
import { z } from "zod";
import { supabaseAdmin } from "@/lib/supabase/server";
import { resolveTenantId } from "@/lib/tenants/current";
import { requirePermission } from "@/lib/auth/server-permission";
import { recordAudit } from "@/lib/audit/log";
import { userActor } from "@/lib/identity/actor";
import { loadLimits, saveLimits, PER_ITEM_ESTIMATE_USD } from "@/lib/batch/gate";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** The limits a bulk job must stay inside: the most items a person can review at once, and the most a batch may cost. */
export async function GET() {
  const res = await loadLimits(supabaseAdmin(), await resolveTenantId());
  if (!res.ok) return NextResponse.json({ error: res.error }, { status: res.status });
  return NextResponse.json({ ...res.value, per_item_estimates_usd: PER_ITEM_ESTIMATE_USD });
}

const schema = z.object({ max_review_batch: z.number().int().min(1).max(200).optional(), max_batch_cost_usd: z.number().positive().max(1000).optional() });

/** Change the limits. Admin only; audited. */
export async function PATCH(req: Request) {
  const auth = await requirePermission("manage_batch_limits");
  if ("error" in auth) return auth.error;
  const parsed = schema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success || Object.keys(parsed.data).length === 0) return NextResponse.json({ error: "Give max_review_batch and/or max_batch_cost_usd." }, { status: 400 });
  const res = await saveLimits(supabaseAdmin(), auth.user.tenant_id, parsed.data, auth.user.email);
  if (!res.ok) return NextResponse.json({ error: res.error }, { status: res.status });
  await recordAudit({ actor: userActor(auth.user), entity_type: "batch_limits", action: "batch.limits_changed", metadata: { ...parsed.data } });
  return NextResponse.json(res.value);
}
