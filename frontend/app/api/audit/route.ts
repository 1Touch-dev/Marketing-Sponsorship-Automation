import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { requirePermission } from "@/lib/auth/server-permission";
import { ACTOR_KINDS } from "@/lib/identity/actor";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const COLUMNS_NEW = "id, seq, entity_type, entity_id, action, actor_kind, actor_id, actor_label, actor_role, on_behalf_of, actor_email, request_id, metadata, created_at";
const COLUMNS_OLD = "id, entity_type, entity_id, action, actor_email, metadata, created_at";

/**
 * GET /api/audit?limit=N&entity_type=proposal&action=proposal.generated&actor_kind=agent&actor_id=...
 * Recent audit entries, newest first, with who did each one (kind, id, role, and the person an agent or
 * service acted for). Needs the view_audit permission: the log names people and what they did.
 */
export async function GET(req: Request) {
  const auth = await requirePermission("view_audit");
  if ("error" in auth) return auth.error;

  const { searchParams } = new URL(req.url);
  const limit = Math.min(parseInt(searchParams.get("limit") ?? "50", 10), 200);
  const offset = parseInt(searchParams.get("offset") ?? "0", 10);
  const entityType = searchParams.get("entity_type");
  const action = searchParams.get("action");
  const actorKind = searchParams.get("actor_kind");
  const actorId = searchParams.get("actor_id");
  if (actorKind && !(ACTOR_KINDS as readonly string[]).includes(actorKind) && actorKind !== "legacy") {
    return NextResponse.json({ error: `actor_kind must be one of ${[...ACTOR_KINDS, "legacy"].join(", ")}` }, { status: 400 });
  }

  const sb = supabaseAdmin();
  const build = (columns: string, withActor: boolean) => {
    let q = sb.from("audit_logs").select(columns).eq("tenant_id", auth.user.tenant_id).order("created_at", { ascending: false }).range(offset, offset + limit - 1);
    if (entityType) q = q.eq("entity_type", entityType);
    if (action) q = q.ilike("action", `%${action}%`);
    if (withActor && actorKind) q = q.eq("actor_kind", actorKind);
    if (withActor && actorId) q = q.eq("actor_id", actorId);
    return q;
  };
  let { data, error } = await build(COLUMNS_NEW, true);
  // before migration 0069 the actor columns do not exist
  if (error && /actor_kind|actor_id|column/i.test(error.message)) ({ data, error } = await build(COLUMNS_OLD, false));
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data ?? []);
}
