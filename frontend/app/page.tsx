import Link from "next/link";
import { supabaseAdmin } from "@/lib/supabase/server";
import { PageHeader } from "@/components/shared/page-header";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { StatusBadge } from "@/components/shared/status-badge";
import { formatDate, truncate } from "@/lib/utils";
import {
  Building2,
  FileText,
  Mail,
  Clock,
  ArrowRight,
  TrendingUp,
  AlertTriangle,
  CheckCircle2,
} from "lucide-react";

export const dynamic = "force-dynamic";

async function loadDashboard() {
  const sb = supabaseAdmin();
  const [
    companies,
    campaigns,
    pendingApprovals,
    recentProposals,
    recentEmails,
    pendingFollowups,
    failedWorkflows,
    recentAudit,
  ] = await Promise.all([
    sb.from("companies").select("id", { count: "exact", head: true }),
    sb.from("campaigns").select("id", { count: "exact", head: true }),
    sb
      .from("proposals")
      .select("id", { count: "exact", head: true })
      .in("status", ["under_review", "revision_requested"]),
    sb
      .from("proposals")
      .select("id, title, status, updated_at, companies(company_name)")
      .order("updated_at", { ascending: false })
      .limit(5),
    sb
      .from("emails")
      .select("id, subject, status, recipient, updated_at")
      .order("updated_at", { ascending: false })
      .limit(5),
    sb.from("followups").select("id", { count: "exact", head: true }).eq("status", "pending"),
    sb
      .from("workflow_events")
      .select("id", { count: "exact", head: true })
      .eq("status", "failed"),
    sb
      .from("audit_logs")
      .select("id, action, entity_type, created_at, actor_email")
      .order("created_at", { ascending: false })
      .limit(8),
  ]);

  return {
    companyCount: companies.count ?? 0,
    campaignCount: campaigns.count ?? 0,
    pendingApprovalCount: pendingApprovals.count ?? 0,
    pendingFollowupCount: pendingFollowups.count ?? 0,
    failedWorkflowCount: failedWorkflows.count ?? 0,
    recentProposals: recentProposals.data ?? [],
    recentEmails: recentEmails.data ?? [],
    recentAudit: recentAudit.data ?? [],
  };
}

type Proposal = {
  id: string;
  title: string;
  status: string;
  updated_at: string;
  companies: { company_name: string } | null;
};

type Email = {
  id: string;
  subject: string;
  status: string;
  recipient: string;
  updated_at: string;
};

type AuditEntry = {
  id: string;
  action: string;
  entity_type: string;
  created_at: string;
  actor_email: string | null;
};

export default async function DashboardPage() {
  const d = await loadDashboard();

  const statCards = [
    {
      label: "Companies",
      value: d.companyCount,
      icon: Building2,
      href: "/companies",
      color: "text-blue-500",
    },
    {
      label: "Campaigns",
      value: d.campaignCount,
      icon: TrendingUp,
      href: "/campaigns",
      color: "text-purple-500",
    },
    {
      label: "Pending approvals",
      value: d.pendingApprovalCount,
      icon: FileText,
      href: "/approvals",
      color: d.pendingApprovalCount > 0 ? "text-amber-500" : "text-muted-foreground",
    },
    {
      label: "Pending follow-ups",
      value: d.pendingFollowupCount,
      icon: Clock,
      href: "/followups",
      color: d.pendingFollowupCount > 0 ? "text-orange-500" : "text-muted-foreground",
    },
    {
      label: "Emails",
      value: d.recentEmails.length,
      icon: Mail,
      href: "/emails",
      color: "text-green-500",
    },
    {
      label: "Workflow failures",
      value: d.failedWorkflowCount,
      icon: AlertTriangle,
      href: "/workflow-events",
      color: d.failedWorkflowCount > 0 ? "text-destructive" : "text-muted-foreground",
    },
  ];

  return (
    <>
      <PageHeader
        title="Dashboard"
        description="Operational overview of your sponsorship workflow."
        actions={
          <Button asChild>
            <Link href="/campaigns">Generate campaign</Link>
          </Button>
        }
      />

      {/* Stat cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
        {statCards.map((s) => (
          <Link key={s.label} href={s.href} className="block">
            <Card className="hover:bg-accent transition-colors h-full">
              <CardHeader className="pb-2 pt-4 px-4">
                <CardDescription className="text-xs">{s.label}</CardDescription>
                <div className="flex items-center gap-2 mt-1">
                  <s.icon className={`h-4 w-4 flex-shrink-0 ${s.color}`} />
                  <CardTitle className="text-2xl">{s.value}</CardTitle>
                </div>
              </CardHeader>
            </Card>
          </Link>
        ))}
      </div>

      {/* System alert: failed workflows */}
      {d.failedWorkflowCount > 0 && (
        <div className="mt-4 flex items-center gap-3 rounded-lg border border-destructive/50 bg-destructive/5 px-4 py-3">
          <AlertTriangle className="h-5 w-5 text-destructive flex-shrink-0" />
          <p className="text-sm text-destructive font-medium">
            {d.failedWorkflowCount} workflow{d.failedWorkflowCount !== 1 ? "s" : ""} failed.{" "}
            <Link href="/workflow-events" className="underline">
              View details →
            </Link>
          </p>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-6">
        {/* Recent proposals */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <div>
              <CardTitle className="text-base">Recent proposals</CardTitle>
              <CardDescription className="text-xs">Latest activity across proposals.</CardDescription>
            </div>
            <Button variant="ghost" size="sm" asChild>
              <Link href="/proposals">
                All <ArrowRight className="ml-1 h-3 w-3" />
              </Link>
            </Button>
          </CardHeader>
          <CardContent className="space-y-2">
            {d.recentProposals.length === 0 ? (
              <p className="text-sm text-muted-foreground">No proposals yet.</p>
            ) : (
              (d.recentProposals as unknown as Proposal[]).map((p) => (
                <Link
                  key={p.id}
                  href={`/proposals/${p.id}`}
                  className="flex items-center justify-between rounded-md border px-3 py-2 hover:bg-accent transition-colors"
                >
                  <div className="min-w-0 mr-3">
                    <div className="text-sm font-medium truncate">{truncate(p.title, 55)}</div>
                    <div className="text-xs text-muted-foreground">
                      {(p.companies as { company_name: string } | null)?.company_name ?? "—"} ·{" "}
                      {formatDate(p.updated_at)}
                    </div>
                  </div>
                  <StatusBadge status={p.status} />
                </Link>
              ))
            )}
          </CardContent>
        </Card>

        {/* Recent emails */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <div>
              <CardTitle className="text-base">Recent emails</CardTitle>
              <CardDescription className="text-xs">Latest drafts and sends.</CardDescription>
            </div>
            <Button variant="ghost" size="sm" asChild>
              <Link href="/emails">
                All <ArrowRight className="ml-1 h-3 w-3" />
              </Link>
            </Button>
          </CardHeader>
          <CardContent className="space-y-2">
            {d.recentEmails.length === 0 ? (
              <p className="text-sm text-muted-foreground">No emails yet.</p>
            ) : (
              (d.recentEmails as Email[]).map((e) => (
                <Link
                  key={e.id}
                  href={`/emails/${e.id}`}
                  className="flex items-center justify-between rounded-md border px-3 py-2 hover:bg-accent transition-colors"
                >
                  <div className="min-w-0 mr-3">
                    <div className="text-sm font-medium truncate">{truncate(e.subject, 55)}</div>
                    <div className="text-xs text-muted-foreground">
                      {e.recipient} · {formatDate(e.updated_at)}
                    </div>
                  </div>
                  <StatusBadge status={e.status} />
                </Link>
              ))
            )}
          </CardContent>
        </Card>

        {/* Recent audit activity */}
        <Card className="lg:col-span-2">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <div>
              <CardTitle className="text-base">Recent activity</CardTitle>
              <CardDescription className="text-xs">System audit log (latest 8 events).</CardDescription>
            </div>
            <Button variant="ghost" size="sm" asChild>
              <Link href="/audit">
                All <ArrowRight className="ml-1 h-3 w-3" />
              </Link>
            </Button>
          </CardHeader>
          <CardContent>
            {d.recentAudit.length === 0 ? (
              <p className="text-sm text-muted-foreground">No activity yet.</p>
            ) : (
              <div className="divide-y">
                {(d.recentAudit as AuditEntry[]).map((a) => (
                  <div key={a.id} className="flex items-center gap-3 py-2">
                    <CheckCircle2 className="h-4 w-4 flex-shrink-0 text-muted-foreground" />
                    <div className="min-w-0 flex-1">
                      <span className="text-sm font-mono">{a.action}</span>
                      <span className="mx-2 text-muted-foreground text-xs">·</span>
                      <Badge variant="outline" className="text-xs">{a.entity_type}</Badge>
                    </div>
                    <div className="text-xs text-muted-foreground flex-shrink-0">
                      {formatDate(a.created_at)}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
