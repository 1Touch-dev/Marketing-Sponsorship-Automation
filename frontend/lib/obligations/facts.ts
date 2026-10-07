import { deriveStatus, isProven, type EventRow } from "./model";

type Sb = any;

/**
 * For a delivery project: how many obligations the contract has, and how many still lack proof of
 * delivery. Null when the contract has none (the project then falls back to the old checklist).
 * Kept apart from the store so the project code can read it without importing the handoff.
 */
export async function contractObligationFacts(sb: Sb, tenantId: string, contractId: string): Promise<{ total: number; unproven: number } | null> {
  const { data: rows, error } = await sb.from("obligations").select("id").eq("tenant_id", tenantId).eq("contract_id", contractId);
  if (error || !rows || rows.length === 0) return null;
  const ids = (rows as Array<{ id: string }>).map((r) => r.id);
  const events: Array<EventRow & { obligation_id: string }> = [];
  for (let i = 0; i < ids.length; i += 100) {
    const { data } = await sb.from("obligation_events").select("obligation_id, event_type, created_at").in("obligation_id", ids.slice(i, i + 100));
    events.push(...((data ?? []) as typeof events));
  }
  const unproven = ids.filter((id) => !isProven(deriveStatus(events.filter((e) => e.obligation_id === id)))).length;
  return { total: ids.length, unproven };
}
