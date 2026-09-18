import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { recordAudit } from "@/lib/audit/log";
import { requirePermission } from "@/lib/auth/server-permission";
import { resolveTenantId } from "@/lib/tenants/current";

export const dynamic = "force-dynamic";

/**
 * GET  /api/assets          — list assets with filtering
 * POST /api/assets          — create new asset record
 * PATCH /api/assets         — update asset (status, tags, relationships)
 */

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status");
  const folder = searchParams.get("folder");
  const tag = searchParams.get("tag");
  const q = searchParams.get("q");
  const limit = Math.min(parseInt(searchParams.get("limit") ?? "50"), 200);
  const page = parseInt(searchParams.get("page") ?? "1");
  const offset = (page - 1) * limit;

  const tenantId = await resolveTenantId();
  const sb = supabaseAdmin();
  let query = sb.from("image_generation_jobs" as "companies")
    .select("id, job_type, status, prompt, output_urls, selected_url, proposal_id, company_id, campaign_id, created_at, updated_at")
    .eq("tenant_id" as "id", tenantId)
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (status && status !== "all") query = query.eq("status", status);
  if (q) query = query.ilike("prompt", `%${q}%`);

  const { data: jobs, count } = await query;
  return NextResponse.json({ assets: jobs ?? [], total: count ?? 0, page, limit });
}

export async function POST(req: Request) {
  const auth = await requirePermission("generate_images");
  if ("error" in auth) return auth.error;

  try {
    const body = await req.json() as {
      job_type: string; prompt: string; negative_prompt?: string;
      proposal_id?: string; company_id?: string;
      model?: string; size?: string; quality?: string;
    };

    const sb = supabaseAdmin();
    const { data, error } = await sb.from("image_generation_jobs" as "companies").insert({
      ...body,
      tenant_id: auth.user.tenant_id,
      status: "pending_approval",
    }).select("id").single();

    if (error) throw error;
    await recordAudit({ action: "asset.created", entity_type: "image_job", entity_id: (data as Record<string,string>).id, metadata: { type: body.job_type } });

    return NextResponse.json({ success: true, id: (data as Record<string,string>).id });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Failed" }, { status: 500 });
  }
}

export async function PATCH(req: Request) {
  const auth = await requirePermission("generate_images");
  if ("error" in auth) return auth.error;

  try {
    const body = await req.json() as Record<string, unknown>;
    // tags/folder removed 2026-09-18 — image_generation_jobs has no
    // metadata column (or any tag/folder concept); this had been silently
    // failing every call that set either field.
    const { id, status, related_proposal_id, related_company_id } = body;

    const sb = supabaseAdmin();
    const updatePayload: Record<string, unknown> = {};
    if (status) updatePayload.status = status;
    if (related_proposal_id) updatePayload.proposal_id = related_proposal_id;
    if (related_company_id) updatePayload.company_id = related_company_id;
    // present-but-empty means "unassign" (clearing the campaign), so check key
    // presence rather than truthiness
    if ("related_campaign_id" in body) updatePayload.campaign_id = body.related_campaign_id || null;

    await sb.from("image_generation_jobs" as "companies").update(updatePayload as unknown as Record<string,unknown>).eq("id", id as string).eq("tenant_id" as "id", auth.user.tenant_id);
    await recordAudit({ action: `asset.${status ?? "updated"}`, entity_type: "image_job", entity_id: id as string, metadata: { status: status as string } });

    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Failed" }, { status: 500 });
  }
}
