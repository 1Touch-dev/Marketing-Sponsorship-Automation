import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const maxDuration = 60;

interface CsvRow {
  email: string;
  full_name?: string;
  title?: string;
  department?: string;
  seniority?: string;
  phone?: string;
  linkedin_url?: string;
  source?: string;
  confidence?: string;
  notes?: string;
  company_name?: string;
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

    if (row.email) {
      rows.push({
        email: row.email,
        full_name: row.full_name || row.name || undefined,
        title: row.title || row.job_title || undefined,
        department: row.department || undefined,
        seniority: row.seniority || undefined,
        phone: row.phone || undefined,
        linkedin_url: row.linkedin_url || row.linkedin || undefined,
        source: row.source || "csv",
        confidence: row.confidence || undefined,
        notes: row.notes || undefined,
        company_name: row.company_name || row.company || undefined,
      });
    }
  }
  return rows;
}

/**
 * POST /api/contacts/bulk-import
 * Accepts a CSV file with contacts. If company_name is provided,
 * matches or creates the company automatically.
 */
export async function POST(req: Request) {
  try {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;

    if (!file) return NextResponse.json({ error: "No file provided" }, { status: 400 });
    if (!file.name.endsWith(".csv")) return NextResponse.json({ error: "File must be a .csv" }, { status: 400 });

    const text = await file.text();
    const rows = parseCsv(text);

    if (rows.length === 0) {
      return NextResponse.json(
        { error: "CSV is empty or has no valid rows. Required header: email. Optional: full_name,title,department,seniority,phone,linkedin_url,company_name,notes" },
        { status: 400 },
      );
    }

    if (rows.length > 500) {
      return NextResponse.json({ error: "Maximum 500 rows per import" }, { status: 400 });
    }

    const sb = supabaseAdmin();

    // Fetch all companies for name-matching
    const { data: companies } = await sb.from("companies").select("id, company_name").limit(5000);
    const companyMap = new Map((companies ?? []).map((c) => [c.company_name.toLowerCase().trim(), c.id]));

    let imported = 0;
    const errors: string[] = [];

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const rowLabel = `Row ${i + 2} (${row.email})`;

      if (!row.email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(row.email)) {
        errors.push(`${rowLabel}: invalid email`);
        continue;
      }

      let company_id: string | null = null;

      if (row.company_name) {
        const key = row.company_name.toLowerCase().trim();
        if (companyMap.has(key)) {
          company_id = companyMap.get(key)!;
        } else {
          // Auto-create company
          const { data: newCo } = await sb
            .from("companies")
            .insert({ company_name: row.company_name, status: "prospect", country: "BR" })
            .select("id")
            .single();
          if (newCo) {
            company_id = newCo.id;
            companyMap.set(key, newCo.id);
          }
        }
      }

      if (!company_id) {
        errors.push(`${rowLabel}: no company matched — skipped. Add company_name column or create company first.`);
        continue;
      }

      const confidence = row.confidence ? parseInt(row.confidence, 10) : null;
      const seniority = ["analyst", "manager", "director", "vp", "c_level"].includes(row.seniority ?? "")
        ? row.seniority
        : null;

      const { error: insErr } = await sb.from("contacts").insert({
        company_id,
        email: row.email,
        full_name: row.full_name ?? null,
        title: row.title ?? null,
        department: row.department ?? null,
        seniority: seniority ?? null,
        phone: row.phone ?? null,
        linkedin_url: row.linkedin_url ?? null,
        source: row.source ?? "csv",
        confidence: confidence && !isNaN(confidence) ? confidence : null,
        notes: row.notes ?? null,
      });

      if (insErr) {
        if (insErr.message.includes("duplicate") || insErr.code === "23505") {
          errors.push(`${rowLabel}: duplicate email — skipped`);
        } else {
          errors.push(`${rowLabel}: ${insErr.message}`);
        }
      } else {
        imported++;
      }
    }

    return NextResponse.json({ imported, errors, total: rows.length });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Unknown error" }, { status: 500 });
  }
}

/** GET /api/contacts/bulk-import — return CSV template */
export async function GET() {
  const csv = [
    "email,full_name,title,department,seniority,phone,linkedin_url,company_name,notes",
    "maria.silva@empresa.com.br,Maria Silva,Marketing Director,Marketing,director,+55 41 99999-0001,https://linkedin.com/in/maria,Empresa Exemplo,Key decision maker",
    "joao.souza@outra.com,João Souza,CEO,Executive,c_level,+55 11 98888-0002,,Outra Empresa,CEO direct contact",
  ].join("\n");

  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv",
      "Content-Disposition": 'attachment; filename="contacts_import_template.csv"',
    },
  });
}
