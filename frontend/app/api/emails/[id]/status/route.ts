import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { requirePermission } from "@/lib/auth/server-permission";
import { recordAudit } from "@/lib/audit/log";

export const runtime = "nodejs";

export async function PATCH(req: Request, ctx: { params: { id: string } }) {
  const auth = await requirePermission("approve_proposal");
  if ("error" in auth) return auth.error;

  const body = await req.json().catch(() => ({}));
  const { status } = body as { status?: string };

  if (!status || !["approved", "rejected"].includes(status)) {
    return NextResponse.json({ error: "Invalid status" }, { status: 400 });
  }

  const sb = supabaseAdmin();
  const { data, error } = await sb
    .from("emails")
    .update({ status })
    .eq("id", ctx.params.id)
    .eq("tenant_id", auth.user.tenant_id)
    .select("id, status")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await recordAudit({
    entity_type: "email",
    entity_id: ctx.params.id,
    action: status === "approved" ? "email.approved" : "email.rejected",
    performed_by: auth.user.id,
    actor_email: auth.user.email,
  });

  return NextResponse.json({ data });
}
