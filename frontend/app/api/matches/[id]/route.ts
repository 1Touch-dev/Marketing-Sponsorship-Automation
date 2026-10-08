import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { recordAudit } from "@/lib/audit/log";
import { requirePermission } from "@/lib/auth/server-permission";
import { userActor } from "@/lib/identity/actor";
import { deleteRecord, readDeleteOptions } from "@/lib/records/tombstones";

export const runtime = "nodejs";

export async function PATCH(req: Request, ctx: { params: { id: string } }) {
  const auth = await requirePermission("manage_matches");
  if ("error" in auth) return auth.error;

  const sb = supabaseAdmin();
  const { id } = ctx.params;
  const body = (await req.json().catch(() => ({}))) as {
    match_date?: string;
    opponent?: string;
    competition?: string;
    home_away?: "home" | "away";
    result?: string;
    notes?: string;
  };

  const patch: Record<string, unknown> = {};
  if (body.match_date !== undefined) patch.match_date = body.match_date;
  if (body.opponent !== undefined) patch.opponent = body.opponent;
  if (body.competition !== undefined) patch.competition = body.competition || null;
  if (body.home_away !== undefined) patch.home_away = body.home_away;
  if (body.result !== undefined) patch.result = body.result || null;
  if (body.notes !== undefined) patch.notes = body.notes || null;

  const { data, error } = await sb
    .from("matches")
    .update(patch as never)
    .eq("id", id)
    .eq("tenant_id", auth.user.tenant_id)
    .select("*")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await recordAudit({ actor: userActor(auth.user),
    entity_type: "match",
    entity_id: id,
    action: "match.updated",
    metadata: { fields: Object.keys(patch) },
  });

  return NextResponse.json({ data });
}

export async function DELETE(req: Request, ctx: { params: { id: string } }) {
  const auth = await requirePermission("manage_matches");
  if ("error" in auth) return auth.error;

  const { id } = ctx.params;

  const res = await deleteRecord(supabaseAdmin(), { table: "matches", id, tenantId: auth.user.tenant_id, actor: userActor(auth.user), ...(await readDeleteOptions(req)) });
  if (!res.ok) return NextResponse.json({ error: res.error, blockers: res.blockers ?? [] }, { status: res.status });

  await recordAudit({ actor: userActor(auth.user), entity_type: "match", entity_id: id, action: "match.deleted", metadata: {} });
  return NextResponse.json({ deleted: true });
}
