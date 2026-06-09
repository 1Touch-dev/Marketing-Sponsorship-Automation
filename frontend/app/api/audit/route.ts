import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";

export const runtime = "nodejs";

/**
 * GET /api/audit?limit=N&entity_type=proposal&action=proposal.generated
 * Returns recent audit log entries in reverse-chronological order.
 */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const limit = Math.min(parseInt(searchParams.get("limit") ?? "50", 10), 200);
  const offset = parseInt(searchParams.get("offset") ?? "0", 10);
  const entityType = searchParams.get("entity_type");
  const action = searchParams.get("action");

  const sb = supabaseAdmin();
  let query = sb
    .from("audit_logs")
    .select("id, entity_type, entity_id, action, actor_email, metadata, created_at")
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (entityType) query = query.eq("entity_type", entityType);
  if (action) query = query.ilike("action", `%${action}%`);

  const { data, error } = await query;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data ?? []);
}
