import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { requirePermission } from "@/lib/auth/server-permission";
import { evalBudget, evalSpend } from "@/lib/evals/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/evals/budget: what evaluations may cost per run and in total, and how much of that has been used. */
export async function GET() {
  const auth = await requirePermission("view_audit");
  if ("error" in auth) return auth.error;
  const spend = await evalSpend(supabaseAdmin(), auth.user.tenant_id);
  if (!spend.ok) return NextResponse.json({ error: spend.error }, { status: spend.status });
  return NextResponse.json({ per_run_usd: evalBudget().perRunUsd, ...spend.value });
}
