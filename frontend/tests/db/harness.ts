import fs from "node:fs";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";

const root = path.resolve(__dirname, "../../..");

/** Every migration the platform depends on, in order: what production has. Tests of a later migration build on all of them. */
export const ALL_MIGRATIONS = ["0069_identity_tombstones_idempotency.sql", "0070_agent_governance.sql", "0071_tombstones_full_undo.sql", "0072_langgraph_runtime.sql"];

/** A fresh in-memory Postgres with the stand-in base schema, plus the named migrations from supabase/migrations applied in order. */
export async function freshDb(migrations: string[] = [], opts: { seed?: string } = {}): Promise<PGlite> {
  const db = new PGlite();
  await db.exec(fs.readFileSync(path.join(__dirname, "base-schema.sql"), "utf8"));
  if (opts.seed) await db.exec(opts.seed);
  for (const m of migrations) await db.exec(fs.readFileSync(path.join(root, "supabase/migrations", m), "utf8"));
  return db;
}

/** Runs a statement that should be refused and returns the database's message; fails the test if it was allowed. */
export async function refusal(db: PGlite, sql: string, params: unknown[] = []): Promise<string> {
  try {
    await db.query(sql, params);
  } catch (e) {
    return e instanceof Error ? e.message : String(e);
  }
  throw new Error(`expected the database to refuse: ${sql}`);
}
