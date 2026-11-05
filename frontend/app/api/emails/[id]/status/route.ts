import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { requirePermission } from "@/lib/auth/server-permission";
import { recordAudit } from "@/lib/audit/log";
import { recordMessageEventSafe } from "@/lib/messaging/store";
import { userActor } from "@/lib/identity/actor";
import { reservedRecipientBlock } from "@/lib/email/reserved-recipient";

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

  if (status === "approved") {
    const { data: existing, error: loadErr } = await sb
      .from("emails")
      .select("id, recipient")
      .eq("id", ctx.params.id)
      .eq("tenant_id", auth.user.tenant_id)
      .maybeSingle();
    if (loadErr || !existing) {
      return NextResponse.json({ error: loadErr?.message ?? "Email not found" }, { status: loadErr ? 500 : 404 });
    }
    const reserved = reservedRecipientBlock(String((existing as { recipient?: string }).recipient ?? ""));
    if (reserved) {
      return NextResponse.json({ error: reserved.message, code: reserved.code }, { status: 409 });
    }
  }

  const { data, error } = await sb
    .from("emails")
    .update({ status })
    .eq("id", ctx.params.id)
    .eq("tenant_id", auth.user.tenant_id)
    .select("id, status")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  if (status === "approved") {
    await recordMessageEventSafe(sb, auth.user.tenant_id, ctx.params.id, {
      event_type: "content_approved", source: "platform", actor_user_id: auth.user.id, actor_email: auth.user.email,
    });
  }

  await recordAudit({ actor: userActor(auth.user),
    entity_type: "email",
    entity_id: ctx.params.id,
    action: status === "approved" ? "email.approved" : "email.rejected",
    performed_by: auth.user.id,
    actor_email: auth.user.email,
  });

  return NextResponse.json({ data });
}
