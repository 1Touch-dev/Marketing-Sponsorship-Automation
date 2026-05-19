"use client";

import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toaster";
import { RefreshCw, Loader2, Archive, CheckCircle, Clock, AlertCircle, GitMerge } from "lucide-react";

type QueueItem = Record<string, unknown>;

const STATUS_COLORS: Record<string, string> = {
  pending: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",
  synced: "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300",
  failed: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300",
  skipped: "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400",
  archived: "bg-slate-100 text-slate-400 dark:bg-slate-800 dark:text-slate-500",
};

export function CrmSyncManager({ queue }: { queue: QueueItem[] }) {
  const { toast } = useToast();
  const [loading, setLoading] = useState<string | null>(null);
  const [localQueue, setLocalQueue] = useState(queue);

  async function retryFailed() {
    setLoading("retry");
    try {
      const res = await fetch("/api/crm", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "retry_failed" }) });
      const j = await res.json() as { retried: number };
      toast({ variant: "success", title: `${j.retried} failed jobs reset`, description: "They will be retried on next sync." });
      setLocalQueue(prev => prev.map(q => q.status === "failed" ? { ...q, status: "pending" } : q));
    } finally { setLoading(null); }
  }

  async function clearSynced() {
    setLoading("clear");
    try {
      await fetch("/api/crm", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "clear_synced" }) });
      toast({ variant: "success", title: "Synced jobs archived" });
      setLocalQueue(prev => prev.filter(q => q.status !== "synced"));
    } finally { setLoading(null); }
  }

  const hasFailed = localQueue.some(q => q.status === "failed");

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        {hasFailed && (
          <Button size="sm" variant="outline" onClick={retryFailed} disabled={!!loading} className="gap-1.5">
            {loading === "retry" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
            Retry Failed
          </Button>
        )}
        <Button size="sm" variant="outline" onClick={clearSynced} disabled={!!loading} className="gap-1.5">
          {loading === "clear" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Archive className="h-3.5 w-3.5" />}
          Archive Synced
        </Button>
      </div>

      {localQueue.length === 0 ? (
        <div className="text-center py-10 text-muted-foreground text-sm">
          <GitMerge className="h-8 w-8 mx-auto mb-3 opacity-20" />
          No sync operations queued yet.<br />
          <span className="text-xs">Operations will be queued when you create companies, proposals, or leads.</span>
        </div>
      ) : (
        <div className="space-y-2">
          {localQueue.map(item => (
            <div key={item.id as string} className="flex items-center gap-3 rounded-lg border bg-card p-3 text-sm">
              <span className={`text-xs px-2 py-0.5 rounded-full font-medium flex-shrink-0 ${STATUS_COLORS[item.status as string] ?? "bg-muted text-muted-foreground"}`}>
                {(item.status as string).replace(/_/g, " ")}
              </span>
              <div className="flex-1 min-w-0">
                <span className="font-medium capitalize">{item.entity_type as string}</span>
                <span className="text-muted-foreground mx-1">·</span>
                <span className="text-muted-foreground capitalize">{item.operation as string}</span>
              </div>
              <div className="text-xs text-muted-foreground flex-shrink-0">
                → {item.crm_entity_type as string ?? "deal"}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
