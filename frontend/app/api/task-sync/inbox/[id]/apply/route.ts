import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { requirePermission } from "@/lib/auth/server-permission";
import { recordAudit } from "@/lib/audit/log";
import { userActor } from "@/lib/identity/actor";
import { applyInboxItem } from "@/lib/tasks/sync";
import { idempotent } from "@/lib/idempotency";

export const runtime = "nodejs";

/**
 * POST /api/task-sync/inbox/<id>/apply
 * You confirm that work reported done in the task tool is done. It is recorded as DELIVERED under your name, and a
 * different person still has to accept it with proof, like any other delivery. Only completions can be applied here.
 */
async function postHandler(_req: Request, ctx: { params: { id: string } }) {
  const auth = await requirePermission("manage_obligations");
  if ("error" in auth) return auth.error;
  const res = await applyInboxItem(supabaseAdmin(), auth.user.tenant_id, ctx.params.id, auth.user.email);
  if (!res.ok) return NextResponse.json({ error: res.error }, { status: res.status });
  await recordAudit({ actor: userActor(auth.user), entity_type: "task_sync", action: "task_sync.applied", metadata: { item: ctx.params.id, obligation_status: res.value.status } });
  return NextResponse.json(res.value);
}

export const POST = idempotent("task-sync.apply", postHandler);
