import { unitLabel } from "../inventory/availability";
import type { QuoteLine } from "../proposals/revisions";

/** What a contract committed to for one allocation, copied from the frozen revision. */
export type ContractAllocationRow = {
  tenant_id: string;
  contract_id: string;
  allocation_id: string;
  proposal_id: string;
  revision_id: string | null;
  inventory_id: string;
  inventory_name: string | null;
  quantity: number;
  unit: string;
  period: string | null;
  unit_price: number | null;
  currency: string;
  discount_pct: number | null;
};

export function allocationRowsFromLines(
  lines: QuoteLine[],
  ctx: { tenantId: string; contractId: string; proposalId: string; revisionId: string | null },
): ContractAllocationRow[] {
  return lines
    .filter((l): l is QuoteLine & { allocation_id: string } => !!l.allocation_id)
    .map((l) => ({
      tenant_id: ctx.tenantId,
      contract_id: ctx.contractId,
      allocation_id: l.allocation_id,
      proposal_id: ctx.proposalId,
      revision_id: ctx.revisionId,
      inventory_id: l.inventory_id,
      inventory_name: l.name,
      quantity: l.quantity,
      unit: l.unit,
      period: l.period,
      unit_price: l.unit_price,
      currency: l.currency,
      discount_pct: l.discount_pct,
    }));
}

export type DeliveryTask = {
  id: string;
  title: string;
  status: "pending" | "done";
  created_at: string;
  completed_at: string | null;
  allocation_id?: string | null;
};

export function allocationTaskTitle(a: { inventory_name: string | null; quantity: number; unit: string }): string {
  return `Entregar: ${a.inventory_name ?? "item"} × ${a.quantity} (${unitLabel(a.unit)})`;
}

/** One delivery task per allocation, skipping allocations that already have one. */
export function missingAllocationTasks(
  existing: DeliveryTask[],
  allocations: Array<{ allocation_id: string; inventory_name: string | null; quantity: number; unit: string }>,
  newId: () => string,
  now = new Date().toISOString(),
): DeliveryTask[] {
  const have = new Set(existing.map((t) => t.allocation_id).filter(Boolean));
  return allocations
    .filter((a) => !have.has(a.allocation_id))
    .map((a) => ({
      id: newId(),
      title: allocationTaskTitle(a),
      status: "pending" as const,
      created_at: now,
      completed_at: null,
      allocation_id: a.allocation_id,
    }));
}

/** A renewal line that continues an earlier allocation, at the earlier frozen price, for human review. */
export function renewalLineFromAllocation(
  a: { allocation_id: string; inventory_id: string; quantity: number; unit: string; unit_price: number | null; currency: string },
  ctx: { tenantId: string; proposalId: string; priorContractNumber: string | null },
) {
  return {
    tenant_id: ctx.tenantId,
    proposal_id: ctx.proposalId,
    inventory_id: a.inventory_id,
    quantity: a.quantity,
    scope: a.unit,
    price_agreed: a.unit_price,
    currency: a.currency,
    renewed_from_allocation_id: a.allocation_id,
    notes: `Carried from contract ${ctx.priorContractNumber ?? "(unnumbered)"} — review pricing and period before sending`,
  };
}
