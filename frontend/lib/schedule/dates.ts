import { effectiveDate, type ChangeRow } from "./model";

type Sb = any;

export interface DateChangeRow extends ChangeRow {
  id: string; subject_kind: "obligation" | "project"; subject_id: string; reason: string; changed_by: string; parent_change_id: string | null; impact: unknown;
}

const chunks = <T,>(xs: T[], n = 100) => Array.from({ length: Math.ceil(xs.length / n) }, (_, i) => xs.slice(i * n, i * n + n));

/**
 * Every move recorded for these records, oldest first. Returns an empty list when the table does
 * not exist yet, so reading dates keeps working before migration 0065 is applied.
 */
export async function loadDateChanges(sb: Sb, tenantId: string, kind: "obligation" | "project", ids: string[]): Promise<DateChangeRow[]> {
  const out: DateChangeRow[] = [];
  for (const part of chunks(ids)) {
    const { data, error } = await sb
      .from("date_changes").select("id, subject_kind, subject_id, field, old_value, new_value, reason, changed_by, parent_change_id, impact, created_at")
      .eq("tenant_id", tenantId).eq("subject_kind", kind).in("subject_id", part).order("created_at", { ascending: true });
    if (error) return [];
    out.push(...((data ?? []) as DateChangeRow[]));
  }
  return out;
}

/** The date in force for one field of one record. */
export function dateInForce(original: string, changes: DateChangeRow[], subjectId: string, field: string): string {
  return effectiveDate(original, changes.filter((c) => c.subject_id === subjectId && c.field === field));
}
