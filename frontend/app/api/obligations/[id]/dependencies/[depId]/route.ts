import { NextResponse } from "next/server";
import { z } from "zod";
import { supabaseAdmin } from "@/lib/supabase/server";
import { requirePermission } from "@/lib/auth/server-permission";
import { recordAudit } from "@/lib/audit/log";
import { removeDependency } from "@/lib/schedule/store";
import { refreshForObligation } from "@/lib/company-status/store";

export const runtime = "nodejs";

const schema = z.object({ reason: z.string().max(1000) });

/** End a dependency, with a reason. It stays on record; it is never deleted. */
export async function DELETE(req: Request, ctx: { params: { id: string; depId: string } }) {
  const auth = await requirePermission("manage_obligations");
  if ("error" in auth) return auth.error;
  const parsed = schema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "A reason is required", issues: parsed.error.issues }, { status: 400 });

  const res = await removeDependency(supabaseAdmin(), auth.user.tenant_id, ctx.params.id, ctx.params.depId, parsed.data.reason, auth.user.email);
  if (!res.ok) return NextResponse.json({ error: res.error }, { status: res.status });
  await recordAudit({ entity_type: "obligation", entity_id: ctx.params.id, action: "obligation.dependency_ended", actor_email: auth.user.email, tenant_id: auth.user.tenant_id, metadata: { dependency_id: ctx.params.depId, reason: parsed.data.reason, actor_user_id: auth.user.id } });
  await refreshForObligation(supabaseAdmin(), auth.user.tenant_id, ctx.params.id, "obligation.dependency_ended");
  return NextResponse.json({ id: res.value.id });
}
