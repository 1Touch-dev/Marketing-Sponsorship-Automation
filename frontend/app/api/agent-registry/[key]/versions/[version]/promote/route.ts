import { NextResponse } from "next/server";
import { z } from "zod";
import { supabaseAdmin } from "@/lib/supabase/server";
import { requirePermission } from "@/lib/auth/server-permission";
import { recordAudit } from "@/lib/audit/log";
import { userActor } from "@/lib/identity/actor";
import { promoteVersion } from "@/lib/agents/registry";

export const runtime = "nodejs";

const schema = z.object({ evidence: z.record(z.unknown()) });

/** Make a version the live one, with the evidence that justified it. The version it replaces is retired in the same step. */
export async function POST(req: Request, ctx: { params: { key: string; version: string } }) {
  const auth = await requirePermission("manage_agents");
  if ("error" in auth) return auth.error;
  const parsed = schema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "Give the evidence that the version is ready." }, { status: 400 });
  const res = await promoteVersion(supabaseAdmin(), auth.user.tenant_id, ctx.params.key, Number(ctx.params.version), parsed.data.evidence, { kind: "human", id: auth.user.email });
  if (!res.ok) return NextResponse.json({ error: res.error }, { status: res.status });
  await recordAudit({ actor: userActor(auth.user), entity_type: "agent", entity_id: res.value.id, action: "agent.version_promoted", metadata: { key: ctx.params.key, version: Number(ctx.params.version), evidence: parsed.data.evidence } });
  return NextResponse.json({ id: res.value.id, live: true });
}
