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
    .from("proposals")
    .select("id, title, status, version, created_at, updated_at, companies(company_name, industry)")
    .order("updated_at", { ascending: false });

  type ProposalExportRow = {
    id: unknown;
    title: unknown;
    status: unknown;
    version: unknown;
    created_at: unknown;
    updated_at: unknown;
    companies: { company_name?: string; industry?: string } | { company_name?: string; industry?: string }[] | null;
  };
  const rows = (data ?? []).map((p: ProposalExportRow) => {
    const co = Array.isArray(p.companies) ? p.companies[0] : p.companies;
    return {
      id: p.id,
      title: p.title,
      status: p.status,
      version: p.version,
      company: co?.company_name ?? "",
      industry: co?.industry ?? "",
      created_at: p.created_at,
      updated_at: p.updated_at,
    };
  });

  const csv = toCSV(rows as Record<string, unknown>[]);
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv",
      "Content-Disposition": `attachment; filename="proposals-${new Date().toISOString().split("T")[0]}.csv"`,
    },
  });
}
