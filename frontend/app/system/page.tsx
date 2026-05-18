import { PageHeader } from "@/components/shared/page-header";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { supabaseAdmin } from "@/lib/supabase/server";
import {
  CheckCircle2, AlertTriangle, Shield, Wrench, Database,
  Activity, RefreshCw, Archive, Trash2, XCircle
} from "lucide-react";
import { MaintenanceActions } from "./maintenance-actions";

export const dynamic = "force-dynamic";

const COMPETITOR_KEYWORDS = [
  "athletico", "furacão", "furacao", "corinthians", "flamengo",
  "palmeiras", "grêmio", "gremio", "internacional", "são paulo",
];

const TEST_KEYWORDS = ["test", "sample", "demo", "diagnostic", "example", "url co", "fix co"];

export default async function SystemMaintenancePage() {
  const sb = supabaseAdmin();

  const [failedWorkflows, stuckWorkflows, allProposals, allCompanies, validationFailures, auditLogs] = await Promise.all([
    sb.from("workflow_events").select("id, workflow_name, error_message, created_at").eq("status", "failed").order("created_at", { ascending: false }).limit(20),
    sb.from("workflow_events").select("id", { count: "exact", head: true }).in("status", ["started", "processing"]).lt("created_at", new Date(Date.now() - 30 * 60 * 1000).toISOString()),
    sb.from("proposals").select("id, title, status, status_reason").order("created_at", { ascending: false }).limit(100),
    sb.from("companies").select("id, company_name, status").order("created_at", { ascending: false }).limit(200),
    sb.from("audit_logs").select("id", { count: "exact", head: true }).like("action", "ai.validation_failed%"),
    sb.from("audit_logs").select("action, created_at, metadata").like("action", "system.maintenance%").order("created_at", { ascending: false }).limit(10),
  ]);

  const failedCount = failedWorkflows.data?.length ?? 0;
  const stuckCount = stuckWorkflows.count ?? 0;

  const competitorProposals = (allProposals.data ?? []).filter((p) =>
    p.status !== "rejected" && p.status !== "cancelled" &&
    COMPETITOR_KEYWORDS.some((k) => (p.title ?? "").toLowerCase().includes(k))
  );

  const testCompanies = (allCompanies.data ?? []).filter((c) =>
    c.status !== "closed" &&
    TEST_KEYWORDS.some((k) => (c.company_name ?? "").toLowerCase().includes(k))
  );

  const archivedCompetitor = (allProposals.data ?? []).filter((p) =>
    p.status_reason === "competitor_content_archived"
  );

  const isDemoReady = failedCount === 0 && stuckCount === 0 && competitorProposals.length === 0;

  const healthItems = [
    { label: "Failed workflows", value: failedCount, ok: failedCount === 0, icon: <Activity className="h-4 w-4" /> },
    { label: "Stuck workflows (>30min)", value: stuckCount, ok: stuckCount === 0, icon: <RefreshCw className="h-4 w-4" /> },
    { label: "Competitor proposals visible", value: competitorProposals.length, ok: competitorProposals.length === 0, icon: <Shield className="h-4 w-4" /> },
    { label: "Test companies visible", value: testCompanies.length, ok: testCompanies.length === 0, icon: <Database className="h-4 w-4" /> },
    { label: "AI validation failures (total)", value: validationFailures.count ?? 0, ok: true, icon: <CheckCircle2 className="h-4 w-4" />, note: "Historical — suppressed from dashboard" },
    { label: "Archived competitor proposals", value: archivedCompetitor.length, ok: true, icon: <Archive className="h-4 w-4" />, note: "Safely preserved, hidden from UI" },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="System Maintenance"
        description="Admin utilities for keeping the platform demo-ready and operationally clean"
      />

      {/* Demo readiness banner */}
      <div className={`rounded-xl border p-4 ${isDemoReady ? "bg-green-50 border-green-200" : "bg-amber-50 border-amber-200"}`}>
        <div className="flex items-center gap-3">
          {isDemoReady ? (
            <CheckCircle2 className="h-6 w-6 text-green-600 flex-shrink-0" />
          ) : (
            <AlertTriangle className="h-6 w-6 text-amber-600 flex-shrink-0" />
          )}
          <div>
            <p className={`text-sm font-semibold ${isDemoReady ? "text-green-800" : "text-amber-800"}`}>
              {isDemoReady ? "✓ Platform is Demo-Ready" : "⚠ Maintenance Recommended Before Demo"}
            </p>
            <p className={`text-xs mt-0.5 ${isDemoReady ? "text-green-700" : "text-amber-700"}`}>
              {isDemoReady
                ? "All systems healthy. No competitor content visible. Workflows clean."
                : `${[failedCount > 0 && `${failedCount} failed workflow(s)`, competitorProposals.length > 0 && `${competitorProposals.length} competitor proposal(s) visible`, testCompanies.length > 0 && `${testCompanies.length} test company(ies) visible`].filter(Boolean).join(", ")}.`}
            </p>
          </div>
        </div>
      </div>

      {/* Health overview */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Activity className="h-4 w-4" />
            System Health Overview
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {healthItems.map((item) => (
              <div
                key={item.label}
                className={`rounded-lg border p-3 flex items-start gap-3 ${item.ok ? "bg-green-50 border-green-200" : "bg-red-50 border-red-200"}`}
              >
                <div className={`mt-0.5 ${item.ok ? "text-green-600" : "text-red-600"}`}>
                  {item.ok ? <CheckCircle2 className="h-4 w-4" /> : <XCircle className="h-4 w-4" />}
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-medium">{item.label}</p>
                  <p className={`text-lg font-bold ${item.ok ? "text-green-700" : "text-red-700"}`}>{item.value}</p>
                  {item.note && <p className="text-xs text-muted-foreground">{item.note}</p>}
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Maintenance actions */}
      <MaintenanceActions
        failedCount={failedCount}
        stuckCount={stuckCount}
        competitorCount={competitorProposals.length}
        testCompanyCount={testCompanies.length}
      />

      {/* Competitor proposals detail */}
      {competitorProposals.length > 0 && (
        <Card className="border-red-200">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2 text-red-700">
              <Shield className="h-4 w-4" />
              Competitor Proposals Requiring Archival
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {competitorProposals.map((p) => (
              <div key={p.id} className="flex items-center justify-between p-2 rounded-md bg-red-50 border border-red-200">
                <p className="text-sm">{p.title}</p>
                <Badge variant="outline" className="text-red-700 border-red-300 text-xs">{p.status}</Badge>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Archived competitor proposals (for reference) */}
      {archivedCompetitor.length > 0 && (
        <Card className="border-green-200">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2 text-green-700">
              <Archive className="h-4 w-4" />
              Archived Competitor Proposals ({archivedCompetitor.length})
            </CardTitle>
            <CardDescription className="text-xs">Safely preserved in DB, hidden from operational UI</CardDescription>
          </CardHeader>
          <CardContent className="space-y-1">
            {archivedCompetitor.map((p) => (
              <div key={p.id} className="flex items-center justify-between p-2 rounded-md bg-muted/50">
                <p className="text-sm text-muted-foreground">{p.title}</p>
                <Badge variant="outline" className="text-xs">archived</Badge>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Failed workflow details */}
      {(failedWorkflows.data ?? []).length > 0 && (
        <Card className="border-amber-200">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2 text-amber-700">
              <AlertTriangle className="h-4 w-4" />
              Failed Workflows
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {(failedWorkflows.data ?? []).map((e) => (
              <div key={e.id} className="p-3 rounded-md bg-amber-50 border border-amber-200 space-y-1">
                <div className="flex items-center justify-between">
                  <Badge variant="outline" className="text-xs">{e.workflow_name}</Badge>
                  <span className="text-xs text-muted-foreground">{new Date(e.created_at).toLocaleDateString("pt-BR")}</span>
                </div>
                {e.error_message && <p className="text-xs text-amber-800">{e.error_message.slice(0, 200)}</p>}
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Maintenance history */}
      {(auditLogs.data ?? []).length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Wrench className="h-4 w-4 text-muted-foreground" />
              Maintenance History
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {(auditLogs.data ?? []).map((log, i) => (
              <div key={i} className="flex items-center justify-between p-2 rounded-md bg-muted/30">
                <div>
                  <p className="text-sm font-medium">{(log.metadata as Record<string, unknown>)?.action as string ?? log.action}</p>
                  <p className="text-xs text-muted-foreground">
                    {(log.metadata as Record<string, unknown>)?.count ? `${(log.metadata as Record<string, unknown>).count} items` : ""}
                  </p>
                </div>
                <span className="text-xs text-muted-foreground">{new Date(log.created_at).toLocaleDateString("pt-BR")}</span>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Info */}
      <Card className="border-dashed">
        <CardContent className="pt-4">
          <p className="text-sm font-medium text-muted-foreground mb-2">What this page manages</p>
          <div className="space-y-1.5 text-sm text-muted-foreground">
            <div className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-green-500" /> Competitor content archival — hide Athletico/rival proposals from operational UI</div>
            <div className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-green-500" /> Workflow failure resolution — mark old failures as resolved to clean dashboard</div>
            <div className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-green-500" /> Test data cleanup — archive diagnostic/test companies from active view</div>
            <div className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-green-500" /> Stale workflow detection — auto-fail workflows stuck for 30+ minutes</div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
