import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { logActivity } from "@/lib/pipedrive/sync";

/**
 * POST /api/proposals/[id]/track-view
 *
 * Two shapes, both POST (the update call arrives via navigator.sendBeacon,
 * which can only POST):
 *   - No body / no `view_id`: page-load call. Logs the audit/Pipedrive
 *     activity as before, and creates a new proposal_views row for this
 *     viewing session — returns { view_id } for the client to update later.
 *   - Body with `view_id`: page-unload call (Phase 5 — engagement
 *     analytics). Updates that same row with final time-on-page and max
 *     scroll depth. Never touches audit_logs/Pipedrive again — one
 *     activity per session, not one per beacon.
 */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const sb = supabaseAdmin();

  let body: { view_id?: string; time_on_page_seconds?: number; max_scroll_pct?: number } = {};
  try {
    body = await req.json();
  } catch {
    // Initial page-load call sends no body — fine.
  }

  if (body.view_id) {
    await sb
      .from("proposal_views" as "companies")
      .update({
        time_on_page_seconds:
          typeof body.time_on_page_seconds === "number" ? Math.max(0, Math.round(body.time_on_page_seconds)) : null,
        max_scroll_pct:
          typeof body.max_scroll_pct === "number" ? Math.max(0, Math.min(100, Math.round(body.max_scroll_pct))) : null,
      } as never)
      .eq("id", body.view_id);
    return NextResponse.json({ ok: true });
  }

  const { searchParams } = new URL(req.url);
  const token = searchParams.get("token") ?? "";
  const variant = searchParams.get("variant") ?? "A";

  await sb.from("audit_logs").insert({
    action: "proposal.view",
    entity_type: "proposal",
    entity_id: params.id,
    metadata: { token, variant, user_agent: req.headers.get("user-agent"), timestamp: new Date().toISOString() },
  });

  const { data: viewRow } = await sb
    .from("proposal_views" as "companies")
    .insert({ proposal_id: params.id, variant, user_agent: req.headers.get("user-agent") } as never)
    .select("id")
    .maybeSingle();

  // Sync to Pipedrive as activity
  try {
    const { data: prop } = await sb
      .from("proposals")
      .select("title, companies(company_name)")
      .eq("id", params.id)
      .single();
    if (prop) {
      const companyName = Array.isArray(prop.companies)
        ? (prop.companies[0] as { company_name: string } | undefined)?.company_name
        : (prop.companies as { company_name: string } | null)?.company_name;
      const dealTitle = `${companyName} × Coritiba FC — ${prop.title}`;
      logActivity({ dealTitle, activityType: "Proposta visualizada", note: `Sponsor viewed proposal at ${new Date().toISOString()}` }).catch(() => {});
    }
  } catch {
    // non-fatal
  }

  return NextResponse.json({ ok: true, view_id: (viewRow as unknown as { id: string } | null)?.id ?? null });
}
