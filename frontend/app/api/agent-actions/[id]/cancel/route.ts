import { NextResponse } from "next/server";
import { z } from "zod";
import { supabaseAdmin } from "@/lib/supabase/server";
import { requirePermission } from "@/lib/auth/server-permission";
import { recordAudit } from "@/lib/audit/log";
import { userActor } from "@/lib/identity/actor";
import { cancel } from "@/lib/actions/engine";
import { supabaseRpc } from "@/lib/actions/broker";
import { viewAction } from "@/lib/actions/queries";

export const runtime = "nodejs";

const schema = z.object({ note: z.string().max(500).nullish() });

/** Withdraw a plan before it runs. Not possible once it is executing. */
export async function POST(req: Request, ctx: { params: { id: string } }) {
  const auth = await requirePermission("send_proposal");
  if ("error" in auth) return auth.error;
  const parsed = schema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  const sb = supabaseAdmin();
  const view = await viewAction(sb, auth.user.tenant_id, ctx.params.id);
  if (!view.ok) return NextResponse.json({ error: view.error }, { status: view.status });
  const r = await cancel(supabaseRpc(sb), ctx.params.id, { kind: "human", id: auth.user.id, email: auth.user.email }, parsed.data.note ?? undefined);
  if (!r.ok) return NextResponse.json({ error: r.failure.message }, { status: 409 });
  await recordAudit({ actor: userActor(auth.user), entity_type: view.value.target_type, entity_id: view.value.target_id, action: "agent.action.cancelled", metadata: { action_id: ctx.params.id, note: parsed.data.note ?? null } });
  return NextResponse.json({ state: "cancelled" });
}
