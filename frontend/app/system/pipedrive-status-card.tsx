"use client";

import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Key, RefreshCw, CheckCircle2, XCircle, AlertTriangle,
  Trash2, Clock, Activity,
} from "lucide-react";

type CrmStatus = {
  pipedrive_configured: boolean;
  api_valid: boolean;
  api_error?: string;
  last_synced_at: string | null;
  pending_count: number;
  recent_errors: Array<{ ts: string; path: string; method: string; error: string }>;
  stats: Record<string, number>;
};

export function PipedriveStatusCard() {
  const [status, setStatus] = useState<CrmStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [syncResult, setSyncResult] = useState<string | null>(null);

  const fetchStatus = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/crm?include_status=1");
      if (res.ok) {
        const data = await res.json() as CrmStatus;
        // validate structure before setting
        if (data && typeof data.pipedrive_configured === "boolean") {
          setStatus(data);
        }
      }
    } catch {
      // silently fail
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchStatus();
  }, [fetchStatus]);

  async function triggerSync() {
    setSyncing(true);
    setSyncResult(null);
    try {
      const res = await fetch("/api/crm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ entity_type: "manual", entity_id: "manual", operation: "create" }),
      });
      const data = await res.json() as { message?: string; sync_status?: string; error?: string };
      setSyncResult(data.message ?? data.sync_status ?? "Done");
      await fetchStatus();
    } catch (e) {
      setSyncResult(`Error: ${String(e)}`);
    } finally {
      setSyncing(false);
    }
  }

  async function clearFailed() {
    setClearing(true);
    try {
      await fetch("/api/crm", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "clear_failed" }),
      });
      await fetchStatus();
    } catch {
      // silently fail
    } finally {
      setClearing(false);
    }
  }

  const statusBadge = () => {
    if (!status) return null;
    if (!status.pipedrive_configured) {
      return <Badge variant="outline" className="text-slate-500 border-slate-300">Not configured</Badge>;
    }
    if (!status.api_valid) {
      return <Badge variant="outline" className="text-red-600 border-red-300 bg-red-50">Invalid API key</Badge>;
    }
    if (status.pending_count > 0) {
      return <Badge variant="outline" className="text-amber-600 border-amber-300 bg-amber-50">{status.pending_count} pending</Badge>;
    }
    return <Badge variant="outline" className="text-green-600 border-green-300 bg-green-50">Synced</Badge>;
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <Key className="h-4 w-4 text-orange-500" />
            Pipedrive Status
          </CardTitle>
          <div className="flex items-center gap-2">
            {statusBadge()}
            <Button size="sm" variant="ghost" onClick={fetchStatus} disabled={loading} className="h-7 w-7 p-0">
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
            </Button>
          </div>
        </div>
        <CardDescription className="text-xs">CRM integration health and sync queue</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Status grid */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="rounded-lg border p-3 text-center">
            <div className="text-xs text-muted-foreground mb-1">API Token</div>
            {!status ? (
              <div className="h-5 bg-muted animate-pulse rounded" />
            ) : status.pipedrive_configured && status.api_valid ? (
              <CheckCircle2 className="h-5 w-5 text-green-600 mx-auto" />
            ) : (
              <XCircle className="h-5 w-5 text-red-500 mx-auto" />
            )}
            <div className="text-[10px] text-muted-foreground mt-1">
              {!status ? "…" : status.pipedrive_configured ? (status.api_valid ? "Valid" : "Invalid") : "Missing"}
            </div>
          </div>

          <div className="rounded-lg border p-3 text-center">
            <div className="text-xs text-muted-foreground mb-1">Last Sync</div>
            <Clock className="h-5 w-5 text-blue-500 mx-auto" />
            <div className="text-[10px] text-muted-foreground mt-1">
              {!status ? "…" : status.last_synced_at
                ? new Date(status.last_synced_at).toLocaleTimeString("pt-BR")
                : "Never"}
            </div>
          </div>

          <div className="rounded-lg border p-3 text-center">
            <div className="text-xs text-muted-foreground mb-1">Pending</div>
            <div className={`text-xl font-bold ${(status?.pending_count ?? 0) > 0 ? "text-amber-600" : "text-green-600"}`}>
              {status?.pending_count ?? "—"}
            </div>
            <div className="text-[10px] text-muted-foreground mt-1">in queue</div>
          </div>

          <div className="rounded-lg border p-3 text-center">
            <div className="text-xs text-muted-foreground mb-1">Synced</div>
            <div className="text-xl font-bold text-emerald-600">{status?.stats?.synced ?? 0}</div>
            <div className="text-[10px] text-muted-foreground mt-1">total</div>
          </div>
        </div>

        {/* API error */}
        {status && !status.api_valid && status.api_error && (
          <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-700 flex items-start gap-2">
            <AlertTriangle className="h-3.5 w-3.5 flex-shrink-0 mt-0.5" />
            <span>{status.api_error}</span>
          </div>
        )}

        {/* Recent error log */}
        {status && (status.recent_errors ?? []).length > 0 && (
          <div className="space-y-1.5">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Last {(status.recent_errors ?? []).length} failed sync{(status.recent_errors ?? []).length !== 1 ? "s" : ""}</p>
            {(status.recent_errors ?? []).map((err, i) => (
              <div key={i} className="rounded-md border border-amber-200 bg-amber-50 p-2.5 text-xs space-y-0.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-mono text-amber-800">{err.method} {err.path}</span>
                  <span className="text-muted-foreground shrink-0">{new Date(err.ts).toLocaleTimeString("pt-BR")}</span>
                </div>
                <p className="text-amber-700 truncate">{err.error}</p>
              </div>
            ))}
          </div>
        )}

        {/* Sync result */}
        {syncResult && (
          <div className="rounded-lg border border-blue-200 bg-blue-50 p-2.5 text-xs text-blue-700 flex items-center gap-2">
            <Activity className="h-3.5 w-3.5 flex-shrink-0" />
            {syncResult}
          </div>
        )}

        {/* Actions */}
        <div className="flex items-center gap-2 flex-wrap">
          <Button
            size="sm"
            onClick={triggerSync}
            disabled={syncing}
            className="gap-1.5"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${syncing ? "animate-spin" : ""}`} />
            {syncing ? "Syncing…" : "Sync Now"}
          </Button>
          {(status?.stats?.failed ?? 0) > 0 && (
            <Button
              size="sm"
              variant="outline"
              onClick={clearFailed}
              disabled={clearing}
              className="gap-1.5 border-red-300 text-red-600 hover:bg-red-50 hover:text-red-700"
            >
              <Trash2 className="h-3.5 w-3.5" />
              {clearing ? "Clearing…" : `Clear ${status?.stats?.failed ?? 0} Failed`}
            </Button>
          )}
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              void fetch("/api/crm", {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ action: "retry_failed" }),
              }).then(() => fetchStatus());
            }}
            className="gap-1.5"
          >
            Retry Failed
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
