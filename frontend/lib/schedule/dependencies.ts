import { plannedDependencies, type Edge } from "./model";

type Sb = any;

export interface DependencyRow {
  id: string; contract_id: string; obligation_id: string; predecessor_id: string; basis: "standard" | "manual"; created_by: string; created_at: string;
  removed_at: string | null; removed_by: string | null; removed_reason: string | null;
}

/** The live dependencies of one contract (or of one obligation, either side). Empty before migration 0065. */
export async function loadEdges(sb: Sb, tenantId: string, f: { contractId?: string; obligationId?: string }): Promise<DependencyRow[]> {
  let q = sb.from("obligation_dependencies").select("id, contract_id, obligation_id, predecessor_id, basis, created_by, created_at, removed_at, removed_by, removed_reason").eq("tenant_id", tenantId).is("removed_at", null);
  if (f.contractId) q = q.eq("contract_id", f.contractId);
  if (f.obligationId) q = q.or(`obligation_id.eq.${f.obligationId},predecessor_id.eq.${f.obligationId}`);
  const { data, error } = await q;
  return error ? [] : ((data ?? []) as DependencyRow[]);
}

export const asEdges = (rows: Array<Pick<DependencyRow, "obligation_id" | "predecessor_id">>): Edge[] => rows.map((r) => ({ obligation_id: r.obligation_id, predecessor_id: r.predecessor_id }));

/**
 * Sets up the standard order of work for a contract's obligations, once each. Safe to run again:
 * a pair that already has a live dependency is skipped. A missing table is not an error, so the
 * handoff keeps working before migration 0065 is applied.
 */
export async function ensureDefaultDependencies(sb: Sb, tenantId: string, contractId: string, actor: string): Promise<{ created: number }> {
  const { data: obs, error } = await sb.from("obligations").select("id, source_key").eq("tenant_id", tenantId).eq("contract_id", contractId);
  if (error || !obs?.length) return { created: 0 };
  const idOf = new Map((obs as Array<{ id: string; source_key: string }>).map((o) => [o.source_key, o.id]));
  const planned = plannedDependencies([...idOf.keys()]);
  if (planned.length === 0) return { created: 0 };

  const have = await loadEdges(sb, tenantId, { contractId });
  const key = (a: string, b: string) => `${a}>${b}`;
  const existing = new Set(have.map((e) => key(e.obligation_id, e.predecessor_id)));
  const rows = planned
    .map((p) => ({ obligation_id: idOf.get(p.successor)!, predecessor_id: idOf.get(p.predecessor)! }))
    .filter((r) => !existing.has(key(r.obligation_id, r.predecessor_id)))
    .map((r) => ({ tenant_id: tenantId, contract_id: contractId, ...r, basis: "standard", created_by: actor }));
  if (rows.length === 0) return { created: 0 };
  const { error: insErr } = await sb.from("obligation_dependencies").insert(rows);
  return insErr ? { created: 0 } : { created: rows.length };
}
