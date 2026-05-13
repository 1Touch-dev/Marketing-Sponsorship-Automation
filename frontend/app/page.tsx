import Link from "next/link";
import { supabaseAdmin } from "@/lib/supabase/server";
import { PageHeader } from "@/components/shared/page-header";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/shared/status-badge";
import { formatDate, truncate } from "@/lib/utils";
import { Building2, FileText, Mail, Clock, ArrowRight } from "lucide-react";

export const dynamic = "force-dynamic";

async function loadDashboard() {
  const sb = supabaseAdmin();
  const [companies, proposals, pendingApprovals, emails, followups] = await Promise.all([
    sb.from("companies").select("id, company_name, status", { count: "exact", head: true }),
    sb.from("proposals").select("id, title, status, updated_at, company_id, companies(company_name)").order("updated_at", { ascending: false }).limit(5),
    sb.from("proposals").select("id", { count: "exact", head: true }).in("status", ["under_review", "revision_requested"]),
    sb.from("emails").select("id, subject, status, recipient, updated_at").order("updated_at", { ascending: false }).limit(5),
    sb.from("followups").select("id", { count: "exact", head: true }).eq("status", "pending"),
  ]);
  return {
    companyCount: companies.count ?? 0,
    proposals: proposals.data ?? [],
    pendingApprovalCount: pendingApprovals.count ?? 0,
    emails: emails.data ?? [],
    pendingFollowupCount: followups.count ?? 0,
  };
}

export default async function DashboardPage() {
  const d = await loadDashboard();

  return (
    <>
      <PageHeader
        title="Dashboard"
        description="Operational overview of sponsorship workflow."
        actions={
          <Button asChild>
            <Link href="/campaigns">Generate campaign</Link>
          </Button>
        }
      />

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2"><CardDescription>Companies</CardDescription><CardTitle className="text-3xl flex items-center gap-2"><Building2 className="h-5 w-5 text-muted-foreground" />{d.companyCount}</CardTitle></CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardDescription>Pending approvals</CardDescription><CardTitle className="text-3xl flex items-center gap-2"><FileText className="h-5 w-5 text-muted-foreground" />{d.pendingApprovalCount}</CardTitle></CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardDescription>Recent emails</CardDescription><CardTitle className="text-3xl flex items-center gap-2"><Mail className="h-5 w-5 text-muted-foreground" />{d.emails.length}</CardTitle></CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardDescription>Pending follow-ups</CardDescription><CardTitle className="text-3xl flex items-center gap-2"><Clock className="h-5 w-5 text-muted-foreground" />{d.pendingFollowupCount}</CardTitle></CardHeader>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div><CardTitle>Recent proposals</CardTitle><CardDescription>Latest activity across proposals.</CardDescription></div>
            <Button variant="ghost" size="sm" asChild><Link href="/proposals">All <ArrowRight className="ml-1 h-4 w-4" /></Link></Button>
          </CardHeader>
          <CardContent className="space-y-3">
            {d.proposals.length === 0 ? (
              <p className="text-sm text-muted-foreground">No proposals yet.</p>
            ) : (
              d.proposals.map((p: any) => (
                <Link key={p.id} href={`/proposals/${p.id}`} className="flex items-center justify-between rounded-md border p-3 hover:bg-accent transition-colors">
                  <div className="min-w-0">
                    <div className="font-medium truncate">{truncate(p.title, 60)}</div>
                    <div className="text-xs text-muted-foreground">{p.companies?.company_name ?? "—"} · {formatDate(p.updated_at)}</div>
                  </div>
                  <StatusBadge status={p.status} />
                </Link>
              ))
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div><CardTitle>Recent emails</CardTitle><CardDescription>Latest drafts and sends.</CardDescription></div>
            <Button variant="ghost" size="sm" asChild><Link href="/emails">All <ArrowRight className="ml-1 h-4 w-4" /></Link></Button>
          </CardHeader>
          <CardContent className="space-y-3">
            {d.emails.length === 0 ? (
              <p className="text-sm text-muted-foreground">No emails yet.</p>
            ) : (
              d.emails.map((e: any) => (
                <Link key={e.id} href={`/emails/${e.id}`} className="flex items-center justify-between rounded-md border p-3 hover:bg-accent transition-colors">
                  <div className="min-w-0">
                    <div className="font-medium truncate">{truncate(e.subject, 60)}</div>
                    <div className="text-xs text-muted-foreground">{e.recipient} · {formatDate(e.updated_at)}</div>
                  </div>
                  <StatusBadge status={e.status} />
                </Link>
              ))
            )}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
