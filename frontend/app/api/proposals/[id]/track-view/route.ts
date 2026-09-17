import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { logActivity } from "@/lib/pipedrive/sync";
import { CORITIBA_TENANT_ID } from "@/lib/tenants/types";
import { resolveClubContext } from "@/lib/tenants/club-context";

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

  let body: {
    view_id?: string;
    time_on_page_seconds?: number;
    max_scroll_pct?: number;
  } = {};
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
  const visitorKey = searchParams.get("visitor_key") || null;

  // Public, unauthenticated route (a sponsor viewing the share link) — no
  // session to resolve a tenant from, so look it up from the proposal itself.
  const { data: proposalTenant } = await sb
    .from("proposals")
    .select("tenant_id")
    .eq("id", params.id)
    .maybeSingle();
  const tenantId = proposalTenant?.tenant_id ?? CORITIBA_TENANT_ID;

  await sb.from("audit_logs").insert({
    tenant_id: tenantId,
    action: "proposal.view",
    entity_type: "proposal",
    entity_id: params.id,
    metadata: { token, variant, user_agent: req.headers.get("user-agent"), timestamp: new Date().toISOString() },
  });

  // Per-visitor identified engagement (2026-09-17) — if this browser has
  // already identified itself on a prior visit to this same proposal (via
  // the lead-interest form, which backfills visitor_name/email onto past
  // rows sharing this visitor_key), carry that identity forward onto this
  // new session too, so repeat visits from a known sponsor stay attributed
  // without asking them to re-submit the form.
  type CarriedIdentity = { visitor_name: string | null; visitor_email: string | null; visitor_company: string | null };
  let carriedIdentity: CarriedIdentity | null = null;
  if (visitorKey) {
    const { data: priorIdentified } = await sb
      .from("proposal_views" as "companies")
      .select("visitor_name, visitor_email, visitor_company" as "id")
      .eq("proposal_id", params.id)
      .eq("visitor_key" as "id", visitorKey as unknown as string)
      .not("visitor_email" as "id", "is", null)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    carriedIdentity = priorIdentified as unknown as CarriedIdentity | null;
  }

  const { data: viewRow } = await sb
    .from("proposal_views" as "companies")
    .insert({
      tenant_id: tenantId,
      proposal_id: params.id,
      variant,
      user_agent: req.headers.get("user-agent"),
      visitor_key: visitorKey,
      visitor_name: carriedIdentity?.visitor_name ?? null,
      visitor_email: carriedIdentity?.visitor_email ?? null,
      visitor_company: carriedIdentity?.visitor_company ?? null,
    } as never)
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
      const dealClubTenant = await resolveClubContext(tenantId);
      const dealClubName = dealClubTenant.club_facts.short_name ?? dealClubTenant.club_facts.club_name;
      const dealTitle = `${companyName} × ${dealClubName} — ${prop.title}`;
      logActivity({ dealTitle, activityType: "Proposta visualizada", note: `Sponsor viewed proposal at ${new Date().toISOString()}` }).catch(() => {});
    }
  } catch {
    // non-fatal
  }

  return NextResponse.json({ ok: true, view_id: (viewRow as unknown as { id: string } | null)?.id ?? null });
}
