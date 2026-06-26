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
  let data: unknown[] = [];
  try {
    const res = await sb
      .from("contracts")
      .select("contract_number, title, status, deal_type, total_value_brl, start_date, end_date, companies(company_name)")
      .order("created_at", { ascending: false });
    data = res.data ?? [];
  } catch { data = []; }

  const rows = (data as Array<Record<string, unknown> & { companies?: { company_name?: string } | null }>).map(c => ({
    contract_number: c.contract_number,
    company: (c.companies as { company_name?: string } | null)?.company_name ?? "",
    title: c.title,
    status: c.status,
    deal_type: c.deal_type,
    total_value_brl: c.total_value_brl,
    start_date: c.start_date,
    end_date: c.end_date,
  }));

  const csv = toCSV(rows as Record<string, unknown>[]);
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv",
      "Content-Disposition": `attachment; filename="contracts-${new Date().toISOString().split("T")[0]}.csv"`,
    },
  });
}
