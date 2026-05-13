/**
 * Column guard utility.
 *
 * Before every INSERT or UPDATE, strip keys that the database doesn't recognise yet.
 * This lets the app run correctly even when migrations 0005/0006 haven't been
 * applied to the Supabase project yet.
 *
 * Usage:
 *   import { guardColumns } from "@/lib/db/column-guard";
 *   const row = guardColumns("campaigns", { title, prompt_version, ... });
 *   await sb.from("campaigns").insert(row);
 */

/** Columns that were added in migration 0006 — may not exist yet. */
const MIGRATION_0006_COLUMNS: Record<string, string[]> = {
  campaigns: ["prompt_version"],
  proposals: ["prompt_version", "status_reason"],
  emails: ["prompt_version", "status_reason"],
  followups: ["status_reason"],
  workflow_events: ["*"], // whole table may be missing
};

/** Cache of confirmed-present columns per table (populated at runtime). */
const confirmedPresent = new Map<string, boolean>();

/**
 * Returns a copy of `row` with any migration-0006 columns removed IF the
 * column is not yet confirmed to exist in the live database.
 *
 * Set `migrationApplied = true` once you have confirmed migration 0006 is live
 * to disable stripping and let all columns pass through.
 */
export function guardColumns<T extends Record<string, unknown>>(
  table: string,
  row: T,
  options?: { force?: boolean },
): Partial<T> {
  // If caller forces inclusion, trust it
  if (options?.force) return row;

  const flagKey = `migration_0006_${table}`;
  // If we've confirmed this table has the new columns, pass through
  if (confirmedPresent.get(flagKey)) return row;

  const newCols = MIGRATION_0006_COLUMNS[table];
  if (!newCols) return row;

  // Strip the new columns
  const stripped = { ...row };
  for (const col of newCols) {
    if (col === "*") {
      // whole table is new — return empty sentinel (caller should skip insert)
      return {} as Partial<T>;
    }
    delete stripped[col as keyof T];
  }
  return stripped as Partial<T>;
}

/**
 * Call this once (e.g. at startup or after migration) to mark that migration 0006
 * has been applied and column stripping is no longer needed.
 */
export function markMigration0006Applied(tables: string[] = Object.keys(MIGRATION_0006_COLUMNS)): void {
  for (const t of tables) {
    confirmedPresent.set(`migration_0006_${t}`, true);
  }
}

/**
 * Check whether a specific table/column pair is considered "safe" (present in DB).
 * Used by API routes to decide whether to include a field.
 */
export function columnExists(table: string, column: string): boolean {
  const newCols = MIGRATION_0006_COLUMNS[table];
  if (!newCols) return true; // not a new column, assume exists
  if (newCols.includes("*")) return false; // whole table missing
  const flagKey = `migration_0006_${table}`;
  if (confirmedPresent.get(flagKey)) return true;
  return !newCols.includes(column);
}
