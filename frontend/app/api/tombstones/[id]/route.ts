import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { requirePermission } from "@/lib/auth/server-permission";
import { getTombstone } from "@/lib/records/tombstones";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** One tombstone with the record as it was when deleted, and everything else removed by the same delete. */
export async function GET(_req: Request, ctx: { params: { id: string } }) {
  const auth = await requirePermission("view_audit");
  if ("error" in auth) return auth.error;
  const res = await getTombstone(supabaseAdmin(), auth.user.tenant_id, ctx.params.id);
  if (!res.ok) return NextResponse.json({ error: res.error }, { status: res.status });
  return NextResponse.json(res.value);
}
