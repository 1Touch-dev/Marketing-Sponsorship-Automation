/**
 * One-off applier for a single new migration file, bypassing the generic
 * run-migrations.mjs (which tries to re-run older, already-applied and in
 * some cases destructive migrations against this live DB).
 *
 * Usage: node scripts/apply-single-migration.mjs 0041_presentation_html_templates.sql
 */
import { createRequire } from "module";
import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { config } from "./load-env.mjs";

const require = createRequire(import.meta.url);
const __dir = dirname(fileURLToPath(import.meta.url));
const pgPath = join(__dir, "..", "frontend", "node_modules", "pg");
const { Client } = require(pgPath);

const migrationsDir = join(__dir, "..", "supabase", "migrations");
const file = process.argv[2];
if (!file) {
  console.error("Usage: node scripts/apply-single-migration.mjs <filename>.sql");
  process.exit(1);
}

function buildDbUrl() {
  const pass = process.env.SUPABASE_DB_PASSWORD;
  const ref = (process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "")
    .replace("https://", "")
    .replace(".supabase.co", "");
  if (!pass || !ref) throw new Error("SUPABASE_DB_PASSWORD or SUPABASE_URL not set");
  return `postgresql://postgres.${ref}:${encodeURIComponent(pass)}@aws-1-us-east-1.pooler.supabase.com:5432/postgres`;
}

async function run() {
  const dbUrl = process.env.SUPABASE_DB_URL || buildDbUrl();
  console.log("Connecting to Supabase Postgres…");
  const client = new Client({ connectionString: dbUrl, ssl: { rejectUnauthorized: false } });
  await client.connect();
  console.log("Connected.");

  await client.query(`
    create table if not exists public._migrations (
      filename text primary key,
      applied_at timestamptz not null default now()
    );
  `);

  const { rows: applied } = await client.query(
    "select filename from public._migrations where filename = $1",
    [file]
  );
  if (applied.length > 0) {
    console.log(`SKIP  ${file} (already applied)`);
    await client.end();
    return;
  }

  const sql = readFileSync(join(migrationsDir, file), "utf-8");
  console.log(`RUN   ${file}…`);
  try {
    await client.query("BEGIN");
    await client.query(sql);
    await client.query("INSERT INTO public._migrations (filename) VALUES ($1)", [file]);
    await client.query("COMMIT");
    console.log(`DONE  ${file}`);
  } catch (err) {
    await client.query("ROLLBACK");
    console.error(`FAIL  ${file}: ${err.message}`);
    throw err;
  } finally {
    await client.end();
  }
}

run().catch((e) => {
  console.error("Migration failed:", e.message);
  process.exit(1);
});
