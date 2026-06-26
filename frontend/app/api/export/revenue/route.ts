import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";

function toCSV(rows: Record<string, unknown>[]): string {
  if (!rows.length) return "No data";
  const headers = Object.keys(rows[0]);
  const lines = [headers.join(","), ...rows.map(row =>
    headers.map(h => { const v = String(row[h] ?? "").replace(/"/g, '""'); return v.includes(",") || v.includes("\n") ? `"${v}"` : v; }).join(",")
  )];
  return lines.join("\n");
}

export async function GET() {
  const sb = supabaseAdmin();

  let contracts: Record<string, unknown>[] = [];
  try {
    const { data } = await sb
      .from("contracts")
      .select("contract_number, title, status, deal_type, total_value_brl, start_date, end_date, created_at, companies(company_name, industry)")
      .order("created_at", { ascending: false });
    contracts = (data ?? []).map((c) => {
      const co = c as {
        contract_number: unknown; title: unknown; status: unknown; deal_type: unknown;
        total_value_brl: unknown; start_date: unknown; end_date: unknown; created_at: unknown;
        companies: { company_name?: string; industry?: string } | { company_name?: string; industry?: string }[] | null;
      };
      const company = Array.isArray(co.companies) ? co.companies[0] : co.companies;
      return {
        contract_number: co.contract_number,
        company: company?.company_name ?? "",
        industry: company?.industry ?? "",
        title: co.title,
        status: co.status,
        deal_type: co.deal_type,
        total_value_brl: co.total_value_brl,
        start_date: co.start_date,
        end_date: co.end_date,
        created_at: co.created_at,
      };
    });
  } catch { contracts = []; }

  const csv = toCSV(contracts);
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv",
      "Content-Disposition": `attachment; filename="revenue-${new Date().toISOString().split("T")[0]}.csv"`,
    },
  });
}
