import { supabaseAdmin } from "@/lib/supabase/server";

/**
 * Pattern 11 (unit economics, master_report.md Section 8 — "poor unit
 * economics", citing Homejoy/Zaplify: "price to reflect true AI-inference
 * cost per lead from day one; track cost-to-serve continuously"). Real
 * spend_ledger rows now carry entity_type='company'/entity_id for every AI
 * text-generation call tied to a specific company (proposal generation,
 * opportunity-gap, differentiators, the outreach agent) — this aggregates
 * them per company. Only counts calls made after 2026-09-15 (when entity
 * linkage was added); older spend_ledger rows have entity_id = null and are
 * invisible here, not fabricated as zero-cost.
 */
export interface CompanyCostToServe {
  has_data: boolean;
  total_usd: number;
  call_count: number;
  by_category: Array<{ category: string; usd: number; calls: number }>;
  first_call_at: string | null;
  last_call_at: string | null;
}

const EMPTY: CompanyCostToServe = {
  has_data: false,
  total_usd: 0,
  call_count: 0,
  by_category: [],
  first_call_at: null,
  last_call_at: null,
};

export async function getCompanyCostToServe(companyId: string): Promise<CompanyCostToServe> {
  const sb = supabaseAdmin();
  const { data } = await sb
    .from("spend_ledger" as "companies")
    .select("amount_usd, category, created_at")
    .eq("entity_type" as "id", "company" as unknown as string)
    .eq("entity_id" as "id", companyId as unknown as string)
    .order("created_at" as "id", { ascending: true });

  const rows = (data ?? []) as unknown as Array<{ amount_usd: number; category: string; created_at: string }>;
  if (rows.length === 0) return EMPTY;

  const byCategory = new Map<string, { usd: number; calls: number }>();
  let total = 0;
  for (const row of rows) {
    total += Number(row.amount_usd);
    const existing = byCategory.get(row.category) ?? { usd: 0, calls: 0 };
    existing.usd += Number(row.amount_usd);
    existing.calls += 1;
    byCategory.set(row.category, existing);
  }

  return {
    has_data: true,
    total_usd: total,
    call_count: rows.length,
    by_category: Array.from(byCategory.entries()).map(([category, v]) => ({ category, ...v })),
    first_call_at: rows[0].created_at,
    last_call_at: rows[rows.length - 1].created_at,
  };
}
