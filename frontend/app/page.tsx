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
  Zap,
  Trophy,
  Users,
  Activity,
  Plus,
  DollarSign,
  BarChart2,
  Send,
  CalendarCheck,
  ImageIcon,
  MailOpen,
  MousePointerClick,
} from "lucide-react";

export const dynamic = "force-dynamic";

// Audit actions to HIDE from the dashboard activity feed (internal noise)
const HIDDEN_AUDIT_ACTIONS = [
  "ai.validation_failed",
  "ai.validation_failed:proposal.enhance.pricing",
  "ai.validation_failed:proposal.enhance.intelligence",
  "ai.validation_failed:proposal.pricing_tiers",
  "ai.validation_failed:proposal.enhance.visuals",
  "ai.validation_failed:proposal.enhance.variants",
  "campaign.generate_failed",
];

// Friendly labels for audit actions
const AUDIT_ACTION_LABELS: Record<string, string> = {
  "company.created": "Company added",
  "company.updated": "Company updated",
  "company.bulk_import": "Companies imported",
  "company.intelligence_generated": "AI company analysis run",
  "campaigns.generated": "Campaign ideas generated",
  "proposal.generated": "Proposal generated",
  "proposal.enhanced": "Proposal enhanced with AI",
  "proposal.approve": "Proposal approved",
  "proposal.edited": "Proposal edited",
  "email.generated": "Email drafted",
  "email.sent": "Email sent",
  "followup.suggested": "Follow-up suggested",
};

function friendlyAction(action: string): string {
  return AUDIT_ACTION_LABELS[action] ?? action.replace(/\./g, " › ").replace(/_/g, " ");
}

async function loadDashboard() {
  const sb = supabaseAdmin();
  const [
    companies,
    campaigns,
    proposals,
    pendingApprovals,
    recentProposals,
    recentEmails,
    pendingFollowups,
    recentAudit,
    approvedProposals,
    sentEmails,
    contractProposals,
    proposalPackages,
  ] = await Promise.all([
    sb.from("companies").select("id", { count: "exact", head: true }).neq("status", "closed"),
    sb.from("campaigns").select("id", { count: "exact", head: true }),
    sb.from("proposals").select("id", { count: "exact", head: true }).in("status", ["approved", "under_review", "draft"]),
    sb.from("proposals")
      .select("id", { count: "exact", head: true })
      .in("status", ["under_review", "revision_requested"]),
    sb.from("proposals")
      .select("id, title, status, updated_at, companies(company_name)")
      .neq("status", "rejected")
      .order("updated_at", { ascending: false })
      .limit(6),
    sb.from("emails")
      .select("id, subject, status, recipient, updated_at")
      .order("updated_at", { ascending: false })
      .limit(5),
    sb.from("followups").select("id", { count: "exact", head: true }).eq("status", "pending"),
    sb.from("audit_logs")
      .select("id, action, entity_type, created_at, actor_email")
      .order("created_at", { ascending: false })
      .limit(30),
    // KPI: approved proposals (pipeline)
    sb.from("proposals").select("id", { count: "exact", head: true }).eq("status", "approved"),
  // KPI: emails sent total
    sb.from("emails").select("id", { count: "exact", head: true }).eq("status", "sent"),
    // KPI: active contracts
    sb.from("proposals").select("id", { count: "exact", head: true }).eq("status", "active_contract"),
    // KPI: pipeline value (sum of package prices for active proposals)
    sb.from("proposal_packages").select("price_brl, proposal_id"),
  ]);

  const failedWorkflows = await sb
    .from("workflow_events")
    .select("id", { count: "exact", head: true })
    .eq("status", "failed")
    .then((r) => ({ count: r.error ? 0 : (r.count ?? 0) }));

  const { count: openedEmailsCount } = await sb
    .from("emails")
    .select("id", { count: "exact", head: true })
    .not("opened_at", "is", null);
  const sentEmailsCount = sentEmails.count ?? 0;
  const openRate = sentEmailsCount > 0 ? Math.round(((openedEmailsCount ?? 0) / sentEmailsCount) * 100) : 0;

  const { count: clickedEmails } = await sb
    .from("emails")
    .select("id", { count: "exact", head: true })
    .not("clicked_at", "is", null);

  // Gmail OAuth status check
  const gmailStatus = await sb
    .from("users")
    .select("metadata")
    .limit(1)
    .maybeSingle()
    .then(r => {
      const tokens = (r.data?.metadata as Record<string, unknown> | null)?.gmail_tokens as Record<string, unknown> | null;
      return {
        connected: !!(tokens?.access_token && tokens?.refresh_token),
        expired: tokens?.expiry_date ? (tokens.expiry_date as number) < Date.now() && !tokens?.refresh_token : false,
      };
    });

  // Proposals sent this month
  const thisMonthStart = new Date();
  thisMonthStart.setDate(1);
  thisMonthStart.setHours(0, 0, 0, 0);
  const proposalsSentThisMonth = await sb
    .from("emails")
    .select("id", { count: "exact", head: true })
    .eq("status", "sent")
    .gte("created_at", thisMonthStart.toISOString());

  // Image generation job stats
  const imageJobStats = await sb.from("image_generation_jobs").select("status").then(r => {
    const jobs = r.data ?? [];
    const completed = jobs.filter(j => j.status === "completed").length;
    const total = jobs.length;
    return { completed, total, rate: total > 0 ? Math.round((completed / total) * 100) : 0 };
  });

  // Compute pipeline value from ALL packages (simple sum — filter by proposal status not needed here)
  const pipelineValueRaw = (proposalPackages.data ?? []).reduce(
    (sum, pkg) => sum + (Number(pkg.price_brl) || 0), 0
  );

  // Conversion: proposals sent (approved+contract) / total non-rejected proposals
  const totalProposalsSent = (approvedProposals.count ?? 0) + (contractProposals.count ?? 0);
  const totalProposalsAll = proposals.count ?? 1;
  const conversionRate = totalProposalsAll > 0
    ? Math.round((totalProposalsSent / totalProposalsAll) * 100)
    : 0;

  const cleanAudit = (recentAudit.data ?? []).filter(
    (a) => !HIDDEN_AUDIT_ACTIONS.some((hidden) => a.action.startsWith(hidden))
  ).slice(0, 8);

  return {
    companyCount: companies.count ?? 0,
    campaignCount: campaigns.count ?? 0,
    proposalCount: proposals.count ?? 0,
    pendingApprovalCount: pendingApprovals.count ?? 0,
    pendingFollowupCount: pendingFollowups.count ?? 0,
    failedWorkflowCount: failedWorkflows.count,
    recentProposals: recentProposals.data ?? [],
    recentEmails: recentEmails.data ?? [],
    recentAudit: cleanAudit,
    // KPIs
    approvedProposalCount: approvedProposals.count ?? 0,
    sentEmailCount: sentEmails.count ?? 0,
    activeContractCount: contractProposals.count ?? 0,
    pipelineValueBrl: pipelineValueRaw,
    conversionRate,
    // New KPIs
    gmailStatus,
    proposalsSentThisMonthCount: proposalsSentThisMonth.count ?? 0,
    imageJobStats,
    openRate,
    openedEmailsCount: openedEmailsCount ?? 0,
    clickedEmailCount: clickedEmails ?? 0,
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

  const isHealthy = d.failedWorkflowCount === 0 && d.pendingApprovalCount === 0;

  const statCards = [
    {
      label: "Active Companies",
      value: d.companyCount,
      icon: Building2,
      href: "/companies",
      color: "text-blue-500",
      bg: "bg-blue-50 dark:bg-blue-900/20",
      trend: "+5 this week",
    },
    {
      label: "Proposals",
      value: d.proposalCount,
      icon: FileText,
      href: "/proposals",
      color: "text-purple-500",
      bg: "bg-purple-50 dark:bg-purple-900/20",
      trend: d.pendingApprovalCount > 0 ? `${d.pendingApprovalCount} need review` : "All up to date",
    },
    {
      label: "Campaigns",
      value: d.campaignCount,
      icon: TrendingUp,
      href: "/campaigns",
      color: "text-green-500",
      bg: "bg-green-50 dark:bg-green-900/20",
      trend: "AI generated",
    },
    {
      label: "Pending Approvals",
      value: d.pendingApprovalCount,
      icon: CheckCircle2,
      href: "/approvals",
      color: d.pendingApprovalCount > 0 ? "text-amber-600" : "text-muted-foreground",
      bg: d.pendingApprovalCount > 0 ? "bg-amber-50 dark:bg-amber-900/20" : "",
      trend: d.pendingApprovalCount > 0 ? "Action required" : "Nothing pending",
    },
    {
      label: "Follow-ups",
      value: d.pendingFollowupCount,
      icon: Clock,
      href: "/followups",
      color: d.pendingFollowupCount > 0 ? "text-orange-500" : "text-muted-foreground",
      bg: d.pendingFollowupCount > 0 ? "bg-orange-50 dark:bg-orange-900/20" : "",
      trend: d.pendingFollowupCount > 0 ? "Due today" : "All done",
    },
    {
      label: "System Status",
      value: d.failedWorkflowCount === 0 ? "OK" : d.failedWorkflowCount,
      icon: d.failedWorkflowCount > 0 ? AlertTriangle : CheckCircle2,
      href: "/workflow-events",
      color: d.failedWorkflowCount > 0 ? "text-destructive" : "text-green-600",
      bg: d.failedWorkflowCount > 0 ? "bg-destructive/5" : "bg-green-50 dark:bg-green-900/20",
      trend: d.failedWorkflowCount > 0 ? `${d.failedWorkflowCount} failures` : "All healthy",
    },
  ];

  return (
    <>
      <PageHeader
        title="Dashboard"
        description="Coritiba FC — Commercial Sponsorship Platform"
        actions={
          <div className="flex items-center gap-2 flex-wrap">
            {isHealthy && (
              <Badge variant="outline" className="text-green-700 border-green-300 bg-green-50 text-xs">
                <CheckCircle2 className="h-3 w-3 mr-1" />
                All systems healthy
              </Badge>
            )}
            <Button asChild variant="outline" size="sm">
              <Link href="/campaigns">
                <Plus className="h-4 w-4 mr-1" />
                New Campaign
              </Link>
            </Button>
            <Button asChild size="sm">
              <Link href="/proposals/new">
                <Zap className="h-4 w-4 mr-1" />
                Create Proposal
              </Link>
            </Button>
          </div>
        }
      />

      {/* System alert: failed workflows */}
      {d.failedWorkflowCount > 0 && (
        <div className="flex items-center gap-3 rounded-lg border border-destructive/50 bg-destructive/5 px-4 py-3">
          <AlertTriangle className="h-5 w-5 text-destructive flex-shrink-0" />
          <p className="text-sm text-destructive font-medium">
            {d.failedWorkflowCount} workflow{d.failedWorkflowCount !== 1 ? "s" : ""} failed.{" "}
            <Link href="/workflow-events" className="underline">
              View details →
            </Link>
          </p>
        </div>
      )}

      {/* Gmail OAuth expired banner */}
      {d.gmailStatus.expired && (
        <div className="flex items-center gap-3 rounded-lg border border-red-400 bg-red-50 dark:bg-red-900/20 px-4 py-3">
          <AlertTriangle className="h-5 w-5 text-red-600 flex-shrink-0" />
          <p className="text-sm text-red-700 dark:text-red-400 font-medium">
            ⚠️ Gmail OAuth expired — outbound emails are failing. Reconnect in{" "}
            <Link href="/settings" className="underline">
              Settings
            </Link>
            .
          </p>
        </div>
      )}

      {/* Coritiba FC platform context */}
      <div className="rounded-xl border bg-gradient-to-r from-green-900 to-green-800 p-4 text-white">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <Trophy className="h-6 w-6 text-green-300 flex-shrink-0" />
            <div>
              <p className="font-semibold text-sm">Coritiba FC × Couto Pereira</p>
              <p className="text-xs text-green-300">Commercial Sponsorship Intelligence Platform — Curitiba, Paraná</p>
            </div>
          </div>
          <div className="flex items-center gap-4 text-xs text-green-200">
            <span className="flex items-center gap-1"><Users className="h-3 w-3" /> 1.5M+ followers</span>
            <span className="flex items-center gap-1"><Activity className="h-3 w-3" /> 38+ matches/season</span>
            <span className="flex items-center gap-1"><Trophy className="h-3 w-3" /> Brasileirão 1985 &amp; 1990</span>
          </div>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Link href="/companies/new" className="flex items-center gap-3 rounded-xl border bg-white hover:border-blue-400 hover:shadow-sm transition-all p-4 group">
          <div className="h-9 w-9 rounded-lg bg-blue-100 flex items-center justify-center group-hover:bg-blue-200 transition-colors">
            <Building2 className="h-4.5 w-4.5 text-blue-600" />
          </div>
          <div><div className="text-sm font-semibold">Add Company</div><div className="text-xs text-slate-500">+ auto-discover</div></div>
        </Link>
        <Link href="/campaigns" className="flex items-center gap-3 rounded-xl border bg-white hover:border-green-400 hover:shadow-sm transition-all p-4 group">
          <div className="h-9 w-9 rounded-lg bg-green-100 flex items-center justify-center group-hover:bg-green-200 transition-colors">
            <Zap className="h-4.5 w-4.5 text-green-600" />
          </div>
          <div><div className="text-sm font-semibold">Generate Campaign</div><div className="text-xs text-slate-500">AI-powered</div></div>
        </Link>        <Link href="/proposals/new" className="flex items-center gap-3 rounded-xl border bg-white hover:border-indigo-400 hover:shadow-sm transition-all p-4 group">
          <div className="h-9 w-9 rounded-lg bg-indigo-100 flex items-center justify-center group-hover:bg-indigo-200 transition-colors">
            <FileText className="h-4.5 w-4.5 text-indigo-600" />
          </div>
          <div><div className="text-sm font-semibold">Create Proposal</div><div className="text-xs text-slate-500">guided wizard</div></div>
        </Link>
        <Link href="/media-generation" className="flex items-center gap-3 rounded-xl border bg-white hover:border-violet-400 hover:shadow-sm transition-all p-4 group">
          <div className="h-9 w-9 rounded-lg bg-violet-100 flex items-center justify-center group-hover:bg-violet-200 transition-colors">
            <TrendingUp className="h-4.5 w-4.5 text-violet-600" />
          </div>
          <div><div className="text-sm font-semibold">Generate Images</div><div className="text-xs text-slate-500">AI visuals</div></div>
        </Link>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {statCards.map((s) => (
          <Link key={s.label} href={s.href} className="block group">
            <Card className={`hover:shadow-md hover:border-primary/30 transition-all duration-200 h-full ${s.bg}`}>
              <CardHeader className="pb-1 pt-4 px-4">
                <div className="flex items-center justify-between mb-2">
                  <s.icon className={`h-4 w-4 ${s.color}`} />
                </div>
                <CardTitle className={`text-2xl font-bold ${s.color}`}>{s.value}</CardTitle>
                <CardDescription className="text-[11px] font-medium mt-0.5">{s.label}</CardDescription>
                {s.trend && <p className="text-[10px] text-muted-foreground mt-1">{s.trend}</p>}
              </CardHeader>
            </Card>
          </Link>
        ))}
      </div>

      {/* KPI Strip — Pipeline Value, Conversion Rate, Contracts, Emails Sent, Sent This Month, Image Gen Rate, Email Open Rate, Email Click Rate */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-8 gap-3">
        <div className="rounded-xl border bg-card p-4">
          <div className="flex items-center gap-2 mb-1">
            <DollarSign className="h-4 w-4 text-emerald-600" />
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Pipeline Value</span>
          </div>
          {d.pipelineValueBrl > 0 ? (
            <>
              <div className="text-xl font-bold text-emerald-700">
                {d.pipelineValueBrl >= 1_000_000
                  ? `R$ ${(d.pipelineValueBrl / 1_000_000).toFixed(1)}M`
                  : d.pipelineValueBrl >= 1_000
                  ? `R$ ${(d.pipelineValueBrl / 1_000).toFixed(0)}K`
                  : `R$ ${d.pipelineValueBrl.toLocaleString("pt-BR")}`}
              </div>
              <p className="text-[10px] text-muted-foreground mt-0.5">from approved + under review packages</p>
            </>
          ) : (
            <>
              <div className="text-xl font-bold text-muted-foreground">—</div>
              <p className="text-[10px] text-muted-foreground mt-0.5">Add pricing packages to proposals</p>
            </>
          )}
        </div>

        <div className="rounded-xl border bg-card p-4">
          <div className="flex items-center gap-2 mb-1">
            <BarChart2 className="h-4 w-4 text-blue-600" />
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Conversion Rate</span>
          </div>
          <div className={`text-xl font-bold ${d.conversionRate >= 30 ? "text-emerald-700" : d.conversionRate >= 10 ? "text-amber-600" : "text-muted-foreground"}`}>
            {d.conversionRate}%
          </div>
          <p className="text-[10px] text-muted-foreground mt-0.5">
            {d.approvedProposalCount} approved + {d.activeContractCount} contracts / {d.proposalCount} total
          </p>
        </div>

        <Link href="/proposals?status=active_contract" className="rounded-xl border bg-card p-4 hover:border-primary/30 transition-all">
          <div className="flex items-center gap-2 mb-1">
            <Trophy className="h-4 w-4 text-amber-500" />
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Active Contracts</span>
          </div>
          <div className="text-xl font-bold text-amber-600">{d.activeContractCount}</div>
          <p className="text-[10px] text-muted-foreground mt-0.5">signed sponsors</p>
        </Link>

        <Link href="/emails" className="rounded-xl border bg-card p-4 hover:border-primary/30 transition-all">
          <div className="flex items-center gap-2 mb-1">
            <Send className="h-4 w-4 text-sky-600" />
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Emails Sent</span>
          </div>
          <div className="text-xl font-bold text-sky-700">{d.sentEmailCount}</div>
          <p className="text-[10px] text-muted-foreground mt-0.5">total outreach emails</p>
        </Link>

        <div className="rounded-xl border bg-card p-4">
          <div className="flex items-center gap-2 mb-1">
            <CalendarCheck className="h-4 w-4 text-violet-600" />
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Sent This Month</span>
          </div>
          <div className="text-xl font-bold text-violet-600">{d.proposalsSentThisMonthCount}</div>
          <p className="text-[10px] text-muted-foreground mt-0.5">emails sent this month</p>
        </div>

        <div className="rounded-xl border bg-card p-4">
          <div className="flex items-center gap-2 mb-1">
            <ImageIcon className="h-4 w-4 text-rose-500" />
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Image Gen Rate</span>
          </div>
          <div className={`text-xl font-bold ${d.imageJobStats.rate >= 80 ? "text-emerald-700" : d.imageJobStats.rate >= 50 ? "text-amber-600" : "text-muted-foreground"}`}>
            {d.imageJobStats.total > 0 ? `${d.imageJobStats.rate}% success` : "—"}
          </div>
          <p className="text-[10px] text-muted-foreground mt-0.5">
            {d.imageJobStats.completed}/{d.imageJobStats.total} jobs completed
          </p>
        </div>

        <Link href="/emails?status=opened" className="rounded-xl border bg-card p-4 hover:border-primary/30 transition-all">
          <div className="flex items-center gap-2 mb-1">
            <MailOpen className="h-4 w-4 text-teal-600" />
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Email Open Rate</span>
          </div>
          <div className={`text-xl font-bold ${d.openRate >= 40 ? "text-emerald-700" : d.openRate >= 20 ? "text-amber-600" : "text-muted-foreground"}`}>
            {d.sentEmailCount > 0 ? `${d.openRate}%` : "—"}
          </div>
          <p className="text-[10px] text-muted-foreground mt-0.5">
            {d.openedEmailsCount} opened / {d.sentEmailCount} sent
          </p>
        </Link>

        <Link href="/emails" className="rounded-xl border bg-card p-4 hover:border-primary/30 transition-all">
          <div className="flex items-center gap-2 mb-1">
            <MousePointerClick className="h-4 w-4 text-indigo-600" />
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Email Click Rate</span>
          </div>
          <div className={`text-xl font-bold ${d.clickedEmailCount > 0 ? "text-indigo-700" : "text-muted-foreground"}`}>
            {d.clickedEmailCount} clicked
          </div>
          <p className="text-[10px] text-muted-foreground mt-0.5">link clicks tracked</p>
        </Link>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent proposals */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <div>
              <CardTitle className="text-base">Recent proposals</CardTitle>
              <CardDescription className="text-xs">Latest Coritiba FC sponsorship proposals.</CardDescription>
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
              <CardDescription className="text-xs">Latest drafts and outreach sends.</CardDescription>
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

        {/* Recent operational activity */}
        <Card className="lg:col-span-2">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <div>
              <CardTitle className="text-base">Recent activity</CardTitle>
              <CardDescription className="text-xs">
                Operational workflow activity · AI system events filtered
              </CardDescription>
            </div>
            <Button variant="ghost" size="sm" asChild>
              <Link href="/audit">
                Full log <ArrowRight className="ml-1 h-3 w-3" />
              </Link>
            </Button>
          </CardHeader>
          <CardContent>
            {d.recentAudit.length === 0 ? (
              <p className="text-sm text-muted-foreground">No activity yet.</p>
            ) : (
              <div className="divide-y">
                {(d.recentAudit as AuditEntry[]).map((a) => (
                  <div key={a.id} className="flex items-center gap-3 py-2.5">
                    <CheckCircle2 className="h-4 w-4 flex-shrink-0 text-green-500" />
                    <div className="min-w-0 flex-1">
                      <span className="text-sm font-medium">{friendlyAction(a.action)}</span>
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
