import { NextResponse } from "next/server";
import { z } from "zod";
import { supabaseAdmin } from "@/lib/supabase/server";
import { requirePermission } from "@/lib/auth/server-permission";
import { recordAudit } from "@/lib/audit/log";
import { closeOrReopen } from "@/lib/opportunities/store";
import { userActor } from "@/lib/identity/actor";

export const runtime = "nodejs";

const schema = z.object({ action: z.enum(["close", "reopen"]), reason: z.string().min(5).max(1000) });

/** A person closes or reopens an opportunity, with a reason. Nothing is deleted; the history stays. */
export async function POST(req: Request, ctx: { params: { id: string } }) {
  const auth = await requirePermission("create_opportunity");
  if ("error" in auth) return auth.error;

  const parsed = schema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "Invalid payload", issues: parsed.error.issues }, { status: 400 });

  const res = await closeOrReopen(supabaseAdmin(), auth.user.tenant_id, ctx.params.id, { ...parsed.data, actorEmail: auth.user.email });
  if (!res.ok) return NextResponse.json({ error: res.error }, { status: res.status });

  await recordAudit({ actor: userActor(auth.user), entity_type: "opportunity", entity_id: ctx.params.id, action: `opportunity.${parsed.data.action === "close" ? "closed" : "reopened"}`, actor_email: auth.user.email, tenant_id: auth.user.tenant_id, metadata: { reason: parsed.data.reason, actor_user_id: auth.user.id } });
  return NextResponse.json({ status: res.value.status });
}
