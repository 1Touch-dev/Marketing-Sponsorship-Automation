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
  const { data } = await sb
    .from("emails")
    .select("id, subject, status, opened_at, created_at, companies(company_name)")
    .order("created_at", { ascending: false });

  const rows = (data ?? []).map((e) => {
    const item = e as {
      subject: unknown; status: unknown; opened_at: unknown; created_at: unknown;
      companies: { company_name?: string } | { company_name?: string }[] | null;
    };
    const company = Array.isArray(item.companies) ? item.companies[0] : item.companies;
    return {
      subject: item.subject,
      company: company?.company_name ?? "",
      status: item.status,
      opened: item.opened_at ? "Yes" : "No",
      opened_at: item.opened_at ?? "",
      sent_at: item.created_at,
    };
  });

  const csv = toCSV(rows as Record<string, unknown>[]);
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv",
      "Content-Disposition": `attachment; filename="emails-${new Date().toISOString().split("T")[0]}.csv"`,
    },
  });
}
