import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { requirePermission } from "@/lib/auth/server-permission";
import { recordAudit } from "@/lib/audit/log";
import type { ProposalContent } from "@/types/database";

export const runtime = "nodejs";

/**
 * PATCH /api/proposals/[id]/fulfillment-tasks
 * Body: { task_id: string; status: "pending" | "done" }
 * Toggles a single fulfillment checklist item (Task 10).
 */
export async function PATCH(req: Request, ctx: { params: { id: string } }) {
  const auth = await requirePermission("edit_proposal");
  if ("error" in auth) return auth.error;

  const body = await req.json().catch(() => ({}));
  const taskId = body.task_id as string | undefined;
  const status = body.status === "done" ? "done" : "pending";
  if (!taskId) return NextResponse.json({ error: "task_id is required" }, { status: 400 });

  const sb = supabaseAdmin();
  const { data: proposal } = await sb
    .from("proposals")
    .select("content")
    .eq("id", ctx.params.id)
    .eq("tenant_id", auth.user.tenant_id)
    .maybeSingle();
  if (!proposal) return NextResponse.json({ error: "Proposal not found" }, { status: 404 });

  const content = (proposal.content as ProposalContent) ?? {};
  const tasks = content.fulfillment_tasks ?? [];
  const idx = tasks.findIndex((t) => t.id === taskId);
  if (idx === -1) return NextResponse.json({ error: "Task not found" }, { status: 404 });

  tasks[idx] = { ...tasks[idx], status, completed_at: status === "done" ? new Date().toISOString() : null };
  await sb.from("proposals").update({ content: { ...content, fulfillment_tasks: tasks } }).eq("id", ctx.params.id);

  await recordAudit({
    entity_type: "proposal",
    entity_id: ctx.params.id,
    action: status === "done" ? "fulfillment_task.completed" : "fulfillment_task.reopened",
    metadata: { task_id: taskId, title: tasks[idx].title },
  });

  return NextResponse.json({ task: tasks[idx] });
}
