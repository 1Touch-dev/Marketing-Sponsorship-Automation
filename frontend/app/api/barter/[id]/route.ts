import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { recordAudit } from "@/lib/audit/log";
import { requirePermission } from "@/lib/auth/server-permission";
import { userActor } from "@/lib/identity/actor";
import { parseBarterPatch } from "@/lib/barter/parse";

export const runtime = "nodejs";

export async function PATCH(req: Request, ctx: { params: { id: string } }) {
  const auth = await requirePermission("manage_inventory");
  if ("error" in auth) return auth.error;

  const id = ctx.params.id;
  const body = await req.json().catch(() => ({}));
  const parsed = parseBarterPatch(body);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });

  const sb = supabaseAdmin();
  const { data, error } = await (sb as ReturnType<typeof supabaseAdmin>)
    .from("barter_items" as "companies")
    .update(parsed.data as never)
    .eq("id", id)
    .eq("tenant_id" as "id", auth.user.tenant_id)
    .select("*")
    .single();

  if (error) {
    if (error.message?.includes("not find") || error.message?.includes("does not exist") || error.code === "PGRST116") {
      return NextResponse.json({ error: "Item not found" }, { status: 404 });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!data) return NextResponse.json({ error: "Item not found" }, { status: 404 });

  await recordAudit({
    actor: userActor(auth.user),
    entity_type: "barter",
    entity_id: id,
    action: "barter.updated",
    metadata: parsed.data,
  });

  return NextResponse.json({ data });
}
