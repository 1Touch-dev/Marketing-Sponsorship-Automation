import { commitLines, releaseLines, isCapacityLimited, type Conflict, type InventoryRow, type InventoryStore, type Line } from "./reservation";

type Sb = any;

const ROW_COLUMNS = "id, name, availability, total_quantity, quantity_sold, quantity_reserved, unit, unit_type";

export function supabaseInventoryStore(sb: Sb, tenantId: string): InventoryStore {
  return {
    async getRow(id) {
      const { data } = await sb.from("inventory_items").select(ROW_COLUMNS).eq("id", id).eq("tenant_id", tenantId).maybeSingle();
      return (data as InventoryRow | null) ?? null;
    },
    async casSold(id, expected, next) {
      let q = sb.from("inventory_items").update({ quantity_sold: next }).eq("id", id).eq("tenant_id", tenantId);
      q = expected === null ? q.is("quantity_sold", null) : q.eq("quantity_sold", expected);
      const { data, error } = await q.select("id");
      if (error) throw new Error(error.message);
      return Array.isArray(data) && data.length === 1;
    },
  };
}

async function proposalLines(sb: Sb, tenantId: string, proposalId: string): Promise<Line[]> {
  const { data } = await sb
    .from("proposal_inventory_items")
    .select("inventory_id, quantity")
    .eq("proposal_id", proposalId)
    .eq("tenant_id", tenantId);
  return ((data ?? []) as Array<{ inventory_id: string; quantity: number | null }>).map((r) => ({
    inventory_id: r.inventory_id,
    quantity: r.quantity ?? 1,
  }));
}

export type ActivationResult =
  | { ok: true; alreadyActive: boolean }
  | { ok: false; notFound: true }
  | { ok: false; conflict: Conflict };

/**
 * Moves a proposal to active_contract and commits its inventory units. The
 * status change is claimed first with a conditional update, so only one of
 * several concurrent requests commits units; the claim is reverted if the
 * units cannot be committed.
 */
export async function activateProposalUnits(sb: Sb, tenantId: string, proposalId: string): Promise<ActivationResult> {
  const { data: current } = await sb.from("proposals").select("status").eq("id", proposalId).eq("tenant_id", tenantId).maybeSingle();
  if (!current) return { ok: false, notFound: true };
  const previousStatus = (current as { status: string }).status;
  if (previousStatus === "active_contract") return { ok: true, alreadyActive: true };

  const { data: claimed } = await sb
    .from("proposals")
    .update({ status: "active_contract" })
    .eq("id", proposalId)
    .eq("tenant_id", tenantId)
    .neq("status", "active_contract")
    .select("id");
  if (!Array.isArray(claimed) || claimed.length === 0) return { ok: true, alreadyActive: true };

  const lines = await proposalLines(sb, tenantId, proposalId);
  const outcome = await commitLines(supabaseInventoryStore(sb, tenantId), lines);
  if (!outcome.ok) {
    await sb.from("proposals").update({ status: previousStatus }).eq("id", proposalId).eq("tenant_id", tenantId);
    return { ok: false, conflict: outcome.conflict };
  }
  return { ok: true, alreadyActive: false };
}

/**
 * Called when a proposal leaves active_contract (cancelled, rejected, sent
 * back). Claims the transition with a conditional update, then releases units.
 */
export async function leaveActiveContractUnits(sb: Sb, tenantId: string, proposalId: string, toStatus: string): Promise<{ released: boolean }> {
  const { data: claimed } = await sb
    .from("proposals")
    .update({ status: toStatus })
    .eq("id", proposalId)
    .eq("tenant_id", tenantId)
    .eq("status", "active_contract")
    .select("id");
  if (!Array.isArray(claimed) || claimed.length === 0) return { released: false };

  const lines = await proposalLines(sb, tenantId, proposalId);
  await releaseLines(supabaseInventoryStore(sb, tenantId), lines);
  return { released: true };
}

export type ReconcileRow = { inventory_id: string; name: string; recorded: number; expected: number };

/** Compares quantity_sold against the units held by active_contract proposals. */
export async function reconcileSoldCounters(sb: Sb, tenantId: string, apply: boolean): Promise<ReconcileRow[]> {
  const { data: contracted } = await sb.from("proposals").select("id").eq("tenant_id", tenantId).eq("status", "active_contract");
  const ids = ((contracted ?? []) as Array<{ id: string }>).map((p) => p.id);

  const expected = new Map<string, number>();
  if (ids.length > 0) {
    const { data: lines } = await sb.from("proposal_inventory_items").select("inventory_id, quantity").eq("tenant_id", tenantId).in("proposal_id", ids);
    for (const l of (lines ?? []) as Array<{ inventory_id: string; quantity: number | null }>) {
      expected.set(l.inventory_id, (expected.get(l.inventory_id) ?? 0) + (l.quantity ?? 1));
    }
  }

  const { data: items } = await sb.from("inventory_items").select(ROW_COLUMNS).eq("tenant_id", tenantId).eq("status", "active");
  const diffs: ReconcileRow[] = [];
  for (const row of (items ?? []) as InventoryRow[]) {
    const want = isCapacityLimited(row) ? expected.get(row.id) ?? 0 : 0;
    const have = Number(row.quantity_sold ?? 0);
    if (want !== have) diffs.push({ inventory_id: row.id, name: row.name ?? row.id, recorded: have, expected: want });
  }

  if (apply) {
    for (const d of diffs) {
      await sb.from("inventory_items").update({ quantity_sold: d.expected }).eq("id", d.inventory_id).eq("tenant_id", tenantId);
    }
  }
  return diffs;
}
