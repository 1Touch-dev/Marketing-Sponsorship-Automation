import { NextResponse } from "next/server";
import { z } from "zod";
import { supabaseAdmin } from "@/lib/supabase/server";
import { resolveTenantId } from "@/lib/tenants/current";
import { requirePermission } from "@/lib/auth/server-permission";
import { recordAudit } from "@/lib/audit/log";
import { getObligation, updateObligation } from "@/lib/obligations/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** One obligation with its history, the proof attached, and how well proven the contract behind it is. */
export async function GET(_req: Request, ctx: { params: { id: string } }) {
  const res = await getObligation(supabaseAdmin(), await resolveTenantId(), ctx.params.id);
  if (!res.ok) return NextResponse.json({ error: res.error }, { status: res.status });
  return NextResponse.json(res.value);
}

const schema = z.object({ owner_email: z.string().max(200).optional(), description: z.string().max(2000).nullish() });

/** Reassign an obligation or reword its description. Its dates and quantity are fixed once it exists. */
export async function PATCH(req: Request, ctx: { params: { id: string } }) {
  const auth = await requirePermission("manage_obligations");
  if ("error" in auth) return auth.error;
  const parsed = schema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "Invalid payload", issues: parsed.error.issues }, { status: 400 });

  const res = await updateObligation(supabaseAdmin(), auth.user.tenant_id, ctx.params.id, parsed.data);
  if (!res.ok) return NextResponse.json({ error: res.error }, { status: res.status });
  await recordAudit({ entity_type: "obligation", entity_id: ctx.params.id, action: "obligation.updated", actor_email: auth.user.email, tenant_id: auth.user.tenant_id, metadata: { fields: Object.keys(parsed.data), actor_user_id: auth.user.id } });
  return NextResponse.json({ id: res.value.id });
}
