import { NextResponse } from "next/server";
import { z } from "zod";
import { supabaseAdmin } from "@/lib/supabase/server";
import { requirePermission } from "@/lib/auth/server-permission";
import { recordAudit } from "@/lib/audit/log";
import { userActor } from "@/lib/identity/actor";
import { settleUncertain } from "@/lib/actions/engine";
import { supabaseRpc } from "@/lib/actions/broker";
import { viewAction } from "@/lib/actions/queries";

export const runtime = "nodejs";

const schema = z.object({ outcome: z.enum(["sent", "not_sent"]), evidence: z.record(z.unknown()) });

/**
 * A person settles an action whose outcome was unknown: it did go out, or it did not, and what showed that. Only after this
 * can anything else be done about it. "not_sent" lets a new plan be made; "sent" closes it as done.
 */
export async function POST(req: Request, ctx: { params: { id: string } }) {
  const auth = await requirePermission("send_proposal");
  if ("error" in auth) return auth.error;
  const parsed = schema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success || Object.keys(parsed.data.evidence).length === 0) return NextResponse.json({ error: "Say what happened and what shows it (evidence)." }, { status: 400 });
  const sb = supabaseAdmin();
  const view = await viewAction(sb, auth.user.tenant_id, ctx.params.id);
  if (!view.ok) return NextResponse.json({ error: view.error }, { status: view.status });
  if (view.value.state !== "uncertain") return NextResponse.json({ error: `Only an action whose outcome is unknown can be settled. This one is "${view.value.state.replace(/_/g, " ")}".`, state: view.value.state }, { status: 409 });
  const r = await settleUncertain(supabaseRpc(sb), ctx.params.id, { kind: "approver", id: auth.user.id, email: auth.user.email }, parsed.data.outcome, parsed.data.evidence);
  if (!r.ok) return NextResponse.json({ error: r.failure.message }, { status: 409 });
  await recordAudit({ actor: userActor(auth.user), entity_type: view.value.target_type, entity_id: view.value.target_id, action: "agent.action.accepted", metadata: { action_id: ctx.params.id, outcome: parsed.data.outcome, evidence: parsed.data.evidence } });
  return NextResponse.json({ state: parsed.data.outcome === "sent" ? "reconciled" : "failed" });
}
