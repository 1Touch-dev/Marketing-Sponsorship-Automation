import { NextResponse } from "next/server";
import { z } from "zod";
import { supabaseAdmin } from "@/lib/supabase/server";
import { requirePermission } from "@/lib/auth/server-permission";
import { recordAudit } from "@/lib/audit/log";
import { userActor } from "@/lib/identity/actor";
import { createVersion } from "@/lib/agents/registry";

export const runtime = "nodejs";

const schema = z.object({ effects: z.array(z.string().min(1)).min(1), tools: z.array(z.string()).optional(), max_cost_usd: z.number().positive().max(100), model: z.string().max(100).nullish(), prompt_ref: z.string().max(100).nullish(), notes: z.string().max(1000).nullish() });

/** Add a version. A version is immutable; it does nothing until it is promoted with evidence. */
export async function POST(req: Request, ctx: { params: { key: string } }) {
  const auth = await requirePermission("manage_agents");
  if ("error" in auth) return auth.error;
  const parsed = schema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "Invalid payload", issues: parsed.error.issues }, { status: 400 });
  const res = await createVersion(supabaseAdmin(), auth.user.tenant_id, ctx.params.key, parsed.data, auth.user.email);
  if (!res.ok) return NextResponse.json({ error: res.error }, { status: res.status });
  await recordAudit({ actor: userActor(auth.user), entity_type: "agent", entity_id: res.value.id, action: "agent.version_created", metadata: { key: ctx.params.key, version: res.value.version } });
  return NextResponse.json(res.value, { status: 201 });
}
