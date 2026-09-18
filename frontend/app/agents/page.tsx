import { supabaseAdmin } from "@/lib/supabase/server";
import { resolveTenantId } from "@/lib/tenants/current";
import { PageHeader } from "@/components/shared/page-header";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import Link from "next/link";
import { Bot, MessageSquareText, ShieldAlert, RefreshCw, BarChart3, Send, ArrowRight, CheckSquare } from "lucide-react";
import { RunTeam2Panel } from "./run-team2-panel";

export const dynamic = "force-dynamic";

/**
 * Phase 8's "unified orchestrator" (master_report.md Section 7.4) —
 * a single place to see and trigger every agent across Team 1
 * (Sponsorship Outreach) and Team 2 (CRM Outreach), and the shared
 * approval queue both teams write into. Reuses the existing /approvals
 * UI rather than building a second queue, per the report's own
 * instruction; the one new piece is RunTeam2Panel's combined trigger for
 * Team 2's three tenant-wide agents.
 */
export default async function AgentsPage() {
  const sb = supabaseAdmin();
  const tenantId = await resolveTenantId();

  const [{ count: pendingProposals }, { count: pendingEmails }, { count: pendingCampaigns }] = await Promise.all([
    sb.from("proposals").select("id", { count: "exact", head: true })
      .eq("tenant_id", tenantId).in("status", ["under_review", "revision_requested", "draft"]),
    sb.from("emails").select("id", { count: "exact", head: true })
      .eq("tenant_id", tenantId).in("status", ["draft", "pending_approval"]),
    sb.from("campaigns").select("id", { count: "exact", head: true })
      .eq("tenant_id", tenantId).in("status", ["draft", "selected"]),
  ]);

  const totalPending = (pendingProposals ?? 0) + (pendingEmails ?? 0) + (pendingCampaigns ?? 0);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Agentic Automation"
        description="Every AI agent across the platform, and the one shared queue where their work waits for you."
      />

      <Card className="border-primary/30 bg-gradient-to-br from-primary/5 to-transparent">
        <CardContent className="pt-4 flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <CheckSquare className="h-5 w-5 text-primary" />
            <div>
              <p className="text-sm font-semibold">{totalPending} item(s) awaiting your review</p>
              <p className="text-xs text-muted-foreground">
                {pendingProposals ?? 0} proposal(s) · {pendingEmails ?? 0} email(s) · {pendingCampaigns ?? 0} campaign(s) — every agent below writes here, nowhere else.
              </p>
            </div>
          </div>
          <Link href="/approvals" className="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline">
            Open Approvals <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Bot className="h-4 w-4 text-violet-600" /> Team 1 — Sponsorship Outreach
            </CardTitle>
            <CardDescription>Per-company: discovers, enriches, and pitches one prospect at a time.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <AgentRow
              icon={<Bot className="h-4 w-4 text-violet-500" />}
              name="Outreach Agent"
              detail="Enrich → scrape intelligence → generate proposal, pausing for approval at each stage."
              href="/companies"
              hrefLabel="Run from a company page"
            />
            <AgentRow
              icon={<MessageSquareText className="h-4 w-4 text-violet-500" />}
              name="Negotiation Agent"
              detail="Drafts a grounded reply when an inbound email is classified as an objection or needs-info."
              href="/emails"
              hrefLabel="Run from an inbound email"
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <RefreshCw className="h-4 w-4 text-sky-600" /> Team 2 — CRM Outreach
            </CardTitle>
            <CardDescription>Tenant-wide: watches the whole pipeline and contract book, not one company at a time.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <AgentRow icon={<ShieldAlert className="h-4 w-4 text-sky-500" />} name="Pipeline Hygiene Agent" detail="Flags deals with no activity for 14+ days." href="/pipeline" hrefLabel="View on Pipeline" />
            <AgentRow icon={<Send className="h-4 w-4 text-sky-500" />} name="Multi-Channel Sequencer" detail="Email channel is live (Settings → Email Flows). WhatsApp/LinkedIn need real API credentials — not built yet." href="/settings/email-flows" hrefLabel="View Email Flows" />
            <AgentRow icon={<RefreshCw className="h-4 w-4 text-sky-500" />} name="Renewal Agent" detail="Drafts renewal proposals for contracts expiring within 60 days." href="/contracts" hrefLabel="View on Contracts" />
            <AgentRow icon={<BarChart3 className="h-4 w-4 text-sky-500" />} name="Reporting Agent" detail="Drafts monthly ROI report emails from real match reach data." href="/contracts" hrefLabel="View on Contracts" />
          </CardContent>
        </Card>
      </div>

      <RunTeam2Panel />
    </div>
  );
}

function AgentRow({ icon, name, detail, href, hrefLabel }: { icon: React.ReactNode; name: string; detail: string; href: string; hrefLabel: string }) {
  return (
    <div className="flex items-start gap-2.5 rounded-lg border p-3">
      <div className="mt-0.5 shrink-0">{icon}</div>
      <div className="min-w-0 flex-1">
        <p className="font-medium">{name}</p>
        <p className="text-xs text-muted-foreground mt-0.5">{detail}</p>
        <Link href={href} className="text-xs text-primary hover:underline inline-flex items-center gap-1 mt-1.5">
          {hrefLabel} <ArrowRight className="h-3 w-3" />
        </Link>
      </div>
    </div>
  );
}
