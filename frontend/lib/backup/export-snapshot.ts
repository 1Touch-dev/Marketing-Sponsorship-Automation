import { supabaseAdmin } from "@/lib/supabase/server";
import { BACKUP_TABLES } from "./tables";

const PAGE_SIZE = 1000;

export type BackupSnapshot = {
  generated_at: string;
  tables: Record<string, unknown[]>;
  table_row_counts: Record<string, number>;
  table_errors: Record<string, string>;
};

/**
 * Full logical export of every application table via the Supabase REST
 * API (read-only SELECTs — service role key, no writes). Pattern 7
 * hardening (master_report.md Section 8): this is the payload a
 * separately-credentialed, offsite, immutable backup target should
 * receive — see scripts/run-backup.ts for the upload side.
 */
export async function exportDatabaseSnapshot(): Promise<BackupSnapshot> {
  const sb = supabaseAdmin();
  const tables: Record<string, unknown[]> = {};
  const table_row_counts: Record<string, number> = {};
  const table_errors: Record<string, string> = {};

  for (const table of BACKUP_TABLES) {
    const rows: unknown[] = [];
    let from = 0;
    try {
      for (;;) {
        const { data, error } = await (sb as ReturnType<typeof supabaseAdmin>)
          .from(table as "companies")
          .select("*")
          .range(from, from + PAGE_SIZE - 1);
        if (error) throw new Error(error.message);
        if (!data || data.length === 0) break;
        rows.push(...data);
        if (data.length < PAGE_SIZE) break;
        from += PAGE_SIZE;
      }
      tables[table] = rows;
      table_row_counts[table] = rows.length;
    } catch (err) {
      table_errors[table] = err instanceof Error ? err.message : String(err);
    }
  }

  return {
    generated_at: new Date().toISOString(),
    tables,
    table_row_counts,
    table_errors,
  };
}
