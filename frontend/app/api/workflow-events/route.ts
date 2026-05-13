import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { z } from "zod";

export const runtime = "nodejs";

const querySchema = z.object({
  workflow_name: z.string().optional(),
  status: z.string().optional(),
  entity_type: z.string().optional(),
  entity_id: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

/**
 * GET /api/workflow-events
 * Returns workflow_events for operator visibility into generation status.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const params = querySchema.safeParse(Object.fromEntries(url.searchParams));
  if (!params.success) {
    return NextResponse.json({ error: "Invalid query params", issues: params.error.issues }, { status: 400 });
  }

  const sb = supabaseAdmin();
  let query = sb
    .from("workflow_events")
    .select("*", { count: "exact" })
    .order("created_at", { ascending: false })
    .range(params.data.offset, params.data.offset + params.data.limit - 1);

  if (params.data.workflow_name) query = query.eq("workflow_name", params.data.workflow_name);
  if (params.data.status) query = query.eq("status", params.data.status);
  if (params.data.entity_type) query = query.eq("entity_type", params.data.entity_type);
  if (params.data.entity_id) query = query.eq("entity_id", params.data.entity_id);

  const { data, count, error } = await query;
  if (error) {
    // Gracefully handle missing table (migration 0006 not yet applied)
    if (error.message?.includes("workflow_events")) {
      return NextResponse.json({ events: [], total: 0, notice: "workflow_events table not yet created — apply migration 0006." });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ data, count });
}
