import type { PGlite } from "@electric-sql/pglite";
import type { Rpc } from "../../lib/actions/engine";

const TABLE_FUNCTIONS = new Set(["agent_assignment_for"]);

/** Calls the database functions the way supabase-js rpc() does, against a real Postgres engine. */
export function pgRpc(db: PGlite, hooks: { before?: (fn: string, args: Record<string, unknown>) => void | Promise<void> } = {}): Rpc {
  return async (fn, args = {}) => {
    try {
      await hooks.before?.(fn, args);
      const keys = Object.keys(args);
      const sql = `SELECT * FROM public.${fn}(${keys.map((k, i) => `${k} => $${i + 1}`).join(", ")})`;
      // supabase-js sends objects for json parameters; the local engine wants them as text
      const res = await db.query(sql, keys.map((k) => (args[k] !== null && typeof args[k] === "object" ? JSON.stringify(args[k]) : args[k])));
      const rows = res.rows as Array<Record<string, unknown>>;
      if (TABLE_FUNCTIONS.has(fn)) return { data: rows, error: null };
      return { data: rows[0] ? Object.values(rows[0])[0] : null, error: null };
    } catch (e) {
      return { data: null, error: { message: e instanceof Error ? e.message : String(e) } };
    }
  };
}
