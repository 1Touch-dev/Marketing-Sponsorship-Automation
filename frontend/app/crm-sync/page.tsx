import { supabaseAdmin } from "@/lib/supabase/server";
import { resolveTenantId } from "@/lib/tenants/current";
import { PageHeader } from "@/components/shared/page-header";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { CrmSyncManager } from "./crm-sync-manager";
import { CrmLinkChecker } from "./crm-link-checker";
import { RetryRecentFailures } from "./retry-recent-button";
import { ConnectionBanner } from "@/components/integrations/connection-banner";
import { pipedriveConnection } from "@/lib/pipedrive/status";
import { recentFailures } from "@/lib/integrations/log";
import { GitMerge, CheckCircle, Clock, AlertCircle, Zap } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function CrmSyncPage() {
  const sb = supabaseAdmin();
  const tenantId = await resolveTenantId();

  const { data: queue } = await sb
    .from("crm_sync_queue" as "companies")
    .select("*")
    .eq("tenant_id" as "id", tenantId)
    .order("created_at", { ascending: false })
    .limit(200);

  const safeQueue = (queue ?? []) as Array<Record<string, unknown>>;
  const stats = safeQueue.reduce((acc: Record<string, number>, row) => {
    const s = row.status as string;
    acc[s] = (acc[s] ?? 0) + 1;
    return acc;
  }, {});

  // The one connection record (also read by /pipeline, /system and the health endpoints). Opening this page asks Pipedrive
  // whether it accepts the key if that has not been checked in the last five minutes.
  const connection = await pipedriveConnection(sb, tenantId, { check: true });

  // What was actually sent in the last 30 days, from the log of calls (the queue below is the old record, kept as history)
  const since = new Date(Date.now() - 30 * 86400 * 1000).toISOString();
  const { data: recent } = await sb.from("integration_events" as "companies").select("outcome" as "id").eq("tenant_id" as "id", tenantId).eq("system" as "id", "pipedrive").gte("created_at", since).limit(5000);
  const pushes = ((recent ?? []) as unknown as Array<{ outcome: string }>).reduce((acc: Record<string, number>, r) => { acc[r.outcome] = (acc[r.outcome] ?? 0) + 1; return acc; }, {});
  const failures = await recentFailures(sb, tenantId, "pipedrive", 5);

  // Pipeline names for display
  const PIPELINE_NAMES: Record<number, string> = {
    1: "Couto Pereira",
    2: "Mídias",
    3: "Patrocínios",
    4: "Licenciamento / Varejo",
    5: "Lei Incentivo",
  };

  return (
    <>
      <PageHeader
        title="CRM Sync — Pipedrive"
        description="Live integration with Coritiba FC Pipedrive account"
      />

      <ConnectionBanner connection={connection} className="mb-6" />

      <RetryRecentFailures />
      <CrmLinkChecker />

      {/* What was sent, last 30 days */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-3">
        {[
          { label: "Sent OK (30 days)", value: pushes.succeeded ?? 0, icon: CheckCircle, color: "green" },
          { label: "Failed (30 days)", value: pushes.failed ?? 0, icon: AlertCircle, color: "red" },
          { label: "Not sent (30 days)", value: pushes.skipped ?? 0, icon: Clock, color: "amber" },
        ].map(s => (
          <Card key={s.label}>
            <CardContent className="pt-4 pb-3 flex items-center gap-3">
              <s.icon className={`h-5 w-5 flex-shrink-0 ${s.color === "green" ? "text-green-500" : s.color === "red" ? "text-red-500" : "text-amber-500"}`} />
              <div><div className="text-xl font-bold">{s.value}</div><div className="text-xs text-muted-foreground">{s.label}</div></div>
            </CardContent>
          </Card>
        ))}
      </div>
      {failures.length > 0 && (
        <Card className="mb-6 border-red-200">
          <CardHeader><CardTitle className="text-sm text-red-700">Latest failed calls</CardTitle></CardHeader>
          <CardContent className="space-y-1 text-xs">
            {failures.map((f, i) => (<div key={i} className="flex gap-2"><span className="text-muted-foreground w-36 flex-shrink-0">{new Date(f.ts).toLocaleString("pt-BR")}</span><span className="font-mono">{f.entity_type}/{f.operation}</span><span className="text-red-600">{f.error ?? `HTTP ${f.http_status ?? "?"}`}</span></div>))}
          </CardContent>
        </Card>
      )}

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        {[
          { label: "Earlier queue: pending", value: stats.pending ?? 0, icon: Clock, color: "amber" },
          { label: "Earlier queue: synced", value: stats.synced ?? 0, icon: CheckCircle, color: "green" },
          { label: "Earlier queue: failed", value: stats.failed ?? 0, icon: AlertCircle, color: "red" },
          { label: "Earlier queue: total", value: safeQueue.length, icon: GitMerge, color: "slate" },
        ].map(s => (
          <Card key={s.label}>
            <CardContent className="pt-4 pb-3 flex items-center gap-3">
              <s.icon className={`h-5 w-5 flex-shrink-0 ${
                s.color === "amber" ? "text-amber-500"
                : s.color === "green" ? "text-green-500"
                : s.color === "red" ? "text-red-500"
                : "text-muted-foreground"}`} />
              <div>
                <div className="text-xl font-bold">{s.value}</div>
                <div className="text-xs text-muted-foreground">{s.label}</div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Pipeline mapping */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Zap className="h-4 w-4 text-indigo-500" /> Pipelines Mapeados
          </CardTitle>
          <CardDescription>Como nossa plataforma mapeia para os pipelines do Pipedrive</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {[
              { from: "Nova Empresa", to: "Organization", pipe: "Todos os pipelines", icon: "🏢" },
              { from: "Proposta (Patrocínio)", to: "Deal", pipe: PIPELINE_NAMES[3], icon: "📄" },
              { from: "Proposta (Lei Incentivo)", to: "Deal", pipe: PIPELINE_NAMES[5], icon: "⚖️" },
              { from: "Proposta (Mídias)", to: "Deal", pipe: PIPELINE_NAMES[2], icon: "📱" },
              { from: "Proposta (Licenciamento)", to: "Deal", pipe: PIPELINE_NAMES[4], icon: "👕" },
              { from: "Status Mudança", to: "Deal Stage Update", pipe: "Automático", icon: "🔄" },
            ].map(m => (
              <div key={m.from} className="flex items-start gap-3 p-3 rounded-lg border bg-card">
                <span className="text-lg flex-shrink-0">{m.icon}</span>
                <div>
                  <div className="text-xs font-semibold">{m.from}</div>
                  <div className="text-xs text-muted-foreground">→ {m.to}</div>
                  <div className="text-[10px] text-indigo-600 mt-0.5">{m.pipe}</div>
                </div>
                <CheckCircle className="h-3.5 w-3.5 text-green-500 ml-auto mt-0.5 flex-shrink-0" />
              </div>
            ))}
          </div>

          <div className="mt-4 p-3 rounded-lg bg-slate-50 dark:bg-slate-800 text-xs space-y-1">
            <p className="font-semibold text-slate-700 dark:text-slate-300">Proposal status → Pipedrive deal (Patrocínios)</p>
            <p className="text-[10px] text-muted-foreground">This maps a proposal&apos;s status to a Pipedrive deal. Company columns on /pipeline are a separate board.</p>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-1 mt-1">
              {[
                { status: "draft / under_review", stage: "Elaborar Proposta (21)" },
                { status: "approved", stage: "Negociação (20)" },
                { status: "sent", stage: "Negociação (20)" },
                { status: "rejected", stage: "Perda (automático)" },
              ].map(s => (
                <div key={s.status} className="text-[10px] text-muted-foreground">
                  <span className="font-medium text-foreground">{s.status}</span> → {s.stage}
                </div>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Sync queue */}
      <Card>
        <CardHeader>
          <CardTitle>Fila de Sync</CardTitle>
          <CardDescription>Histórico de todas as operações sincronizadas com Pipedrive</CardDescription>
        </CardHeader>
        <CardContent>
          <CrmSyncManager queue={safeQueue} />
        </CardContent>
      </Card>
    </>
  );
}
