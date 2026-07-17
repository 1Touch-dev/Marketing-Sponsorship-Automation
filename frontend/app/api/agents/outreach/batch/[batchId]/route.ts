/**
 * GET /api/agents/outreach/batch/[batchId]
 * Polls progress for a batch run — overall counters + per-company run status.
 */
import { NextResponse } from "next/server";
import { supabaseAdmin, supabaseServer } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const maxDuration = 30;

export async function GET(
  _req: Request,
  ctx: { params: { batchId: string } }
) {
  const { data: { user } } = await supabaseServer().auth.getUser().catch(() => ({ data: { user: null } }));
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const sb = supabaseAdmin();

  const { data: batch } = await sb
    .from("agent_batch_runs" as "companies")
    .select("*")
    .eq("id", ctx.params.batchId)
    .maybeSingle() as unknown as { data: Record<string, unknown> | null };

  if (!batch) return NextResponse.json({ error: "Batch not found" }, { status: 404 });

  const { data: runs } = await sb
    .from("agent_runs" as "companies")
    .select("id, company_id, status, result, error, created_at, updated_at, companies(company_name)")
    .eq("batch_id", ctx.params.batchId)
    .order("created_at", { ascending: true }) as unknown as {
      data: Array<{
        id: string;
        company_id: string;
        status: string;
        result: Record<string, unknown> | null;
        error: string | null;
        created_at: string;
        updated_at: string;
        companies: { company_name: string } | { company_name: string }[] | null;
      }> | null;
    };

  const perCompany = (runs ?? []).map((r) => ({
    run_id: r.id,
    company_id: r.company_id,
    company_name: Array.isArray(r.companies) ? r.companies[0]?.company_name : r.companies?.company_name,
    status: r.status,
    proposal_id: r.result?.proposal_id ?? null,
    proposal_title: r.result?.proposal_title ?? null,
    email_id: r.result?.email_id ?? null,
    pipedrive_activity_id: r.result?.pipedrive_activity_id ?? null,
    error: r.error,
    updated_at: r.updated_at,
  }));

  return NextResponse.json({
    batch,
    companies: perCompany,
  });
}
