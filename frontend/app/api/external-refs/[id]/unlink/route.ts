import { NextResponse } from "next/server";
import { z } from "zod";
import { supabaseAdmin } from "@/lib/supabase/server";
import { requirePermission } from "@/lib/auth/server-permission";
import { recordAudit } from "@/lib/audit/log";
import { userActor } from "@/lib/identity/actor";
import { unlinkExternal } from "@/lib/sync/external-refs";

export const runtime = "nodejs";

const schema = z.object({ reason: z.string().max(500) });

/** End a link to an outside system, with a reason. The link stays on record; it is never deleted. */
export async function POST(req: Request, ctx: { params: { id: string } }) {
  const auth = await requirePermission("manage_integrations");
  if ("error" in auth) return auth.error;
  const parsed = schema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "A reason is required", issues: parsed.error.issues }, { status: 400 });
  const res = await unlinkExternal(supabaseAdmin(), auth.user.tenant_id, ctx.params.id, parsed.data.reason, auth.user.email);
  if (!res.ok) return NextResponse.json({ error: res.error }, { status: res.status });
  await recordAudit({ actor: userActor(auth.user), entity_type: "external_ref", entity_id: ctx.params.id, action: "external_ref.unlinked", metadata: { reason: parsed.data.reason } });
  return NextResponse.json({ id: res.value.id });
}
