/**
 * GET /api/proposal-templates/render/bulk/[batchId]
 * Polls progress for a bulk template-render batch — pulls every
 * `template_renders` row tagged with this batch_id (durable, DB-backed).
 */
import { NextResponse } from "next/server";
import { supabaseAdmin, supabaseServer } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const maxDuration = 30;

export async function GET(_req: Request, ctx: { params: { batchId: string } }) {
  const { data: { user } } = await supabaseServer().auth.getUser().catch(() => ({ data: { user: null } }));
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const sb = supabaseAdmin();
  const { data: renders, error } = await sb
    .from("template_renders" as "companies")
    .select("id, company_id, status, rendered_url, image_results, error, created_at, updated_at, companies(company_name)")
    .eq("batch_id", ctx.params.batchId)
    .order("created_at", { ascending: true }) as unknown as {
      data: Array<{
        id: string;
        company_id: string;
        status: string;
        rendered_url: string | null;
        image_results: Record<string, { url: string; error?: string }>;
        error: string | null;
        created_at: string;
        updated_at: string;
        companies: { company_name: string } | { company_name: string }[] | null;
      }> | null;
      error: { message: string } | null;
    };

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const rows = (renders ?? []).map((r) => ({
    render_id: r.id,
    company_id: r.company_id,
    company_name: Array.isArray(r.companies) ? r.companies[0]?.company_name : r.companies?.company_name,
    status: r.status,
    rendered_url: r.rendered_url,
    image_results: r.image_results,
    error: r.error,
    updated_at: r.updated_at,
  }));

  const counts = {
    total: rows.length,
    completed: rows.filter((r) => r.status === "completed").length,
    failed: rows.filter((r) => r.status === "failed").length,
    running: rows.filter((r) => r.status === "running" || r.status === "pending").length,
  };

  return NextResponse.json({ batch_id: ctx.params.batchId, counts, renders: rows });
}
