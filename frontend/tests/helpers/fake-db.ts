// An in-memory stand-in for the Supabase client that applies eq / in / is / or filters, for store tests.
export type Tables = Record<string, any[]>;
export function db(tables: Tables, opts: { missing?: string[]; unique?: Record<string, string[]>; rpc?: Record<string, (args: any) => { data: any; error: any }> } = {}) {
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
      not: (col: string, op: string, v: any) => { filters.push((r) => (op === "is" ? (r[col] ?? null) !== v : true)); return c; },
      gte: (col: string, v: any) => { filters.push((r) => absent(r, col) || r[col] >= v); return c; },
      lte: (col: string, v: any) => { filters.push((r) => absent(r, col) || r[col] <= v); return c; },
      or: (expr: string) => { const parts = expr.split(",").map((p) => p.split(".")); filters.push((r) => parts.some(([col, , v]) => r[col] === v)); return c; },
      order: () => c, limit: (m: number) => { max = m; return c; },
      maybeSingle: async () => (gone ? { data: null, error: gone } : { data: rows()[0] ?? null, error: null }),
      single: async () => ({ data: rows()[0] ?? null, error: gone }),
      then: (res: any) => res(result()),
      insert: (input: any) => {
        const list = (Array.isArray(input) ? input : [input]).map((r) => ({ id: `${table}-${++n}`, created_at: new Date().toISOString(), ...r }));
        const uq = opts.unique?.[table];
        if (uq && list.some((r) => (tables[table] ?? []).some((x) => uq.every((k) => x[k] === r[k])))) {
          const dup = { code: "23505", message: `duplicate key value violates unique constraint on ${table}` };
          const e: any = { select: () => e, single: async () => ({ data: null, error: dup }), then: (res: any) => res({ data: null, error: dup }) };
          return e;
        }
        calls.push(...list.map((row) => ({ op: "insert", table, row })));
        if (!gone) (tables[table] ??= []).push(...list);
        const i: any = { select: () => i, single: async () => ({ data: list[0], error: gone }), then: (res: any) => res({ data: list, error: gone }) };
        return i;
      },
      upsert: (inputRaw: any, o: { onConflict: string; ignoreDuplicates?: boolean }) => {
        const input = Array.isArray(inputRaw) ? inputRaw : [inputRaw];
        const keys = o.onConflict.split(",");
        const same = (x: any, r: any) => keys.every((k) => x[k] === r[k]);
        if (!o.ignoreDuplicates && !gone) for (const r of input) { const hit = (tables[table] ?? []).find((x) => same(x, r)); if (hit) Object.assign(hit, r); }
        const fresh = input.filter((r) => !(tables[table] ?? []).some((x) => same(x, r))).map((r) => ({ id: `${table}-${++n}`, created_at: new Date().toISOString(), project_id: null, ...r }));
        calls.push(...fresh.map((row) => ({ op: "insert", table, row })));
        if (!gone) (tables[table] ??= []).push(...fresh);
        const u: any = { select: () => u, then: (res: any) => res({ data: fresh, error: gone }) };
        return u;
      },
      delete: () => {
        const d: any = {
          eq: (col: string, v: any) => { filters.push((r) => absent(r, col) || r[col] === v); return d; },
          in: (col: string, vs: any[]) => { filters.push((r) => absent(r, col) || vs.includes(r[col])); return d; },
          is: (col: string, v: any) => { filters.push((r) => (r[col] ?? null) === v); return d; },
          then: (res: any) => {
            const gone = rows();
            tables[table] = (tables[table] ?? []).filter((r) => !gone.includes(r));
            calls.push({ op: "delete", table });
            res({ error: null });
          },
        };
        return d;
      },
      update: (patch: any) => {
        const u: any = {
          eq: (col: string, v: any) => { filters.push((r) => absent(r, col) || r[col] === v); return u; },
          is: (col: string, v: any) => { filters.push((r) => (r[col] ?? null) === v); return u; },
          select: () => u,
          maybeSingle: async () => { const hit = rows()[0]; if (hit) Object.assign(hit, patch); calls.push({ op: "update", table, row: patch }); return { data: hit ?? null, error: gone }; },
          then: (res: any) => { const hit = rows(); for (const r of hit) Object.assign(r, patch); calls.push({ op: "update", table, row: patch }); res({ data: hit, error: gone }); },
        };
        return u;
      },
    };
    return c;
  };
  const rpc = async (name: string, args: unknown) => {
    calls.push({ op: "rpc", table: name, row: args });
    const h = opts.rpc?.[name];
    return h ? h(args) : { data: {}, error: null };
  };
  return { from, rpc, calls, tables };
}

