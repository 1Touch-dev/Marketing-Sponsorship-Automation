"use client";

import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toaster";
import { RefreshCw, Loader2, Archive, GitMerge, ExternalLink } from "lucide-react";
import { useRouter } from "next/navigation";

type QueueItem = Record<string, unknown>;

const STATUS_COLORS: Record<string, string> = {
  pending:  "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",
  synced:   "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300",
  failed:   "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300",
  skipped:  "bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300",
  archived: "bg-slate-100 text-slate-400 dark:bg-slate-800 dark:text-slate-500",
};

const PIPELINE_NAMES: Record<number, string> = {
  1: "Couto Pereira", 2: "Mídias", 3: "Patrocínios",
  4: "Licenciamento", 5: "Lei Incentivo",
};

export function CrmSyncManager({ queue }: { queue: QueueItem[] }) {
  const { toast } = useToast();
  const router = useRouter();
  const [loading, setLoading] = useState<string | null>(null);
  const [localQueue, setLocalQueue] = useState(queue);

  async function flushPending() {
    setLoading("flush");
    try {
      const res = await fetch("/api/crm", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "flush_pending" }),
      });
      const j = await res.json() as { retried: number; succeeded: number; failed: number };
      toast({ variant: "success", title: `Processed ${j.retried} pending items`, description: `${j.succeeded} synced to Pipedrive, ${j.failed} failed.` });
      router.refresh();
    } catch (err) {
      toast({ variant: "destructive", title: "Flush failed", description: err instanceof Error ? err.message : "Error" });
    } finally { setLoading(null); }
  }

  async function retryFailed() {
    setLoading("retry");
    try {
      const res = await fetch("/api/crm", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "retry_failed" }),
      });
      const j = await res.json() as { retried: number; succeeded: number };
      toast({ variant: "success", title: `Retried ${j.retried} failed jobs`, description: `${j.succeeded} synced successfully.` });
      router.refresh();
    } catch (err) {
      toast({ variant: "destructive", title: "Retry failed", description: err instanceof Error ? err.message : "Error" });
    } finally { setLoading(null); }
  }

  async function clearSynced() {
    setLoading("clear");
    try {
      await fetch("/api/crm", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "clear_synced" }),
      });
      toast({ variant: "success", title: "Synced jobs archived" });
      setLocalQueue(prev => prev.filter(q => q.status !== "synced"));
    } finally { setLoading(null); }
  }

  const hasFailed  = localQueue.some(q => q.status === "failed");
  const hasPending = localQueue.some(q => q.status === "pending");
  const hasSynced  = localQueue.some(q => q.status === "synced");

  return (
    <div className="space-y-4">
      {/* Action buttons */}
      <div className="flex gap-2 flex-wrap">
        {hasPending && (
          <Button size="sm" onClick={flushPending} disabled={!!loading} className="gap-1.5 bg-indigo-600 hover:bg-indigo-700 text-white">
            {loading === "flush" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
            Sync Pending to Pipedrive
          </Button>
        )}
        {hasFailed && (
          <Button size="sm" variant="outline" onClick={retryFailed} disabled={!!loading} className="gap-1.5 border-red-300 text-red-600 hover:bg-red-50">
            {loading === "retry" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
            Retry Failed
          </Button>
        )}
        {hasSynced && (
          <Button size="sm" variant="outline" onClick={clearSynced} disabled={!!loading} className="gap-1.5">
            {loading === "clear" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Archive className="h-3.5 w-3.5" />}
            Archive Synced
          </Button>
        )}
        <Button size="sm" variant="ghost" asChild className="gap-1.5 ml-auto">
          <a href="https://coritiba.pipedrive.com" target="_blank" rel="noopener noreferrer">
            <ExternalLink className="h-3.5 w-3.5" /> Open Pipedrive
          </a>
        </Button>
      </div>

      {localQueue.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground text-sm">
          <GitMerge className="h-8 w-8 mx-auto mb-3 opacity-20" />
          Nenhuma operação na fila ainda.<br />
          <span className="text-xs">Empresas e propostas serão sincronizadas automaticamente.</span>
        </div>
      ) : (
        <div className="space-y-2">
          {localQueue.map(item => {
            const payload = (item.payload as Record<string, unknown>) ?? {};
            const pipelineId = payload.pipedrive_pipeline_id as number | undefined;
            const dealId = payload.pipedrive_deal_id as number | undefined;
            const orgId = payload.pipedrive_org_id as number | undefined;
            const pipedriveId =
              dealId ?? orgId
              ?? (payload.pipedrive_result as Record<string, unknown> | undefined)?.pipedrive_deal_id as number | undefined
              ?? (payload.pipedrive_result as Record<string, unknown> | undefined)?.pipedrive_org_id as number | undefined;

            return (
              <div key={item.id as string} className="flex items-start gap-3 rounded-lg border bg-card p-3 text-sm">
                <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium flex-shrink-0 mt-0.5 ${STATUS_COLORS[item.status as string] ?? "bg-muted text-muted-foreground"}`}>
                  {(item.status as string).replace(/_/g, " ")}
                </span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="font-medium capitalize text-xs">{item.entity_type as string}</span>
                    <span className="text-muted-foreground text-[10px]">·</span>
                    <span className="text-muted-foreground text-[10px] capitalize">{item.operation as string}</span>
                    {pipelineId && (
                      <>
                        <span className="text-muted-foreground text-[10px]">·</span>
                        <span className="text-[10px] text-indigo-600">{PIPELINE_NAMES[pipelineId] ?? `Pipeline ${pipelineId}`}</span>
                      </>
                    )}
                  </div>
                  {pipedriveId && (
                    <div className="text-[10px] text-muted-foreground mt-0.5">
                      Pipedrive ID: <span className="font-mono">{pipedriveId}</span>
                    </div>
                  )}
                  {(payload.error as string) && (
                    <div className="text-[10px] text-red-600 mt-0.5">{payload.error as string}</div>
                  )}
                </div>
                <div className="text-[10px] text-muted-foreground flex-shrink-0 text-right">
                  <div>{new Date(item.created_at as string).toLocaleDateString("pt-BR")}</div>
                  <div>{new Date(item.created_at as string).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}</div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
