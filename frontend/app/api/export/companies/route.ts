import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";

function toCSV(rows: Record<string, unknown>[]): string {
  if (!rows.length) return "";
  const headers = Object.keys(rows[0]);
  const lines = [headers.join(","), ...rows.map(row =>
    headers.map(h => {
      const v = row[h] ?? "";
      const s = String(v).replace(/"/g, '""');
      return s.includes(",") || s.includes("\n") || s.includes('"') ? `"${s}"` : s;
    }).join(",")
  )];
  return lines.join("\n");
}

export async function GET() {
  const sb = supabaseAdmin();
  const { data } = await sb
    .from("companies")
    .select("company_name, industry, status, pipeline_stage, country, company_size, business_type, website, created_at")
    .order("company_name");

  const csv = toCSV((data ?? []) as Record<string, unknown>[]);
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv",
      "Content-Disposition": `attachment; filename="companies-${new Date().toISOString().split("T")[0]}.csv"`,
    },
  });
}
