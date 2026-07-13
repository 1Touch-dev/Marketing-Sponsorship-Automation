import { supabaseAdmin } from "@/lib/supabase/server";
import { PageHeader } from "@/components/shared/page-header";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { StatusBadge } from "@/components/shared/status-badge";
import { formatDate } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { FileText, TrendingUp, AlertCircle, Trophy, ExternalLink, Target, CheckCircle2, BarChart3, Award } from "lucide-react";
import { GenerateReportButton } from "./generate-report-button";

export const dynamic = "force-dynamic";

const ANNUAL_REVENUE_TARGET = Number(process.env.ANNUAL_REVENUE_TARGET ?? 2_000_000);

type ActiveSponsor = {
  id: string;
  title: string;
  status: string;
  version: number;
  created_at: string;
  updated_at: string;
  share_token: string | null;
  companies: { id: string; company_name: string; industry: string | null; contact_name: string | null; contact_email: string | null } | null;
  campaigns: { title: string } | null;
};

export default async function ReportsPage() {
  const sb = supabaseAdmin();

  // Parallel data fetching for KPIs + sponsor tracking
  const [
    { data: activeSponsors },
    { data: pipelineProposals },
    { data: wonProposals },
    { data: lostProposals },
    { data: contractsData },
    { data: proposalsByMonth },
  ] = await Promise.all([
    sb.from("proposals").select("id, title, status, version, created_at, updated_at, share_token, companies(id, company_name, industry, contact_name, contact_email), campaigns(title)").eq("status", "active_contract").order("updated_at", { ascending: false }),
    sb.from("proposals").select("id, title, status, updated_at, companies(company_name, industry)").in("status", ["approved", "under_review"]).order("updated_at", { ascending: false }).limit(10),
    sb.from("proposals").select("id", { count: "exact", head: true }).eq("status", "active_contract"),
    sb.from("proposals").select("id", { count: "exact", head: true }).eq("status", "rejected"),
    sb.from("contracts").select("total_value_brl, deal_type, created_at").order("created_at", { ascending: false }).limit(50),
    sb.from("proposals").select("created_at").gte("created_at", new Date(Date.now() - 180 * 86400000).toISOString()).order("created_at", { ascending: true }),
  ]);

  const sponsors = (activeSponsors ?? []) as unknown as ActiveSponsor[];

  // Revenue calculations
  const totalRevenue = (contractsData ?? []).reduce((sum, c) => sum + (Number(c.total_value_brl) || 0), 0);
  const revenueProgress = Math.min(100, Math.round((totalRevenue / ANNUAL_REVENUE_TARGET) * 100));

  // Win rate
  const wonCount = (wonProposals as unknown as { count?: number } | null)?.count ?? sponsors.length;
  const lostCount = (lostProposals as unknown as { count?: number } | null)?.count ?? 0;
  const totalClosed = wonCount + lostCount;
  const winRate = totalClosed > 0 ? Math.round((wonCount / totalClosed) * 100) : 0;

  // Revenue by deal type
  const revenueByType: Record<string, number> = {};
  for (const c of contractsData ?? []) {
    const t = c.deal_type || "Direct";
    revenueByType[t] = (revenueByType[t] ?? 0) + (Number(c.total_value_brl) || 0);
  }

  // Proposals created per month (last 6 months)
  const monthCounts: Record<string, number> = {};
  const now = new Date();
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    monthCounts[`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`] = 0;
  }
  for (const p of proposalsByMonth ?? []) {
    const key = (p.created_at as string).slice(0, 7);
    if (key in monthCounts) monthCounts[key] = (monthCounts[key] ?? 0) + 1;
  }
  const monthKeys = Object.keys(monthCounts);
  const maxMonthCount = Math.max(1, ...Object.values(monthCounts));
  const monthLabels: Record<string, string> = { "01": "Jan", "02": "Fev", "03": "Mar", "04": "Abr", "05": "Mai", "06": "Jun", "07": "Jul", "08": "Ago", "09": "Set", "10": "Out", "11": "Nov", "12": "Dez" };

  return (
    <>
      <PageHeader
        title="Reports & Analytics"
        description="Revenue performance, pipeline health, and sponsor activation status"
      />

      {/* ── FR-07: Revenue vs Target KPI tiles ── */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
        {/* Revenue vs Target */}
        <Card>
          <CardContent className="pt-5">
            <div className="flex items-center gap-2 mb-3">
              <Target className="h-4 w-4 text-emerald-600" />
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Revenue vs Annual Target</span>
            </div>
            <div className="text-2xl font-bold text-emerald-700 mb-1">
              {totalRevenue > 0 ? `R$ ${(totalRevenue / 1000).toFixed(0)}K` : "—"}
              <span className="text-sm font-normal text-muted-foreground ml-1">/ R$ {(ANNUAL_REVENUE_TARGET / 1000).toFixed(0)}K</span>
            </div>
            <div className="w-full h-2 bg-muted rounded-full overflow-hidden mt-2">
              <div className="h-full rounded-full bg-emerald-500 transition-all" style={{ width: `${revenueProgress}%` }} />
            </div>
            <p className="text-xs text-muted-foreground mt-1">{revenueProgress}% of annual target</p>
          </CardContent>
        </Card>

        {/* Win Rate */}
        <Card>
          <CardContent className="pt-5">
            <div className="flex items-center gap-2 mb-3">
              <CheckCircle2 className="h-4 w-4 text-blue-600" />
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Win Rate</span>
            </div>
            <div className="text-2xl font-bold text-blue-700">{winRate}%</div>
            <p className="text-xs text-muted-foreground mt-1">{wonCount} won · {lostCount} lost · {totalClosed} closed</p>
          </CardContent>
        </Card>

        {/* Active Sponsors */}
        <Card>
          <CardContent className="pt-5">
            <div className="flex items-center gap-2 mb-3">
              <Award className="h-4 w-4 text-amber-600" />
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Active Sponsors</span>
            </div>
            <div className="text-2xl font-bold text-amber-700">{sponsors.length}</div>
            <p className="text-xs text-muted-foreground mt-1">{(pipelineProposals ?? []).length} more in pipeline</p>
          </CardContent>
        </Card>
      </div>

      {/* ── Proposals by Month chart ── */}
      <Card className="mb-8">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2"><BarChart3 className="h-4 w-4 text-primary" /> Proposals Created — Last 6 Months</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-end gap-3 h-32">
            {monthKeys.map(key => {
              const count = monthCounts[key] ?? 0;
              const pct = Math.round((count / maxMonthCount) * 100);
              const month = monthLabels[key.slice(5)] ?? key.slice(5);
              return (
                <div key={key} className="flex flex-col items-center gap-1 flex-1">
                  <span className="text-xs text-muted-foreground font-medium">{count > 0 ? count : ""}</span>
                  <div className="w-full rounded-t-sm bg-primary/80 transition-all" style={{ height: `${Math.max(4, pct)}%`, minHeight: count > 0 ? "8px" : "4px" }} />
                  <span className="text-[10px] text-muted-foreground">{month}</span>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* ── Revenue by Deal Type ── */}
      {Object.keys(revenueByType).length > 0 && (
        <Card className="mb-8">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2"><BarChart3 className="h-4 w-4 text-emerald-600" /> Revenue by Deal Type</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {Object.entries(revenueByType).sort((a, b) => b[1] - a[1]).map(([type, val]) => {
                const pct = Math.round((val / totalRevenue) * 100);
                return (
                  <div key={type} className="flex items-center gap-3">
                    <span className="text-xs text-muted-foreground w-24 shrink-0 truncate">{type}</span>
                    <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                      <div className="h-full rounded-full bg-emerald-500" style={{ width: `${pct}%` }} />
                    </div>
                    <span className="text-xs font-medium text-emerald-700 w-20 text-right">R$ {(val / 1000).toFixed(0)}K</span>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {sponsors.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-16 gap-4 text-center">
            <Trophy className="h-12 w-12 text-muted-foreground/30" />
            <div>
              <p className="font-semibold text-muted-foreground">No active sponsors yet</p>
              <p className="text-sm text-muted-foreground/70 mt-1">
                Mark proposals as{" "}
                <span className="font-medium text-green-700">Active / In Contract</span>{" "}
                to track them here.
              </p>
            </div>
            <Button asChild variant="outline">
              <Link href="/proposals">View Proposals</Link>
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-6">
          {/* Active sponsors */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <Trophy className="h-4 w-4 text-green-600" />
              <h2 className="text-sm font-semibold">Active Sponsors ({sponsors.length})</h2>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {sponsors.map((s) => (
                <Card key={s.id} className="border-green-200/60 bg-gradient-to-b from-green-50/50 to-transparent dark:from-green-950/10">
                  <CardHeader className="pb-2">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <CardTitle className="text-base truncate">{s.companies?.company_name ?? "—"}</CardTitle>
                        <CardDescription className="text-xs mt-0.5 truncate">
                          {s.title} · {s.campaigns?.title ?? "Direct"}
                        </CardDescription>
                      </div>
                      <StatusBadge status={s.status} />
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {/* Sponsor meta */}
                    <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                      {s.companies?.industry && (
                        <div className="flex items-center gap-1 text-muted-foreground">
                          <span className="font-medium text-foreground">Industry:</span> {s.companies.industry}
                        </div>
                      )}
                      {s.companies?.contact_name && (
                        <div className="flex items-center gap-1 text-muted-foreground">
                          <span className="font-medium text-foreground">Contact:</span> {s.companies.contact_name}
                        </div>
                      )}
                      <div className="flex items-center gap-1 text-muted-foreground">
                        <span className="font-medium text-foreground">Since:</span> {formatDate(s.updated_at)}
                      </div>
                      <div className="flex items-center gap-1 text-muted-foreground">
                        <span className="font-medium text-foreground">Version:</span> v{s.version}
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="flex flex-wrap gap-2 pt-1 border-t">
                      <Button size="sm" variant="outline" className="h-7 text-xs gap-1" asChild>
                        <Link href={`/proposals/${s.id}`}>
                          <FileText className="h-3 w-3" /> View Proposal
                        </Link>
                      </Button>
                      {s.share_token && (
                        <Button size="sm" variant="outline" className="h-7 text-xs gap-1" asChild>
                          <Link href={`/proposals/${s.id}/view`} target="_blank">
                            <ExternalLink className="h-3 w-3" /> Landing Page
                          </Link>
                        </Button>
                      )}
                      <GenerateReportButton proposalId={s.id} companyName={s.companies?.company_name ?? ""} />
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>

          {/* Pipeline — closing soon */}
          {pipelineProposals && pipelineProposals.length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-3">
                <TrendingUp className="h-4 w-4 text-blue-500" />
                <h2 className="text-sm font-semibold">Pipeline — Nearing Contract</h2>
              </div>
              <Card>
                <CardContent className="pt-4">
                  <ul className="space-y-2">
                    {pipelineProposals.map((p) => {
                      const pp = p as unknown as { id: string; title: string; status: string; updated_at: string; companies: { company_name: string; industry: string | null } | null };
                      return (
                        <li key={pp.id} className="flex items-center justify-between gap-3 rounded-lg border p-2.5 hover:bg-accent transition-colors">
                          <div className="min-w-0">
                            <p className="text-sm font-medium truncate">{pp.companies?.company_name ?? "—"}</p>
                            <p className="text-xs text-muted-foreground truncate">{pp.title}</p>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <StatusBadge status={pp.status} />
                            <Button size="sm" variant="ghost" className="h-7 text-xs gap-1" asChild>
                              <Link href={`/proposals/${pp.id}`}>
                                View <ExternalLink className="h-3 w-3" />
                              </Link>
                            </Button>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                </CardContent>
              </Card>
            </div>
          )}
        </div>
      )}

      {/* Info callout */}
      <Card className="mt-8 border-blue-200 bg-blue-50/50 dark:bg-blue-950/10 dark:border-blue-900">
        <CardContent className="flex items-start gap-3 pt-4">
          <AlertCircle className="h-4 w-4 text-blue-500 mt-0.5 shrink-0" />
          <div className="text-sm text-blue-800 dark:text-blue-300 space-y-1">
            <p className="font-semibold">How monthly reports work</p>
            <ul className="text-xs text-blue-700 dark:text-blue-400 list-disc list-inside space-y-0.5">
              <li>Click <strong>Generate Report</strong> on any active sponsor to create an AI-written activation summary.</li>
              <li>Reports pull from the proposal content, execution brief, and inventory package.</li>
              <li>Share the public landing page link as a live deal room for the sponsor.</li>
            </ul>
          </div>
        </CardContent>
      </Card>

      {/* Data Exports */}
      <div className="mt-8">
        <h2 className="text-sm font-semibold mb-2">Data Exports</h2>
        <p className="text-xs text-muted-foreground mb-3">Download raw data as CSV files for offline analysis or reporting.</p>
        <div className="flex flex-wrap gap-2">
          {(
            [
              ["/api/export/companies", "Companies CSV"],
              ["/api/export/proposals", "Proposals CSV"],
              ["/api/export/contracts", "Contracts CSV"],
              ["/api/export/revenue", "Revenue CSV"],
              ["/api/export/emails", "Email Campaigns CSV"],
            ] as [string, string][]
          ).map(([href, label]) => (
            <a
              key={href}
              href={href}
              download
              className="inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm font-medium hover:bg-accent transition-colors"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              {label}
            </a>
          ))}
        </div>
      </div>
    </>
  );
}
