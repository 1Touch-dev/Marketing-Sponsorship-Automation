/**
 * POST /api/proposal-templates/[id]/render
 * Renders this HTML template for a single company — fills text tokens and
 * generates each image placeholder via the gpt-image-2 pipeline.
 * Body: { company_id: string }
 */
import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { renderTemplateForCompany } from "@/lib/presentations/render-template";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(req: Request, ctx: { params: { id: string } }) {
  const { data: { user } } = await supabaseServer().auth.getUser().catch(() => ({ data: { user: null } }));
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const companyId = body?.company_id as string | undefined;
  if (!companyId) return NextResponse.json({ error: "company_id required" }, { status: 400 });

  try {
    const result = await renderTemplateForCompany({
      templateId: ctx.params.id,
      companyId,
      createdBy: user.id,
    });
    return NextResponse.json(result, { status: result.status === "completed" ? 200 : 500 });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Render failed" },
      { status: 500 },
    );
  }
}
