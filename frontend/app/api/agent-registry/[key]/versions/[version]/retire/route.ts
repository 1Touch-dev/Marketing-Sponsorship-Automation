import { NextResponse } from "next/server";
import { z } from "zod";
import { supabaseAdmin } from "@/lib/supabase/server";
import { requirePermission } from "@/lib/auth/server-permission";
import { recordAudit } from "@/lib/audit/log";
import { userActor } from "@/lib/identity/actor";
import { retireVersion } from "@/lib/agents/registry";

export const runtime = "nodejs";

const schema = z.object({ reason: z.string().min(5).max(500) });

/** Take a live version out of service, with a reason. The agent then has no live version and cannot act until another is promoted. */
export async function POST(req: Request, ctx: { params: { key: string; version: string } }) {
  const auth = await requirePermission("manage_agents");
  if ("error" in auth) return auth.error;
  const parsed = schema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "A reason (5+ characters) is required." }, { status: 400 });
  const res = await retireVersion(supabaseAdmin(), auth.user.tenant_id, ctx.params.key, Number(ctx.params.version), parsed.data.reason, { kind: "human", id: auth.user.email });
  if (!res.ok) return NextResponse.json({ error: res.error }, { status: res.status });
  await recordAudit({ actor: userActor(auth.user), entity_type: "agent", entity_id: res.value.id, action: "agent.version_retired", metadata: { key: ctx.params.key, version: Number(ctx.params.version), reason: parsed.data.reason } });
  return NextResponse.json({ id: res.value.id });
}
