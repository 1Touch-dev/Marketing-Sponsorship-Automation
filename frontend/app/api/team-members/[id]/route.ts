import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { recordAudit } from "@/lib/audit/log";
import { requirePermission } from "@/lib/auth/server-permission";
import { userActor } from "@/lib/identity/actor";
import { deleteRecord, readDeleteOptions } from "@/lib/records/tombstones";

export const runtime = "nodejs";

export async function PATCH(
  req: Request,
  ctx: { params: { id: string } }
) {
  const auth = await requirePermission("manage_integrations");
  if ("error" in auth) return auth.error;

  const sb = supabaseAdmin();
  const id = ctx.params.id;
  const body = await req.json().catch(() => ({}));

  // Enforce single default sender
  if (body.default_sender) {
    await sb.from("team_members").update({ default_sender: false } as never).neq("id", id).eq("default_sender", true as never).eq("tenant_id", auth.user.tenant_id);
  }

  const { data, error } = await sb
    .from("team_members")
    .update(body as never)
    .eq("id", id)
    .eq("tenant_id", auth.user.tenant_id)
    .select("*")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await recordAudit({ actor: userActor(auth.user),
    entity_type: "team_member",
    entity_id: id,
    action: "team_member.updated",
    metadata: { fields: Object.keys(body) },
  });

  return NextResponse.json({ data });
}

export async function DELETE(
  req: Request,
  ctx: { params: { id: string } }
) {
  const auth = await requirePermission("manage_integrations");
  if ("error" in auth) return auth.error;

  const res = await deleteRecord(supabaseAdmin(), { table: "team_members", id: ctx.params.id, tenantId: auth.user.tenant_id, actor: userActor(auth.user), ...(await readDeleteOptions(req)) });
  if (!res.ok) return NextResponse.json({ error: res.error, blockers: res.blockers ?? [] }, { status: res.status });

  await recordAudit({ actor: userActor(auth.user),
    entity_type: "team_member",
    entity_id: ctx.params.id,
    action: "team_member.deleted",
    metadata: {},
  });

  return NextResponse.json({ ok: true });
}
