import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { requirePermission } from "@/lib/auth/server-permission";
import { adapterFor, configuredSystem } from "@/lib/tasks/registry";
import { NO_EXTERNAL_TASKS } from "@/lib/tasks/adapter";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/task-sync/status: which outside task tool is connected (if any), what is waiting to be read, how far the feed has been read. */
export async function GET() {
  const auth = await requirePermission("manage_obligations");
  if ("error" in auth) return auth.error;
  const system = configuredSystem();
  const found = adapterFor(system);
  const sb = supabaseAdmin();
  const pending = await sb.from("task_sync_inbox").select("id", { count: "exact", head: true }).eq("tenant_id", auth.user.tenant_id).eq("status", "pending");
  const cursor = await sb.from("task_sync_cursors").select("cursor, updated_at").eq("tenant_id", auth.user.tenant_id).eq("system", system).maybeSingle();
  return NextResponse.json({
    system, connected: found.ok && system !== NO_EXTERNAL_TASKS, adapter_available: found.ok, note: found.ok ? null : found.error,
    obligations_are_canonical: true, pending_inbox: pending.error ? null : pending.count ?? 0, last_read: cursor.data ?? null,
  });
}
