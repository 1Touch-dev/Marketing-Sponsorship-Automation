import { NextResponse } from "next/server";
import { z } from "zod";
import { supabaseAdmin } from "@/lib/supabase/server";
import { requirePermission } from "@/lib/auth/server-permission";
import { recordAudit } from "@/lib/audit/log";
import { userActor } from "@/lib/identity/actor";
import { promoteWithGate } from "@/lib/evals/promotion";
import { scoreRun } from "@/lib/observability/langfuse";

export const runtime = "nodejs";

const schema = z.object({ eval_run_id: z.string().uuid().nullish(), override_reason: z.string().max(500).nullish() });

/**
 * POST /api/agent-registry/<key>/versions/<n>/promote   { eval_run_id } or { override_reason }
 * Makes a version the live one. It needs a passing evaluation of this version (POST .../evaluate), made with the prompts as they
 * are now, or a written override. The version it replaces is retired in the same step, and any plan still waiting for approval
 * under the old version stops.
 */
export async function POST(req: Request, ctx: { params: { key: string; version: string } }) {
  const auth = await requirePermission("manage_agents");
  if ("error" in auth) return auth.error;
  const parsed = schema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "Invalid payload", issues: parsed.error.issues }, { status: 400 });
  const res = await promoteWithGate(supabaseAdmin(), auth.user.tenant_id, ctx.params.key, Number(ctx.params.version), { evalRunId: parsed.data.eval_run_id, overrideReason: parsed.data.override_reason }, { kind: "human", id: auth.user.email });
  if (!res.ok) return NextResponse.json({ error: res.error }, { status: res.status });
  await recordAudit({
    actor: userActor(auth.user), entity_type: "agent", entity_id: res.value.id, action: res.value.basis === "override" ? "agent.version_promoted_by_override" : "agent.version_promoted",
    metadata: { key: ctx.params.key, version: Number(ctx.params.version), basis: res.value.basis, eval_run_id: parsed.data.eval_run_id ?? null, override_reason: parsed.data.override_reason ?? null },
  });
  if (parsed.data.eval_run_id) scoreRun(`eval:${parsed.data.eval_run_id}`, "promoted", 1);
  return NextResponse.json({ id: res.value.id, live: true, basis: res.value.basis });
}
