import { NextResponse } from "next/server";
import { z } from "zod";
import { supabaseAdmin } from "@/lib/supabase/server";
import { requirePermission } from "@/lib/auth/server-permission";
import { recordAudit } from "@/lib/audit/log";
import { approveRevision } from "@/lib/proposals/revision-store";
import { invalidateIfDrifted } from "@/lib/proposals/approval-guard";

export const runtime = "nodejs";

const bodySchema = z.object({
  line_id: z.string().uuid(),
  discount_pct: z.number().min(0).max(100).nullable().optional(),
  tax_treatment: z.enum(["unspecified", "tax_inclusive", "tax_exclusive"]).optional(),
  period_label: z.string().max(120).nullable().optional(),
});

/**
 * Sets the commercial terms of one quote line (discount, tax treatment,
 * period). Whoever may approve proposals may grant a discount, and the grant
 * is recorded on the line. A signed contract's lines cannot change, and
 * changing an approved proposal's lines sends it back to review.
 */
export async function PATCH(req: Request, ctx: { params: { id: string } }) {
  const auth = await requirePermission("approve_proposal");
  if ("error" in auth) return auth.error;

  const parsed = bodySchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "Invalid payload", issues: parsed.error.issues }, { status: 400 });

  const sb = supabaseAdmin();
  const { data: proposal } = await sb.from("proposals").select("id, status").eq("id", ctx.params.id).eq("tenant_id", auth.user.tenant_id).maybeSingle();
  if (!proposal) return NextResponse.json({ error: "Proposal not found" }, { status: 404 });
  const status = (proposal as { status: string }).status;

  if (status === "active_contract") {
    return NextResponse.json({ error: "This proposal is an active contract; its lines cannot be changed. Create an amendment instead.", code: "contract_active" }, { status: 409 });
  }
  const wasApproved = status === "approved" || status === "sent";
  if (wasApproved) {
    await approveRevision(sb, auth.user.tenant_id, ctx.params.id, { reason: "Baseline frozen before line change", userId: auth.user.id });
  }

  const update: Record<string, unknown> = {};
  if ("discount_pct" in parsed.data) {
    update.discount_pct = parsed.data.discount_pct ?? null;
    update.discount_authorized_by = parsed.data.discount_pct ? auth.user.id : null;
  }
  if (parsed.data.tax_treatment) update.tax_treatment = parsed.data.tax_treatment;
  if ("period_label" in parsed.data) update.period_label = parsed.data.period_label ?? null;
  if (Object.keys(update).length === 0) return NextResponse.json({ error: "Nothing to update" }, { status: 400 });

  const { data: line, error } = await (sb as any)
    .from("proposal_inventory_items")
    .update(update)
    .eq("id", parsed.data.line_id)
    .eq("proposal_id", ctx.params.id)
    .eq("tenant_id", auth.user.tenant_id)
    .select("*")
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!line) return NextResponse.json({ error: "Line not found on this proposal" }, { status: 404 });

  await recordAudit({
    entity_type: "proposal",
    entity_id: ctx.params.id,
    action: "proposal.line_terms_changed",
    actor_email: auth.user.email,
    metadata: { line_id: parsed.data.line_id, actor_user_id: auth.user.id, ...update },
  });

  let invalidated = false;
  if (wasApproved) {
    invalidated = (await invalidateIfDrifted(sb, auth.user.tenant_id, ctx.params.id, { id: auth.user.id, email: auth.user.email }, "Quote line terms changed after approval")).invalidated;
  }
  return NextResponse.json({ data: line, approval_invalidated: invalidated });
}
