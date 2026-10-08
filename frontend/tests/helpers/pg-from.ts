import type { PGlite } from "@electric-sql/pglite";
import { pgRpc } from "./pg-rpc";

type Filter = { sql: (n: number) => string; value?: unknown; has: boolean; multi?: number };

/**
 * A small stand-in for supabase-js over a real Postgres engine: select / insert / update / delete with the common
 * filters, errors shaped like PostgREST's. Enough for the stores to run against actual tables and triggers.
 */
export function pgClient(db: PGlite, hooks: Parameters<typeof pgRpc>[1] = {}) {
  const asError = (e: unknown) => {
    const err = e as { message?: string; code?: string };
    const msg = err.message ?? String(e);
    return { message: msg, code: /does not exist/.test(msg) && /relation/.test(msg) ? "42P01" : err.code };
  };
  const param = (v: unknown) => (v !== null && typeof v === "object" && !Array.isArray(v) ? JSON.stringify(v) : v);

  function from(table: string) {
    const filters: Filter[] = [];
    let cols = "*";
    let count = false;
    let head = false;
    const orderBy: string[] = [];
    let ignoreDup = false;
    let max: number | null = null;
    let op: "select" | "insert" | "update" | "delete" = "select";
    let payload: any = null;
    let returning = false;
    let single: "none" | "maybe" | "one" = "none";
    const b: any = {};
    const add = (col: string, sql: (n: number) => string, value?: unknown, has = true) => { filters.push({ sql, value, has }); return b; };
    // a PostgREST JSON path such as result->>action_id
    const ref = (c: string) => (c.includes("->>") ? `("${c.split("->>")[0]}"->>'${c.split("->>")[1].replace(/'/g, "")}')` : `"${c}"`);
    b.select = (c?: string, o?: { count?: string; head?: boolean }) => { if (op === "select") { cols = c ?? "*"; } returning = true; if (o?.count) count = true; if (o?.head) head = true; if (c && op !== "select") cols = c; return b; };
    b.eq = (c: string, v: unknown) => add(c, (n) => `${ref(c)} = $${n}`, v);
    b.neq = (c: string, v: unknown) => add(c, (n) => `"${c}" <> $${n}`, v);
    b.gt = (c: string, v: unknown) => add(c, (n) => `"${c}" > $${n}`, v);
    b.gte = (c: string, v: unknown) => add(c, (n) => `"${c}" >= $${n}`, v);
    b.lt = (c: string, v: unknown) => add(c, (n) => `"${c}" < $${n}`, v);
    b.lte = (c: string, v: unknown) => add(c, (n) => `"${c}" <= $${n}`, v);
    b.ilike = (c: string, v: unknown) => add(c, (n) => `"${c}" ILIKE $${n}`, v);
    b.in = (c: string, vs: unknown[]) => add(c, (n) => `"${c}" = ANY($${n})`, vs);
    b.is = (c: string, v: unknown) => (v === null ? add(c, () => `"${c}" IS NULL`, undefined, false) : add(c, (n) => `"${c}" IS NOT DISTINCT FROM $${n}`, v));
    b.not = (c: string, o: string, v: unknown) => (o === "is" && v === null ? add(c, () => `"${c}" IS NOT NULL`, undefined, false) : add(c, (n) => `"${c}" <> $${n}`, v));
    // PostgREST's or("a.eq.1,b.eq.2"): only eq terms, which is all the stores use
    b.or = (expr: string) => {
      const terms = expr.split(",").map((t) => { const [col, op, ...rest] = t.split("."); if (op !== "eq") throw new Error(`pgClient.or supports eq only (got ${op})`); return { col, value: rest.join(".") }; });
      filters.push({ sql: (n: number) => `(${terms.map((t, i) => `"${t.col}"::text = $${n + i}`).join(" OR ")})`, value: terms.map((t) => t.value), has: true, multi: terms.length } as never);
      return b;
    };
    b.order = (c: string, o?: { ascending?: boolean }) => { orderBy.push(`"${c}" ${o?.ascending === false ? "DESC" : "ASC"}`); return b; };
    b.limit = (n: number) => { max = n; return b; };
    b.maybeSingle = () => { single = "maybe"; return run(); };
    b.single = () => { single = "one"; return run(); };
    b.insert = (rows: any) => { op = "insert"; payload = rows; return b; };
    b.update = (patch: any) => { op = "update"; payload = patch; return b; };
    b.delete = () => { op = "delete"; return b; };
    b.upsert = (rows: any, o: { onConflict: string; ignoreDuplicates?: boolean }) => { op = "insert"; payload = rows; (b as any)._conflict = o.onConflict; ignoreDup = !!o.ignoreDuplicates; return b; };
    b.then = (res: any, rej: any) => run().then(res, rej);

    async function run(): Promise<any> {
      try {
        let slot = 1 + (op === "update" ? Object.keys(payload).length : 0);
        const fv: unknown[] = [];
        const parts: string[] = [];
        for (const f of filters) {
          parts.push(f.sql(slot));
          if (f.has) { if (f.multi) { fv.push(...(f.value as unknown[])); slot += f.multi; } else { fv.push(param(f.value)); slot += 1; } }
        }
        const where = parts.length ? ` WHERE ${parts.join(" AND ")}` : "";
        let sql: string;
        let params: unknown[];
        if (op === "select") {
          if (count && head) {
            const r = await db.query(`SELECT count(*)::int AS n FROM public.${table}${where}`, fv);
            return { data: null, count: (r.rows[0] as any).n, error: null };
          }
          sql = `SELECT ${cols} FROM public.${table}${where}${orderBy.length ? ` ORDER BY ${orderBy.join(", ")}` : ""}${max ? ` LIMIT ${max}` : ""}`;
          params = fv;
        } else if (op === "insert") {
          const list = Array.isArray(payload) ? payload : [payload];
          const keys = Object.keys(list[0]);
          const values: unknown[] = [];
          const tuples = list.map((r) => `(${keys.map((k) => { values.push(param(r[k])); return `$${values.length}`; }).join(", ")})`);
          const conflict = (b as any)._conflict as string | undefined;
          sql = `INSERT INTO public.${table} (${keys.map((k) => `"${k}"`).join(", ")}) VALUES ${tuples.join(", ")}${conflict ? (ignoreDup ? ` ON CONFLICT (${conflict}) DO NOTHING` : ` ON CONFLICT (${conflict}) DO UPDATE SET ${keys.map((k) => `"${k}" = EXCLUDED."${k}"`).join(", ")}`) : ""} RETURNING ${returning ? cols : "*"}`;
          params = values;
        } else if (op === "update") {
          const keys = Object.keys(payload);
          sql = `UPDATE public.${table} SET ${keys.map((k, i) => `"${k}" = $${i + 1}`).join(", ")}${where} RETURNING ${returning ? cols : "*"}`;
          params = [...keys.map((k) => param(payload[k])), ...fv];
        } else {
          sql = `DELETE FROM public.${table}${where}`;
          params = fv;
        }
        const r = await db.query(sql, params);
        const rows = r.rows as any[];
        if (single === "none") return { data: rows, error: null };
        if (single === "maybe") return { data: rows[0] ?? null, error: null };
        return rows[0] ? { data: rows[0], error: null } : { data: null, error: { message: "no rows", code: "PGRST116" } };
      } catch (e) {
        return { data: null, error: asError(e) };
      }
    }
    return b;
  }
  return { from, rpc: pgRpc(db, hooks), auth: { admin: { getUserById: async () => ({ data: { user: null } }) } } } as any;
}
