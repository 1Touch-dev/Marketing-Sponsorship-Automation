import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { requirePermission } from "@/lib/auth/server-permission";
import { listActions } from "@/lib/actions/queries";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Plans agents have made, newest first, filterable by ?state=awaiting_approval|uncertain|... and ?effect= and ?target_id=. */
export async function GET(req: Request) {
  const auth = await requirePermission("view_audit");
  if ("error" in auth) return auth.error;
  const u = new URL(req.url).searchParams;
  const res = await listActions(supabaseAdmin(), auth.user.tenant_id, { state: u.get("state"), effect: u.get("effect"), targetId: u.get("target_id"), limit: Number(u.get("limit")) || undefined });
  if (!res.ok) return NextResponse.json({ error: res.error }, { status: res.status });
  const byState: Record<string, number> = {};
  for (const a of res.value) byState[a.state] = (byState[a.state] ?? 0) + 1;
  return NextResponse.json({ total: res.value.length, by_state: byState, data: res.value });
}
