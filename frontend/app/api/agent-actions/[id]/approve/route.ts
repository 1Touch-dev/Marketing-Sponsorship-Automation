import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { requirePermission } from "@/lib/auth/server-permission";
import { approveAndSend } from "@/lib/actions/broker";
import { viewAction } from "@/lib/actions/queries";
import { toolSendEmail } from "@/lib/agents/tools";
import { idempotent } from "@/lib/idempotency";
import { settleRunForAction } from "@/lib/agents/langgraph/outreach-runner";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Approve exactly this plan and run it. For a plan to send an email: the database checks that you are an active
 * member who may approve it (and not the agent that asked), that the agent still has its authority, and that the plan
 * is unchanged, immediately before it runs. An outcome nobody can confirm is left "uncertain", never repeated.
 */
async function postHandler(_req: Request, ctx: { params: { id: string } }) {
  const auth = await requirePermission("send_proposal");
  if ("error" in auth) return auth.error;
  const sb = supabaseAdmin();
  const view = await viewAction(sb, auth.user.tenant_id, ctx.params.id);
  if (!view.ok) return NextResponse.json({ error: view.error }, { status: view.status });
  if (view.value.effect !== "send_email") return NextResponse.json({ error: `Plans for "${view.value.effect}" are not approved here.` }, { status: 400 });
  const out = await approveAndSend(sb, { tenantId: auth.user.tenant_id, actionId: ctx.params.id, approver: auth.user, send: () => toolSendEmail({ email_id: view.value.target_id }) });
  if (!out.ok) {
    // an unknown outcome leaves the run waiting: a person settles it, and that finishes the run (settle route)
    if (out.state === "failed") await settleRunForAction(sb, auth.user.tenant_id, ctx.params.id, "failed").catch(() => undefined);
    return NextResponse.json({ error: out.error, state: out.state ?? null }, { status: out.status });
  }
  await settleRunForAction(sb, auth.user.tenant_id, ctx.params.id, "sent").catch(() => undefined);
  return NextResponse.json({ state: out.state, summary: out.summary });
}

export const POST = idempotent("agent-actions.approve", postHandler);
