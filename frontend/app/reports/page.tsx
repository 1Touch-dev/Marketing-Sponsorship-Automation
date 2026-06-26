import { supabaseAdmin } from "@/lib/supabase/server";
import { PageHeader } from "@/components/shared/page-header";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { StatusBadge } from "@/components/shared/status-badge";
import { formatDate } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { FileText, TrendingUp, CalendarCheck, AlertCircle, Trophy, ExternalLink } from "lucide-react";
import { GenerateReportButton } from "./generate-report-button";

export const dynamic = "force-dynamic";

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

  // Active sponsors = proposals with status active_contract
  const { data: activeSponsors } = await sb
    .from("proposals")
    .select("id, title, status, version, created_at, updated_at, share_token, companies(id, company_name, industry, contact_name, contact_email), campaigns(title)")
    .eq("status", "active_contract")
    .order("updated_at", { ascending: false });

  const sponsors = (activeSponsors ?? []) as unknown as ActiveSponsor[];

  // Upcoming — proposals approved but not yet in contract
  const { data: pipelineProposals } = await sb
    .from("proposals")
    .select("id, title, status, updated_at, companies(company_name, industry)")
    .in("status", ["approved", "under_review"])
    .order("updated_at", { ascending: false })
    .limit(10);

  return (
    <>
      <PageHeader
        title="Sponsor Reports"
        description="Monthly activation reports and status for active Coritiba FC sponsorship deals"
      />

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
