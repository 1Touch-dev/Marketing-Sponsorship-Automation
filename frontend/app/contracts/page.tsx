import Link from "next/link";
import { supabaseAdmin } from "@/lib/supabase/server";
import { PageHeader } from "@/components/shared/page-header";
import { formatDate } from "@/lib/utils";
import { FileCheck, DollarSign, AlertTriangle } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function ContractsPage() {
  const sb = supabaseAdmin();

  let contracts: Array<{
    id: string;
    contract_number: string;
    title: string;
    total_value_brl: number | null;
    deal_type: string;
    start_date: string | null;
    end_date: string | null;
    status: string;
    companies: { company_name: string } | null;
    proposals: { id: string; title: string } | null;
  }> = [];

  try {
    const { data } = await sb
      .from("contracts")
      .select("id, contract_number, title, total_value_brl, deal_type, start_date, end_date, status, companies(company_name), proposals(id, title)")
      .order("created_at", { ascending: false });
    contracts = (data ?? []) as unknown as typeof contracts;
  } catch {
    // table may not exist yet
  }

  const activeContracts = contracts.filter(c => c.status === "active");
  const totalValue = activeContracts.reduce((sum, c) => sum + (c.total_value_brl ?? 0), 0);
  const in30Days = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];
  const expiringSoon = activeContracts.filter(c => c.end_date && c.end_date <= in30Days).length;

  const STATUS_COLORS: Record<string, string> = {
    active: "bg-green-100 text-green-800",
    expired: "bg-gray-100 text-gray-600",
    cancelled: "bg-red-100 text-red-700",
    pending_signature: "bg-amber-100 text-amber-800",
  };

  return (
    <div className="space-y-6">
      <PageHeader title="Contracts" description="Active sponsorship agreements and their status." actions={
        <a
          href="/api/export/contracts"
          download
          className="inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm font-medium hover:bg-accent transition-colors"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
          Export CSV
        </a>
      } />

      <div className="grid grid-cols-3 gap-4">
        {[
          { label: "Active Contracts", value: activeContracts.length, icon: FileCheck, color: "text-green-600" },
          { label: "Total Contracted Value", value: totalValue > 0 ? `R$ ${(totalValue / 1000).toFixed(0)}K` : "—", icon: DollarSign, color: "text-emerald-700" },
          { label: "Expiring in 30 Days", value: expiringSoon, icon: AlertTriangle, color: expiringSoon > 0 ? "text-amber-600" : "text-muted-foreground" },
        ].map(s => (
          <div key={s.label} className="rounded-xl border bg-card p-4">
            <div className="flex items-center gap-2 mb-1">
              <s.icon className={`h-4 w-4 ${s.color}`} />
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">{s.label}</span>
            </div>
            <div className={`text-2xl font-bold ${s.color}`}>{s.value}</div>
          </div>
        ))}
      </div>

      {contracts.length === 0 ? (
        <div className="rounded-xl border bg-card p-12 text-center">
          <FileCheck className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
          <h3 className="font-semibold text-lg mb-2">No contracts yet</h3>
          <p className="text-muted-foreground text-sm mb-4">Convert an approved proposal to a contract to get started.</p>
          <Link href="/proposals?status=approved" className="inline-flex items-center gap-2 rounded-lg bg-primary text-primary-foreground px-4 py-2 text-sm font-medium hover:opacity-90 transition-opacity">
            View Approved Proposals →
          </Link>
        </div>
      ) : (
        <div className="rounded-xl border bg-card overflow-hidden">
          <table className="w-full text-sm">
            <thead className="border-b bg-muted/30">
              <tr>
                <th className="text-left px-4 py-3 font-semibold text-muted-foreground text-xs uppercase tracking-wide">#</th>
                <th className="text-left px-4 py-3 font-semibold text-muted-foreground text-xs uppercase tracking-wide">Company</th>
                <th className="text-left px-4 py-3 font-semibold text-muted-foreground text-xs uppercase tracking-wide">Title</th>
                <th className="text-left px-4 py-3 font-semibold text-muted-foreground text-xs uppercase tracking-wide">Value</th>
                <th className="text-left px-4 py-3 font-semibold text-muted-foreground text-xs uppercase tracking-wide">Period</th>
                <th className="text-left px-4 py-3 font-semibold text-muted-foreground text-xs uppercase tracking-wide">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {contracts.map(c => (
                <tr key={c.id} className="hover:bg-muted/20 transition-colors">
                  <td className="px-4 py-3 font-mono text-xs text-muted-foreground">{c.contract_number || c.id.slice(0, 8)}</td>
                  <td className="px-4 py-3 font-medium">{c.companies?.company_name ?? "—"}</td>
                  <td className="px-4 py-3 text-muted-foreground">{c.title}</td>
                  <td className="px-4 py-3 font-semibold text-emerald-700">{c.total_value_brl ? `R$ ${Number(c.total_value_brl).toLocaleString("pt-BR")}` : "—"}</td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">{c.start_date ? formatDate(c.start_date) : "—"} — {c.end_date ? formatDate(c.end_date) : "—"}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${STATUS_COLORS[c.status] ?? "bg-gray-100 text-gray-600"}`}>{c.status}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
