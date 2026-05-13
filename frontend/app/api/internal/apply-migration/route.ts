import { NextResponse } from "next/server";
import { readFileSync, readdirSync } from "fs";
import { join } from "path";

export const runtime = "nodejs";

/**
 * POST /api/internal/apply-migration
 * One-time endpoint to apply pending SQL migrations using the pg client.
 * Protected by MSA_INTERNAL_WEBHOOK_SECRET header.
 *
 * Body: { dry_run?: boolean }
 */
export async function POST(req: Request) {
  const secret = process.env.MSA_INTERNAL_WEBHOOK_SECRET;
  if (secret) {
    const header = req.headers.get("x-msa-webhook-secret");
    if (header !== secret) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const body = await req.json().catch(() => ({}));
  const dryRun = body.dry_run === true;

  // Read migration files
  const migrationsDir = join(process.cwd(), "..", "supabase", "migrations");
  let files: string[] = [];
  try {
    files = readdirSync(migrationsDir)
      .filter((f) => f.endsWith(".sql"))
      .sort();
  } catch {
    return NextResponse.json({ error: "Could not read migrations directory" }, { status: 500 });
  }

  // Build combined migration SQL
  const allSql = files
    .map((f) => `-- === ${f} ===\n${readFileSync(join(migrationsDir, f), "utf-8")}`)
    .join("\n\n");

  if (dryRun) {
    return NextResponse.json({
      message: "Dry run — SQL generated but not executed",
      files,
      sql_length: allSql.length,
      sql_preview: allSql.slice(0, 2000) + "...",
    });
  }

  // Try to apply via node-postgres
  let pgResult = null;
  let pgError = null;

  try {
    // Dynamic import (dynamic require) to avoid bundling pg at build time
    /* eslint-disable */
    const { Client } = require("pg");
    /* eslint-enable */
    const dbUrl = buildDbUrl();

    if (!dbUrl) {
      return NextResponse.json({
        error: "Cannot build DB connection URL. Set SUPABASE_DB_URL or SUPABASE_DB_PASSWORD in .env.",
        migration_sql: allSql,
        manual_instructions:
          "Copy the migration_sql above and run it in the Supabase Dashboard > SQL Editor.",
      });
    }

    const client = new Client({ connectionString: dbUrl, ssl: { rejectUnauthorized: false } });
    await client.connect();

    // Apply only 0005 and 0006 (0001-0004 already applied)
    const pending = files.filter((f) => f >= "0005");
    for (const file of pending) {
      const sql = readFileSync(join(migrationsDir, file), "utf-8");
      await client.query(sql);
    }

    await client.end();
    pgResult = { applied: pending };
  } catch (err) {
    pgError = err instanceof Error ? err.message : String(err);
  }

  if (pgError) {
    // Return the SQL so the user can apply manually
    const pendingSql = files
      .filter((f) => f >= "0005")
      .map((f) => readFileSync(join(migrationsDir, f), "utf-8"))
      .join("\n\n");

    return NextResponse.json(
      {
        error: pgError,
        message: "Automatic migration failed. Apply the SQL manually in Supabase Dashboard > SQL Editor.",
        migration_sql: pendingSql,
      },
      { status: 422 },
    );
  }

  return NextResponse.json({ success: true, ...pgResult });
}

export async function GET() {
  // Return the pending migration SQL for easy copy-paste
  const migrationsDir = join(process.cwd(), "..", "supabase", "migrations");
  const files = readdirSync(migrationsDir)
    .filter((f) => f.endsWith(".sql") && f >= "0005")
    .sort();

  const sql = files
    .map((f) => `-- === ${f} ===\n${readFileSync(join(migrationsDir, f), "utf-8")}`)
    .join("\n\n");

  return new Response(sql, {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}

function buildDbUrl(): string | null {
  const explicit = process.env.SUPABASE_DB_URL;
  if (explicit) return explicit;

  const pass = process.env.SUPABASE_DB_PASSWORD;
  const url = process.env.SUPABASE_URL ?? "";
  const ref = url.replace("https://", "").replace(".supabase.co", "");

  if (!pass || !ref || pass.length < 4) return null;

  const encoded = encodeURIComponent(pass);
  // Session pooler (supports DDL)
  return `postgresql://postgres.${ref}:${encoded}@aws-0-us-east-1.pooler.supabase.com:5432/postgres`;
}
