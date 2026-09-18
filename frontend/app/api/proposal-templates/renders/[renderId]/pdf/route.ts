/**
 * GET /api/proposal-templates/renders/[renderId]/pdf
 * Exports a completed template render (already a public HTML page + URL,
 * per `template_renders.rendered_url`) to a downloadable PDF — the other
 * half of the "phase 2" presentation-templates ask (17th_July.md item C).
 * Reuses the same Playwright PDF renderer already used for proposal
 * exports, no new rendering pipeline needed.
 */
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { requirePermission } from "@/lib/auth/server-permission";
import { renderUrlToPdf } from "@/lib/proposals/pdf-export";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(_req: Request, ctx: { params: { renderId: string } }) {
  const auth = await requirePermission("generate_images");
  if ("error" in auth) return auth.error;

  const sb = supabaseAdmin();
  const { data: render } = await sb
    .from("template_renders" as "companies")
    .select("id, status, rendered_url, companies(company_name)")
    .eq("id", ctx.params.renderId)
    .eq("tenant_id" as "id", auth.user.tenant_id)
    .maybeSingle() as unknown as {
      data: { id: string; status: string; rendered_url: string | null; companies: { company_name: string } | { company_name: string }[] | null } | null;
    };

  if (!render) return NextResponse.json({ error: "Render not found" }, { status: 404 });
  if (render.status !== "completed" || !render.rendered_url) {
    return NextResponse.json({ error: "This render isn't completed yet" }, { status: 409 });
  }

  const companyName = Array.isArray(render.companies) ? render.companies[0]?.company_name : render.companies?.company_name;

  try {
    const pdf = await renderUrlToPdf(render.rendered_url);
    const filename = `${(companyName ?? "presentation").replace(/[^a-z0-9]+/gi, "-").toLowerCase()}.pdf`;
    return new NextResponse(pdf as unknown as BodyInit, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "PDF export failed" }, { status: 500 });
  }
}
