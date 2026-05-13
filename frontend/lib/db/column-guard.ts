/**
 * Column guard utility — PASSTHROUGH MODE.
 *
 * Migrations 0005 and 0006 have been confirmed applied to the production
 * Supabase project.  All guarded columns (prompt_version, status_reason,
 * workflow_events) now exist in the schema.
 *
 * guardColumns() is kept as a no-op wrapper so call-sites do not need to be
 * changed.  It simply returns the row unchanged.
 */

export function guardColumns<T extends Record<string, unknown>>(
  _table: string,
  row: T,
  _options?: { force?: boolean },
): T {
  return row;
}

/** No-op — retained for API compatibility. */
export function markMigration0006Applied(_tables?: string[]): void {
  /* migrations confirmed applied — no action needed */
}

/** Always returns true — migrations confirmed applied. */
export function columnExists(_table: string, _column: string): boolean {
  return true;
}
