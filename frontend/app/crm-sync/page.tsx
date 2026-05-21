import { supabaseAdmin } from "@/lib/supabase/server";
import { PageHeader } from "@/components/shared/page-header";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { CrmSyncManager } from "./crm-sync-manager";
import { GitMerge, CheckCircle, Clock, AlertCircle, Zap } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function CrmSyncPage() {
  const sb = supabaseAdmin();

  const { data: queue } = await sb
    .from("crm_sync_queue" as "companies")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(200);

  const safeQueue = (queue ?? []) as Array<Record<string, unknown>>;
  const stats = safeQueue.reduce((acc: Record<string, number>, row) => {
    const s = row.status as string;
    acc[s] = (acc[s] ?? 0) + 1;
    return acc;
  }, {});

  const hasPipedrive = !!process.env.PIPEDRIVE_API_KEY;

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

      {/* Connection status banner */}
      <div className={`rounded-xl border p-4 mb-6 flex items-start gap-3 ${hasPipedrive
        ? "bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800"
        : "bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800"}`}>
        {hasPipedrive
          ? <CheckCircle className="h-5 w-5 text-green-600 mt-0.5 flex-shrink-0" />
          : <AlertCircle className="h-5 w-5 text-amber-600 mt-0.5 flex-shrink-0" />
        }
        <div className="flex-1">
          <div className={`font-semibold text-sm ${hasPipedrive ? "text-green-700 dark:text-green-300" : "text-amber-700 dark:text-amber-300"}`}>
            {hasPipedrive ? "✓ Pipedrive Conectado — Coritiba FC" : "Pipedrive Não Configurado"}
          </div>
          <div className={`text-xs mt-0.5 ${hasPipedrive ? "text-green-600 dark:text-green-400" : "text-amber-600 dark:text-amber-400"}`}>
            {hasPipedrive
              ? "Sync ativo — empresas e propostas sincronizam com Pipedrive automaticamente."
              : "Adicione PIPEDRIVE_API_KEY ao .env para ativar o sync."
            }
          </div>
        </div>
        {hasPipedrive && (
          <span className="text-xs bg-green-100 text-green-800 px-2 py-1 rounded-full font-medium flex-shrink-0">Live</span>
        )}
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        {[
          { label: "Pending", value: stats.pending ?? 0, icon: Clock, color: "amber" },
          { label: "Synced", value: stats.synced ?? 0, icon: CheckCircle, color: "green" },
          { label: "Failed", value: stats.failed ?? 0, icon: AlertCircle, color: "red" },
          { label: "Total", value: safeQueue.length, icon: GitMerge, color: "slate" },
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
            <p className="font-semibold text-slate-700 dark:text-slate-300">Estágios automáticos (Patrocínios):</p>
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
