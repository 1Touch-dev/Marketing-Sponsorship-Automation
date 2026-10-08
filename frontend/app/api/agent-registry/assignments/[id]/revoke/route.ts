import { NextResponse } from "next/server";
import { z } from "zod";
import { supabaseAdmin } from "@/lib/supabase/server";
import { requirePermission } from "@/lib/auth/server-permission";
import { recordAudit } from "@/lib/audit/log";
import { userActor } from "@/lib/identity/actor";
import { revokeAssignment } from "@/lib/agents/registry";

export const runtime = "nodejs";

const schema = z.object({ reason: z.string().min(5).max(500) });

/** Take an assignment away, with a reason. Work already planned under it is stopped before it runs. */
export async function POST(req: Request, ctx: { params: { id: string } }) {
  const auth = await requirePermission("manage_agents");
  if ("error" in auth) return auth.error;
  const parsed = schema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "A reason (5+ characters) is required." }, { status: 400 });
  const res = await revokeAssignment(supabaseAdmin(), auth.user.tenant_id, ctx.params.id, parsed.data.reason, auth.user.email);
  if (!res.ok) return NextResponse.json({ error: res.error }, { status: res.status });
  await recordAudit({ actor: userActor(auth.user), entity_type: "agent", entity_id: ctx.params.id, action: "agent.assignment_revoked", metadata: { reason: parsed.data.reason } });
  return NextResponse.json({ id: res.value.id });
}
