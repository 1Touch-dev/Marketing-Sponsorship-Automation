import { NextResponse } from "next/server";
import { z } from "zod";
import { supabaseAdmin } from "@/lib/supabase/server";
import { requirePermission } from "@/lib/auth/server-permission";
import { recordAudit } from "@/lib/audit/log";
import { recordEvent } from "@/lib/finance/store";
import { userActor } from "@/lib/identity/actor";

export const runtime = "nodejs";

const schema = z.object({
  action: z.enum(["invoice", "settle", "void"]),
  reference: z.string().max(300).nullish(),
  occurred_on: z.string().max(10).nullish(),
  reason: z.string().max(1000).nullish(),
});

/**
 * Record that a cash line was invoiced, that cash or barter goods were received (settled), or void a wrong line.
 * Admin only. Refused for a proposal or a draft or lapsed contract: those are not revenue.
 */
export async function POST(req: Request, ctx: { params: { id: string } }) {
  const auth = await requirePermission("manage_finance");
  if ("error" in auth) return auth.error;
  const parsed = schema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "Invalid payload", issues: parsed.error.issues }, { status: 400 });

  const d = parsed.data;
  const res = await recordEvent(supabaseAdmin(), auth.user.tenant_id, ctx.params.id, { action: d.action, reference: d.reference, occurredOn: d.occurred_on, reason: d.reason }, auth.user.email);
  if (!res.ok) return NextResponse.json({ error: res.error }, { status: res.status });
  await recordAudit({ actor: userActor(auth.user), entity_type: "value_line", entity_id: ctx.params.id, action: `value_line.${d.action}`, actor_email: auth.user.email, tenant_id: auth.user.tenant_id, metadata: { reference: d.reference ?? null, occurred_on: d.occurred_on ?? null, reason: d.reason ?? null, actor_user_id: auth.user.id } });
  return NextResponse.json({ status: res.value.status });
}
