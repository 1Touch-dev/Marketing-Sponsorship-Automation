import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { requirePermission } from "@/lib/auth/server-permission";
import { resolveTenantId } from "@/lib/tenants/current";
import { generateFulfillmentTasks } from "@/lib/proposals/fulfillment-tasks";
import { activateProposalUnits, leaveActiveContractUnits } from "@/lib/inventory/proposal-units";
import { guardActivationTerms } from "@/lib/proposals/approval-guard";
import { appendAllocationTasks, createContractAllocations } from "@/lib/allocations/store";
import type { ProposalContent } from "@/types/database";

export async function GET() {
  const tenantId = await resolveTenantId();
  const sb = supabaseAdmin();
  const { data, error } = await sb
    .from("contracts")
    .select("*, companies(company_name), proposals(id, title)")
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data ?? []);
}

export async function POST(req: NextRequest) {
  const auth = await requirePermission("edit_proposal");
  if ("error" in auth) return auth.error;

  const sb = supabaseAdmin();
  const body = await req.json();

  // Commit the proposal's inventory units before recording the contract, so a
  // last-unit conflict is rejected without leaving a contract row behind.
  let activatedHere = false;
  if (body.proposal_id) {
    const terms = await guardActivationTerms(sb, auth.user.tenant_id, body.proposal_id, auth.user.id);
    if (!terms.ok) return NextResponse.json({ error: terms.message, code: terms.code }, { status: 409 });
    const activation = await activateProposalUnits(sb, auth.user.tenant_id, body.proposal_id);
    if (!activation.ok) {
      if ("notFound" in activation) return NextResponse.json({ error: "Proposal not found" }, { status: 404 });
      return NextResponse.json(
        {
          error: `Cannot create this contract: ${activation.conflict.name} — ${activation.conflict.reason}`,
          code: "inventory_unavailable",
          conflict: activation.conflict,
        },
        { status: 409 },
      );
    }
    activatedHere = !activation.alreadyActive;
  }

  const { data, error } = await sb
    .from("contracts")
    .insert({ ...body, tenant_id: auth.user.tenant_id })
    .select()
    .single();
  if (error) {
    if (activatedHere) await leaveActiveContractUnits(sb, auth.user.tenant_id, body.proposal_id, "approved");
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Update proposal status to active_contract, and auto-generate the
  // fulfillment checklist (Task 10) — only if one doesn't already exist,
  // so re-signing/renewing a contract on the same proposal doesn't wipe
  // out progress on an existing checklist.
  if (body.proposal_id) {
    const { data: proposalRow } = await sb
      .from("proposals")
      .select("content")
      .eq("id", body.proposal_id)
      .eq("tenant_id", auth.user.tenant_id)
      .maybeSingle();

    const content = (proposalRow?.content as ProposalContent) ?? {};
    const updates: Record<string, unknown> = { status: "active_contract" };
    if (!content.fulfillment_tasks || content.fulfillment_tasks.length === 0) {
      const tasks = generateFulfillmentTasks(content.deliverables ?? []);
      updates.content = { ...content, fulfillment_tasks: tasks };
    }

    await sb
      .from("proposals")
      .update(updates)
      .eq("id", body.proposal_id)
      .eq("tenant_id", auth.user.tenant_id);

    // One allocation id per quote line, carried into the contract and its
    // delivery tasks. Never blocks contract creation: the contract exists.
    try {
      const recorded = await createContractAllocations(sb, auth.user.tenant_id, data.id, body.proposal_id);
      if (recorded.ok) await appendAllocationTasks(sb, auth.user.tenant_id, body.proposal_id, data.id);
    } catch (err) {
      console.error("[contracts] allocation record failed", err);
    }
  }

  await sb.from("audit_logs").insert({
    tenant_id: auth.user.tenant_id,
    action: "contract.created",
    entity_type: "contract",
    entity_id: data.id,
    metadata: { proposal_id: body.proposal_id, value: body.total_value_brl },
  });

  return NextResponse.json(data, { status: 201 });
}
