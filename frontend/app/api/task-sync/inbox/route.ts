import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { requirePermission } from "@/lib/auth/server-permission";
import { listInbox } from "@/lib/tasks/sync";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/task-sync/inbox?status=pending: what the task tool reported, for a person to read and decide. */
export async function GET(req: Request) {
  const auth = await requirePermission("manage_obligations");
  if ("error" in auth) return auth.error;
  const status = new URL(req.url).searchParams.get("status");
  const res = await listInbox(supabaseAdmin(), auth.user.tenant_id, { status: status && ["pending", "applied", "dismissed"].includes(status) ? status : null });
  if (!res.ok) return NextResponse.json({ error: res.error }, { status: res.status });
  return NextResponse.json({ total: res.value.length, data: res.value });
}
