/**
 * Migration runner — applies pending migrations to Supabase via direct Postgres connection.
 * Uses the Supabase session pooler (port 5432) with the postgres user.
 *
 * Usage: node scripts/run-migrations.mjs
 */
import { createRequire } from "module";
import { readFileSync, readdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { config } from "./load-env.mjs";

const require = createRequire(import.meta.url);
const __dir = dirname(fileURLToPath(import.meta.url));
// pg is installed in frontend/node_modules
const pgPath = join(__dir, "..", "frontend", "node_modules", "pg");
const { Client } = require(pgPath);

// __dir declared above already
const migrationsDir = join(__dir, "..", "supabase", "migrations");

async function run() {
  const dbUrl = process.env.SUPABASE_DB_URL || buildDbUrl();
  console.log("Connecting to Supabase Postgres…");

  const client = new Client({ connectionString: dbUrl, ssl: { rejectUnauthorized: false } });
  await client.connect();
  console.log("Connected.");

  // Ensure migrations tracking table exists
  await client.query(`
    create table if not exists public._migrations (
      filename text primary key,
      applied_at timestamptz not null default now()
    );
  `);

  const { rows: applied } = await client.query("select filename from public._migrations order by filename");
  const appliedSet = new Set(applied.map((r) => r.filename));

  const files = readdirSync(migrationsDir)
    .filter((f) => f.endsWith(".sql"))
    .sort();

  let ran = 0;
  for (const file of files) {
    if (appliedSet.has(file)) {
      console.log(`  SKIP  ${file} (already applied)`);
      continue;
    }
    const sql = readFileSync(join(migrationsDir, file), "utf-8");
    console.log(`  RUN   ${file}…`);
    try {
      await client.query("BEGIN");
      await client.query(sql);
      await client.query("INSERT INTO public._migrations (filename) VALUES ($1)", [file]);
      await client.query("COMMIT");
      console.log(`  DONE  ${file}`);
      ran++;
    } catch (err) {
      await client.query("ROLLBACK");
      console.error(`  FAIL  ${file}: ${err.message}`);
      throw err;
    }
  }

  await client.end();
  console.log(`\nMigrations complete. Ran ${ran} new migration(s).`);
}

function buildDbUrl() {
  const pass = process.env.SUPABASE_DB_PASSWORD;
  const ref = (process.env.SUPABASE_URL || "").replace("https://", "").replace(".supabase.co", "");
  if (!pass || !ref) throw new Error("SUPABASE_DB_PASSWORD or SUPABASE_URL not set");
  // Session pooler — project-ref format
  return `postgresql://postgres.${ref}:${encodeURIComponent(pass)}@aws-0-us-east-1.pooler.supabase.com:5432/postgres`;
}

run().catch((e) => {
  console.error("Migration failed:", e.message);
  process.exit(1);
});
