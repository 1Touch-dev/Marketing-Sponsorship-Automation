import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { requirePermission } from "@/lib/auth/server-permission";
import { listTombstones, previewDeletion } from "@/lib/records/tombstones";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/tombstones?type=companies&record_id=...&include_restored=true
 * Deleted records, newest first: who deleted each, why, what went with it, and whether the deletion was undone.
 * GET /api/tombstones?preview_type=companies&preview_id=... instead shows what deleting a record would take
 * with it, and any live commitments that make it a decision, without deleting anything.
 */
export async function GET(req: Request) {
  const auth = await requirePermission("view_audit");
  if ("error" in auth) return auth.error;
  const sb = supabaseAdmin();
  const u = new URL(req.url).searchParams;
  if (u.get("preview_type") && u.get("preview_id")) {
    const p = await previewDeletion(sb, auth.user.tenant_id, u.get("preview_type")!, u.get("preview_id")!);
    return p.ok ? NextResponse.json(p.value) : NextResponse.json({ error: p.error }, { status: p.status });
  }
  const res = await listTombstones(sb, auth.user.tenant_id, { type: u.get("type"), recordId: u.get("record_id"), includeRestored: u.get("include_restored") === "true", limit: Number(u.get("limit")) || undefined });
  if (!res.ok) return NextResponse.json({ error: res.error }, { status: res.status });
  return NextResponse.json({ total: res.value.length, data: res.value });
}
