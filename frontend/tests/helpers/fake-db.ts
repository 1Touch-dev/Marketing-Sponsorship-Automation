// An in-memory stand-in for the Supabase client that applies eq / in / is / or filters, for store tests.
export type Tables = Record<string, any[]>;
export function db(tables: Tables, opts: { missing?: string[] } = {}) {
  let n = 0;
  const calls: Array<{ op: string; table: string; row?: any }> = [];
  const from = (table: string) => {
    const filters: Array<(r: any) => boolean> = [];
    let asCount = false;
    let max = Infinity;
    const absent = (r: any, col: string) => r[col] === undefined;
    const rows = () => (tables[table] ?? []).filter((r) => filters.every((f) => f(r)));
    const gone = opts.missing?.includes(table) ? { message: `relation "public.${table}" does not exist`, code: "42P01" } : null;
    const result = () => (gone ? { data: null, error: gone } : asCount ? { data: null, count: rows().length, error: null } : { data: rows().slice(0, max), error: null });
    const c: any = {
      select: (_c?: string, o?: { count?: string; head?: boolean }) => { if (o?.count) asCount = true; return c; },
      eq: (col: string, v: any) => { filters.push((r) => absent(r, col) || r[col] === v); return c; },
      in: (col: string, vs: any[]) => { filters.push((r) => absent(r, col) || vs.includes(r[col])); return c; },
      is: (col: string, v: any) => { filters.push((r) => (r[col] ?? null) === v); return c; },
      or: (expr: string) => { const parts = expr.split(",").map((p) => p.split(".")); filters.push((r) => parts.some(([col, , v]) => r[col] === v)); return c; },
      order: () => c, limit: (m: number) => { max = m; return c; },
      maybeSingle: async () => (gone ? { data: null, error: gone } : { data: rows()[0] ?? null, error: null }),
      single: async () => ({ data: rows()[0] ?? null, error: gone }),
      then: (res: any) => res(result()),
      insert: (input: any) => {
        const list = (Array.isArray(input) ? input : [input]).map((r) => ({ id: `${table}-${++n}`, created_at: new Date().toISOString(), ...r }));
        calls.push(...list.map((row) => ({ op: "insert", table, row })));
        if (!gone) (tables[table] ??= []).push(...list);
        const i: any = { select: () => i, single: async () => ({ data: list[0], error: gone }), then: (res: any) => res({ data: list, error: gone }) };
        return i;
      },
      upsert: (input: any[], o: { onConflict: string; ignoreDuplicates: boolean }) => {
        const keys = o.onConflict.split(",");
        const fresh = input.filter((r) => !(tables[table] ?? []).some((x) => keys.every((k) => x[k] === r[k]))).map((r) => ({ id: `${table}-${++n}`, created_at: new Date().toISOString(), project_id: null, ...r }));
        calls.push(...fresh.map((row) => ({ op: "insert", table, row })));
        if (!gone) (tables[table] ??= []).push(...fresh);
        const u: any = { select: () => u, then: (res: any) => res({ data: fresh, error: gone }) };
        return u;
      },
      update: (patch: any) => {
        const u: any = {
          eq: (col: string, v: any) => { filters.push((r) => absent(r, col) || r[col] === v); return u; },
          is: (col: string, v: any) => { filters.push((r) => (r[col] ?? null) === v); return u; },
          select: () => u,
          maybeSingle: async () => { const hit = rows()[0]; if (hit) Object.assign(hit, patch); calls.push({ op: "update", table, row: patch }); return { data: hit ?? null, error: gone }; },
          then: (res: any) => { for (const r of rows()) Object.assign(r, patch); calls.push({ op: "update", table, row: patch }); res({ error: gone }); },
        };
        return u;
      },
    };
    return c;
  };
  return { from, calls, tables };
}

