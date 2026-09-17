import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/auth/server-permission";
import { runNegotiationAgent } from "@/lib/agents/langgraph/negotiation-agent";
import { recordAudit } from "@/lib/audit/log";

export const runtime = "nodejs";
export const maxDuration = 30;

/**
 * POST /api/emails/[id]/negotiate
 * Task/Phase 8 — Negotiation Agent. `[id]` is the INBOUND reply email
 * being responded to. Creates a new draft outbound email (pending_approval)
 * grounded in the real proposal's pricing/deliverables.
 */
export async function POST(_req: Request, ctx: { params: { id: string } }) {
  const auth = await requirePermission("send_proposal");
  if ("error" in auth) return auth.error;

  const result = await runNegotiationAgent(ctx.params.id);
  if (!result.success) {
    return NextResponse.json({ error: result.error ?? "Negotiation agent failed" }, { status: 500 });
  }

  await recordAudit({
    entity_type: "email",
    entity_id: ctx.params.id,
    action: "email.negotiation_drafted",
    metadata: { draft_email_id: result.draftEmailId },
  });

  return NextResponse.json({ draftEmailId: result.draftEmailId, subject: result.subject });
}
