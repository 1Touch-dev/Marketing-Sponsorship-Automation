import type { WriteResult } from "../accounts/store";
import { isMissingMigration } from "../proposals/revision-store";
import { getAction, type ActionView } from "./engine";
import { supabaseRpc } from "./broker";

type Sb = any;

const notSetUp = "Agent actions are not set up yet (migration 0070).";

export interface ActionRow { id: string; effect: string; target_type: string; target_id: string; state: string; requested_by: string; on_behalf_of: string | null; reviewer_email: string | null; review_due_at: string | null; created_at: string; state_changed_at: string; retry_of: string | null }

export async function listActions(sb: Sb, tenantId: string, f: { state?: string | null; effect?: string | null; targetId?: string | null; limit?: number } = {}): Promise<WriteResult<ActionRow[]>> {
  let q = sb.from("agent_actions").select("id, effect, target_type, target_id, state, requested_by, on_behalf_of, reviewer_email, review_due_at, created_at, state_changed_at, retry_of").eq("tenant_id", tenantId).order("created_at", { ascending: false }).limit(Math.min(f.limit ?? 100, 500));
  if (f.state) q = q.eq("state", f.state);
  if (f.effect) q = q.eq("effect", f.effect);
  if (f.targetId) q = q.eq("target_id", f.targetId);
  const { data, error } = await q;
  if (error) return isMissingMigration(error) ? { ok: false, status: 503, error: notSetUp } : { ok: false, status: 500, error: error.message };
  return { ok: true, value: (data ?? []) as ActionRow[] };
}

export async function viewAction(sb: Sb, tenantId: string, id: string): Promise<WriteResult<ActionView>> {
  const a = await getAction(supabaseRpc(sb), id);
  if (!a || a.tenant_id !== tenantId) return { ok: false, status: 404, error: "Action not found" };
  return { ok: true, value: a };
}
