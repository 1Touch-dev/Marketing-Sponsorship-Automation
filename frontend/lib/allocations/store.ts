import { randomUUID } from "crypto";
import { isMissingMigration, loadSnapshot } from "../proposals/revision-store";
import type { QuoteLine } from "../proposals/revisions";
import { allocationRowsFromLines, missingAllocationTasks, renewalLineFromAllocation, type DeliveryTask } from "./model";

type Sb = any;

export type ContractAllocationsResult =
  | { ok: true; allocations: number; revisionId: string | null }
  | { ok: false; skipped: "migration_missing" | "error"; error?: string };

/**
 * Records what a contract committed to, line by line, from the frozen
 * revision its proposal was approved at (or from the live lines for a
 * proposal approved before revisions existed), and binds the contract to
 * that revision.
 */
export async function createContractAllocations(sb: Sb, tenantId: string, contractId: string, proposalId: string): Promise<ContractAllocationsResult> {
  const { data: prop } = await sb.from("proposals").select("approved_revision_id").eq("id", proposalId).eq("tenant_id", tenantId).maybeSingle();
  const revisionId = (prop as { approved_revision_id?: string | null } | null)?.approved_revision_id ?? null;

  let lines: QuoteLine[] | null = null;
  if (revisionId) {
    const { data: rev } = await sb.from("proposal_revisions").select("lines").eq("id", revisionId).maybeSingle();
    const fromRevision = ((rev as { lines?: QuoteLine[] } | null)?.lines ?? []) as QuoteLine[];
    if (fromRevision.length > 0 && fromRevision.every((l) => !!l.allocation_id)) lines = fromRevision;
  }
  if (!lines) lines = (await loadSnapshot(sb, tenantId, proposalId))?.snapshot.lines ?? [];

  const rows = allocationRowsFromLines(lines, { tenantId, contractId, proposalId, revisionId });
  if (rows.length > 0) {
    const { error } = await sb.from("contract_allocations").upsert(rows, { onConflict: "contract_id,allocation_id", ignoreDuplicates: true });
    if (error) return isMissingMigration(error) ? { ok: false, skipped: "migration_missing" } : { ok: false, skipped: "error", error: error.message };
  }
  if (revisionId) {
    const { error } = await sb.from("contracts").update({ revision_id: revisionId }).eq("id", contractId).eq("tenant_id", tenantId);
    if (error && !isMissingMigration(error)) return { ok: false, skipped: "error", error: error.message };
  }
  return { ok: true, allocations: rows.length, revisionId };
}

/** Adds one delivery task per allocation to the proposal's checklist, once each. */
export async function appendAllocationTasks(sb: Sb, tenantId: string, proposalId: string, contractId: string): Promise<{ added: number }> {
  const { data: allocs, error } = await sb
    .from("contract_allocations")
    .select("allocation_id, inventory_name, quantity, unit")
    .eq("contract_id", contractId)
    .eq("tenant_id", tenantId);
  if (error || !allocs?.length) return { added: 0 };

  const { data: proposal } = await sb.from("proposals").select("content").eq("id", proposalId).eq("tenant_id", tenantId).maybeSingle();
  if (!proposal) return { added: 0 };
  const content = ((proposal as { content: Record<string, unknown> | null }).content ?? {}) as Record<string, unknown>;
  const existing = ((content.fulfillment_tasks as DeliveryTask[] | undefined) ?? []) as DeliveryTask[];

  const fresh = missingAllocationTasks(existing, allocs, randomUUID);
  if (fresh.length === 0) return { added: 0 };
  await sb
    .from("proposals")
    .update({ content: { ...content, fulfillment_tasks: [...existing, ...fresh] } })
    .eq("id", proposalId)
    .eq("tenant_id", tenantId);
  return { added: fresh.length };
}

/** Copies an earlier contract's allocations onto a renewal proposal as lines that point back at them. */
export async function carryAllocationsToRenewal(sb: Sb, tenantId: string, priorContractId: string, newProposalId: string): Promise<{ carried: number }> {
  const { data: contract } = await sb.from("contracts").select("contract_number").eq("id", priorContractId).eq("tenant_id", tenantId).maybeSingle();
  const { data: allocs, error } = await sb.from("contract_allocations").select("*").eq("contract_id", priorContractId).eq("tenant_id", tenantId);
  if (error || !allocs?.length) return { carried: 0 };

  const { data: already } = await sb
    .from("proposal_inventory_items")
    .select("renewed_from_allocation_id")
    .eq("proposal_id", newProposalId)
    .not("renewed_from_allocation_id", "is", null);
  const have = new Set(((already ?? []) as Array<{ renewed_from_allocation_id: string }>).map((r) => r.renewed_from_allocation_id));

  const lines = (allocs as Array<Record<string, any>>)
    .filter((a) => !have.has(a.allocation_id))
    .map((a) =>
      renewalLineFromAllocation(
        { allocation_id: a.allocation_id, inventory_id: a.inventory_id, quantity: a.quantity, unit: a.unit, unit_price: a.unit_price === null ? null : Number(a.unit_price), currency: a.currency },
        { tenantId, proposalId: newProposalId, priorContractNumber: (contract as { contract_number?: string } | null)?.contract_number ?? null },
      ),
    );
  if (lines.length === 0) return { carried: 0 };
  const { error: insErr } = await sb.from("proposal_inventory_items").insert(lines);
  return insErr ? { carried: 0 } : { carried: lines.length };
}

/** Everything that has happened to one allocation, from the quote line to its renewals. */
export async function traceAllocation(sb: Sb, tenantId: string, allocationId: string) {
  const { data: line } = await sb
    .from("proposal_inventory_items")
    .select("*, inventory_items(name)")
    .eq("id", allocationId)
    .eq("tenant_id", tenantId)
    .maybeSingle();

  const { data: contractRows } = await sb
    .from("contract_allocations")
    .select("*, contracts(id, contract_number, title, status, start_date, end_date, revision_id)")
    .eq("allocation_id", allocationId)
    .eq("tenant_id", tenantId);

  const proposalId: string | null =
    (line as { proposal_id?: string } | null)?.proposal_id ?? (contractRows as Array<{ proposal_id: string | null }> | null)?.[0]?.proposal_id ?? null;

  let revisions: Array<{ revision_id: string; revision_number: number; checksum: string; line: unknown }> = [];
  let tasks: DeliveryTask[] = [];
  if (proposalId) {
    const { data: revs } = await sb
      .from("proposal_revisions")
      .select("id, revision_number, checksum, lines")
      .eq("proposal_id", proposalId)
      .order("revision_number", { ascending: true });
    revisions = ((revs ?? []) as Array<{ id: string; revision_number: number; checksum: string; lines: QuoteLine[] }>)
      .map((r) => ({ revision_id: r.id, revision_number: r.revision_number, checksum: r.checksum, line: (r.lines ?? []).find((l) => l.allocation_id === allocationId) ?? null }))
      .filter((r) => r.line);

    const { data: proposal } = await sb.from("proposals").select("content").eq("id", proposalId).eq("tenant_id", tenantId).maybeSingle();
    const all = (((proposal as { content?: { fulfillment_tasks?: DeliveryTask[] } } | null)?.content?.fulfillment_tasks) ?? []) as DeliveryTask[];
    tasks = all.filter((t) => t.allocation_id === allocationId);
  }

  const { data: renewalLines } = await sb
    .from("proposal_inventory_items")
    .select("id, proposal_id, quantity, scope, price_agreed, proposals(id, title, status)")
    .eq("renewed_from_allocation_id", allocationId)
    .eq("tenant_id", tenantId);

  return {
    allocation_id: allocationId,
    quote_line: line ?? null,
    revisions,
    contracts: ((contractRows ?? []) as Array<Record<string, any>>).map((c) => ({ allocation: { ...c, contracts: undefined }, contract: c.contracts ?? null })),
    delivery_tasks: tasks,
    renewals: renewalLines ?? [],
  };
}
