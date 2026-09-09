import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { recordAudit } from "@/lib/audit/log";
import { requirePermission } from "@/lib/auth/server-permission";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const sb = supabaseAdmin();
  const url = new URL(req.url);
  const category = url.searchParams.get("category");
  const featuredOnly = url.searchParams.get("featured") === "true";

  let query = (sb as ReturnType<typeof supabaseAdmin>)
    .from("coritiba_metrics" as "companies")
    .select("*")
    .eq("status", "active")
    .order("category")
    .order("sort_order");

  if (category) query = query.eq("category", category) as typeof query;
  if (featuredOnly) query = query.eq("is_featured", true) as typeof query;

  const { data, error } = await query;
  if (error?.message?.includes("not find") || error?.message?.includes("does not exist")) {
    return NextResponse.json({ data: [], migration_needed: true });
  }
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data });
}

/**
 * These records feed Rule 10 claim-grounding (lib/bedrock/prompts.ts,
 * CORITIBA_CONTEXT) in every AI-generated proposal — an unprivileged edit
 * here would corrupt facts the AI states as verified across the whole
 * platform. Admin-only.
 */
export async function POST(req: Request) {
  const auth = await requirePermission("manage_integrations");
  if ("error" in auth) return auth.error;

  const sb = supabaseAdmin();
  const body = await req.json().catch(() => ({}));

  if (!body.category || !body.metric_name || !body.metric_value) {
    return NextResponse.json({ error: "category, metric_name, and metric_value are required" }, { status: 400 });
  }

  const { data, error } = await (sb as ReturnType<typeof supabaseAdmin>)
    .from("coritiba_metrics" as "companies")
    .insert({
      category: body.category,
      metric_name: body.metric_name,
      metric_value: body.metric_value,
      unit: body.unit || null,
      description: body.description || null,
      source: body.source || null,
      is_featured: body.is_featured ?? false,
      sort_order: body.sort_order ?? 0,
    } as never)
    .select("*")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await recordAudit({
    entity_type: "coritiba_metrics",
    entity_id: null,
    action: "metric.created",
    metadata: { metric_name: body.metric_name, category: body.category },
  });

  return NextResponse.json({ data }, { status: 201 });
}
