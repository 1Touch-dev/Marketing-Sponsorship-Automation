/**
 * Workflow event logger — thin wrapper around the workflow_events table.
 *
 * Use `startWorkflow` at the beginning of an operation to get an event ID,
 * then call `completeWorkflow` or `failWorkflow` when done.
 *
 * Fire-and-forget: failures to persist never throw.
 */
import { supabaseAdmin } from "@/lib/supabase/server";

export type WorkflowStatus = "started" | "processing" | "completed" | "failed" | "retried";

export interface WorkflowEventInit {
  workflow_name: string;
  entity_type?: string;
  entity_id?: string;
  status?: WorkflowStatus;
  metadata?: Record<string, unknown>;
}

export interface WorkflowEventUpdate {
  id: string;
  status: WorkflowStatus;
  error_message?: string;
  metadata?: Record<string, unknown>;
}

async function _insert(init: WorkflowEventInit): Promise<string | null> {
  try {
    const sb = supabaseAdmin();
    const { data, error } = await sb
      .from("workflow_events")
      .insert({
        workflow_name: init.workflow_name,
        entity_type: init.entity_type ?? null,
        entity_id: init.entity_id ?? null,
        status: init.status ?? "started",
        metadata: init.metadata ?? {},
      })
      .select("id")
      .single();
    if (error) {
      console.error("[workflow_events] insert error:", error.message);
      return null;
    }
    return (data as { id: string }).id;
  } catch (e) {
    console.error("[workflow_events] insert threw:", e);
    return null;
  }
}

async function _update(upd: WorkflowEventUpdate): Promise<void> {
  try {
    const sb = supabaseAdmin();
    const patch: Record<string, unknown> = { status: upd.status };
    if (upd.error_message !== undefined) patch.error_message = upd.error_message;
    if (upd.metadata !== undefined) patch.metadata = upd.metadata;
    await sb.from("workflow_events").update(patch).eq("id", upd.id);
  } catch (e) {
    console.error("[workflow_events] update threw:", e);
  }
}

/** Create a workflow_events row with status=started. Returns the event id (or null on DB error). */
export async function startWorkflow(init: WorkflowEventInit): Promise<string | null> {
  return _insert({ ...init, status: "started" });
}

/** Mark an event as completed. Pass `metadata` to record output summary. */
export async function completeWorkflow(
  id: string,
  metadata?: Record<string, unknown>,
): Promise<void> {
  await _update({ id, status: "completed", metadata });
}

/** Mark an event as failed. */
export async function failWorkflow(id: string, error_message: string, metadata?: Record<string, unknown>): Promise<void> {
  await _update({ id, status: "failed", error_message, metadata });
}

/** Mark a retry attempt. */
export async function retryWorkflow(
  id: string,
  attempt: number,
  metadata?: Record<string, unknown>,
): Promise<void> {
  try {
    const sb = supabaseAdmin();
    await sb
      .from("workflow_events")
      .update({ status: "retried", attempt, metadata: metadata ?? {} })
      .eq("id", id);
  } catch (e) {
    console.error("[workflow_events] retry update threw:", e);
  }
}
