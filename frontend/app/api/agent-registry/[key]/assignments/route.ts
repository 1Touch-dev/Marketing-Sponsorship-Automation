import { NextResponse } from "next/server";
import { z } from "zod";
import { supabaseAdmin } from "@/lib/supabase/server";
import { requirePermission } from "@/lib/auth/server-permission";
import { recordAudit } from "@/lib/audit/log";
import { userActor } from "@/lib/identity/actor";
import { assign } from "@/lib/agents/registry";

export const runtime = "nodejs";

const schema = z.object({
  scope_kind: z.enum(["all_companies", "company", "campaign"]),
  scope_id: z.string().uuid().nullish(),
  allowed_effects: z.array(z.string().min(1)).min(1),
  max_cost_usd: z.number().positive().max(100),
  expires_at: z.string().datetime().nullish(),
  justification: z.string().max(500).nullish(),
});

/**
 * Give an agent authority over one company, one campaign, or all companies (which needs a written justification),
 * for the effects listed, up to a cost per run, until it expires or is revoked.
 */
export async function POST(req: Request, ctx: { params: { key: string } }) {
  const auth = await requirePermission("manage_agents");
  if ("error" in auth) return auth.error;
  const parsed = schema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "Invalid payload", issues: parsed.error.issues }, { status: 400 });
  const res = await assign(supabaseAdmin(), auth.user.tenant_id, ctx.params.key, parsed.data, auth.user.email);
  if (!res.ok) return NextResponse.json({ error: res.error }, { status: res.status });
  await recordAudit({ actor: userActor(auth.user), entity_type: "agent", entity_id: res.value.id, action: "agent.assigned", metadata: { key: ctx.params.key, ...parsed.data } });
  return NextResponse.json({ id: res.value.id }, { status: 201 });
}
