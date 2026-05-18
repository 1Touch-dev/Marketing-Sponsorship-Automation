import { NextResponse } from "next/server";
import { readFileSync } from "fs";
import { join } from "path";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * POST /api/internal/run-migration
 * Applies a specific migration SQL file by name.
 * Called by the app on startup or via admin action.
 */
export async function POST(req: Request) {
  const { file, sql: inlineSql } = await req.json().catch(() => ({ file: null, sql: null }));

  let sql = inlineSql as string | null;

  if (!sql && file) {
    const migrationsDir = join(process.cwd(), "..", "supabase", "migrations");
    try {
      sql = readFileSync(join(migrationsDir, file), "utf-8");
    } catch {
      return NextResponse.json({ error: `Could not read migration file: ${file}` }, { status: 404 });
    }
  }

  if (!sql) {
    return NextResponse.json({ error: "Provide 'file' or 'sql' in request body" }, { status: 400 });
  }

  try {
    
    const { Client } = require("pg");
    

    const dbUrl = buildDbUrl();
    if (!dbUrl) {
      return NextResponse.json({
        error: "No DB connection URL available",
        hint: "Set SUPABASE_DB_URL or SUPABASE_DB_PASSWORD in environment",
      }, { status: 422 });
    }

    const client = new Client({ connectionString: dbUrl, ssl: { rejectUnauthorized: false } });
    await client.connect();
    await client.query(sql);
    await client.end();

    return NextResponse.json({ success: true, applied: file ?? "inline_sql" });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg, sql_preview: sql?.slice(0, 500) }, { status: 422 });
  }
}

function buildDbUrl(): string | null {
  const explicit = process.env.SUPABASE_DB_URL;
  if (explicit) return explicit;

  const pass = process.env.SUPABASE_DB_PASSWORD;
  const url = process.env.SUPABASE_URL ?? "";
  const ref = url.replace("https://", "").replace(".supabase.co", "");

  if (!pass || !ref || pass.length < 4) return null;

  const encoded = encodeURIComponent(pass);
  return `postgresql://postgres.${ref}:${encoded}@aws-0-us-east-1.pooler.supabase.com:5432/postgres`;
}
