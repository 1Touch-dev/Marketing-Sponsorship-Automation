import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { recordAudit } from "@/lib/audit/log";
import { fetchAndStoreCompanyLogo } from "@/lib/companies/logo-enrichment";
import { requirePermission } from "@/lib/auth/server-permission";

export const runtime = "nodejs";
export const maxDuration = 60;

interface CsvRow {
  company_name: string;
  industry?: string;
  website?: string;
  country?: string;
  notes?: string;
}

interface ImportResult {
  row: number;
  company_name: string;
  status: "created" | "duplicate" | "error";
  message?: string;
  id?: string;
}

function parseCsv(text: string): CsvRow[] {
  const lines = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
  if (lines.length < 2) return [];

  const header = lines[0]
    .toLowerCase()
    .split(",")
    .map((h) => h.trim().replace(/^"|"$/g, ""));

  const rows: CsvRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    // Handle basic CSV parsing (quoted values with commas)
    const values: string[] = [];
    let current = "";
    let inQuotes = false;
    for (let c = 0; c < line.length; c++) {
      if (line[c] === '"') {
        inQuotes = !inQuotes;
      } else if (line[c] === "," && !inQuotes) {
        values.push(current.trim());
        current = "";
      } else {
        current += line[c];
      }
    }
    values.push(current.trim());

    const row: Record<string, string> = {};
    header.forEach((h, idx) => {
      row[h] = (values[idx] ?? "").replace(/^"|"$/g, "").trim();
    });

    if (row.company_name) {
      rows.push({
        company_name: row.company_name,
        industry: row.industry || undefined,
        website: row.website || undefined,
        country: row.country || "BR",
        notes: row.notes || undefined,
      });
    }
  }
  return rows;
}

function isValidUrl(url: string): boolean {
  if (!url) return true;
  // Must start with http:// or https:// to be considered valid in this context
  if (!url.startsWith("http://") && !url.startsWith("https://")) return false;
  try {
    const parsed = new URL(url);
    // Must have a real hostname (at least one dot or be localhost)
    return parsed.hostname.includes(".") || parsed.hostname === "localhost";
  } catch {
    return false;
  }
}

export async function POST(req: Request) {
  const auth = await requirePermission("create_company");
  if ("error" in auth) return auth.error;

  try {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }
    if (!file.name.endsWith(".csv")) {
      return NextResponse.json({ error: "File must be a .csv" }, { status: 400 });
    }

    const text = await file.text();
    const rows = parseCsv(text);

    if (rows.length === 0) {
      return NextResponse.json(
        { error: "CSV is empty or has no valid rows. Check headers: company_name, industry, website, country, notes" },
        { status: 400 },
      );
    }

    if (rows.length > 500) {
      return NextResponse.json({ error: "Maximum 500 rows per import" }, { status: 400 });
    }

    const sb = supabaseAdmin();

    // Fetch existing company names for duplicate detection
    const { data: existing } = await sb
      .from("companies")
      .select("company_name")
      .limit(5000);

    const existingNames = new Set(
      (existing ?? []).map((e) => e.company_name.toLowerCase().trim()),
    );

    const results: ImportResult[] = [];
    let created = 0;
    let duplicates = 0;
    let errors = 0;

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const rowNum = i + 2; // 1-indexed, skip header

      // Validate required field
      if (!row.company_name || row.company_name.length < 2) {
        results.push({
          row: rowNum,
          company_name: row.company_name || "(empty)",
          status: "error",
          message: "Company name too short (min 2 chars)",
        });
        errors++;
        continue;
      }

      // Validate website if provided
      if (row.website && !isValidUrl(row.website)) {
        results.push({
          row: rowNum,
          company_name: row.company_name,
          status: "error",
          message: `Invalid website URL: ${row.website}`,
        });
        errors++;
        continue;
      }

      // Duplicate check
      if (existingNames.has(row.company_name.toLowerCase().trim())) {
        results.push({
          row: rowNum,
          company_name: row.company_name,
          status: "duplicate",
          message: "Company already exists",
        });
        duplicates++;
        continue;
      }

      // Normalize website — keep as-is since validation already requires http(s)://
      const website = row.website ?? null;

      // Insert
      const { data: inserted, error } = await sb
        .from("companies")
        .insert({
          company_name: row.company_name,
          industry: row.industry ?? null,
          website,
          country: row.country ?? "BR",
          notes: row.notes ?? null,
          status: "prospect",
        })
        .select("id")
        .single();

      if (error) {
        results.push({
          row: rowNum,
          company_name: row.company_name,
          status: "error",
          message: error.message,
        });
        errors++;
      } else {
        existingNames.add(row.company_name.toLowerCase().trim()); // prevent intra-batch duplicates
        results.push({
          row: rowNum,
          company_name: row.company_name,
          status: "created",
          id: inserted.id,
        });
        created++;
        // Fire-and-forget logo scrape — don't block the CSV import loop on network I/O.
        if (website) {
          void fetchAndStoreCompanyLogo({
            companyId: inserted.id,
            website,
            companyName: row.company_name,
          }).catch(() => {});
        }
      }
    }

    // Audit log for the bulk import (entity_id must be null or UUID — use null for bulk)
    await recordAudit({
      entity_type: "company",
      entity_id: null,
      action: "company.bulk_import",
      metadata: {
        total_rows: rows.length,
        created,
        duplicates,
        errors,
        imported_via: "csv",
      },
    });

    return NextResponse.json({
      summary: {
        total: rows.length,
        created,
        duplicates,
        errors,
      },
      results,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function GET() {
  // Return CSV template
  const csv = [
    "company_name,industry,website,country,notes",
    "Example Company,Technology,https://example.com,BR,Notes about the company",
    "Outro Exemplo,FMCG / Food & Beverage,https://outro.com.br,BR,",
  ].join("\n");

  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv",
      "Content-Disposition": 'attachment; filename="companies_template.csv"',
    },
  });
}
