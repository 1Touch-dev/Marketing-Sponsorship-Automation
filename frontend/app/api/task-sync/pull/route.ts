import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { requirePermission } from "@/lib/auth/server-permission";
import { recordAudit } from "@/lib/audit/log";
import { userActor } from "@/lib/identity/actor";
import { adapterFor } from "@/lib/tasks/registry";
import { pullChanges } from "@/lib/tasks/sync";
import { idempotent } from "@/lib/idempotency";

export const runtime = "nodejs";
export const maxDuration = 120;

/** POST /api/task-sync/pull: reads what happened in the task tool into the inbox. Nothing is changed on any obligation. */
async function postHandler() {
  const auth = await requirePermission("manage_obligations");
  if ("error" in auth) return auth.error;
  const a = adapterFor();
  if (!a.ok) return NextResponse.json({ error: a.error }, { status: 409 });
  const res = await pullChanges(supabaseAdmin(), a.adapter, auth.user.tenant_id);
  if (!res.ok) return NextResponse.json({ error: res.error }, { status: res.status });
  await recordAudit({ actor: userActor(auth.user), entity_type: "task_sync", action: "task_sync.pulled", metadata: { system: a.adapter.system, ...res.value } });
  return NextResponse.json({ system: a.adapter.system, ...res.value });
}

export const POST = idempotent("task-sync.pull", postHandler);
