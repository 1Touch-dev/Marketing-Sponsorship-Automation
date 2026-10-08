import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { requirePermission } from "@/lib/auth/server-permission";
import { deleteRecord, readDeleteOptions } from "@/lib/records/tombstones";
import { userActor } from "@/lib/identity/actor";
import { recordAudit } from "@/lib/audit/log";

export const runtime = "nodejs";

export async function DELETE(
  req: Request,
  { params }: { params: { id: string } }
) {
  const auth = await requirePermission("edit_company");
  if ("error" in auth) return auth.error;

  const res = await deleteRecord(supabaseAdmin(), { table: "contacts", id: params.id, tenantId: auth.user.tenant_id, actor: userActor(auth.user), ...(await readDeleteOptions(req)) });
  if (!res.ok) return NextResponse.json({ error: res.error, blockers: res.blockers ?? [] }, { status: res.status });
  await recordAudit({ actor: userActor(auth.user), entity_type: "contact", entity_id: params.id, action: "contact.deleted", metadata: { dependents: res.dependents } });
  return NextResponse.json({ success: true });
}

export async function PATCH(
  req: Request,
  { params }: { params: { id: string } }
) {
  const auth = await requirePermission("edit_company");
  if ("error" in auth) return auth.error;

  const sb = supabaseAdmin();
  const body = await req.json().catch(() => ({}));
  const { data, error } = await sb
    .from("contacts")
    .update(body)
    .eq("id", params.id)
    .eq("tenant_id", auth.user.tenant_id)
    .select("*")
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
