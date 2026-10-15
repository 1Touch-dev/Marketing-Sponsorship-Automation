"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Loader2, RefreshCw } from "lucide-react";

type RetryResult = { retried: number; succeeded: number; failed: number; message?: string };

export function RetryRecentFailures() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<RetryResult | null>(null);

  async function retry() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/crm", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "retry_recent_failures" }),
      });
      const body = await res.json().catch(() => ({})) as Partial<RetryResult> & { error?: unknown };
      if (!res.ok) {
        setResult(null);
        setError(typeof body.error === "string" ? body.error : `Request failed (${res.status})`);
        return;
      }
      setResult({
        retried: body.retried ?? 0,
        succeeded: body.succeeded ?? 0,
        failed: body.failed ?? 0,
      });
    } catch (err) {
      setResult(null);
      setError(err instanceof Error ? err.message : "Request failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mb-6 space-y-2">
      <Button type="button" size="sm" variant="outline" onClick={() => void retry()} disabled={loading} className="gap-1.5">
        {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
        Retry recent failures
      </Button>
      {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
      {result && (
        <p className="text-sm text-muted-foreground">
          Retried {result.retried}: {result.succeeded} synced, {result.failed} failed.
        </p>
      )}
    </div>
  );
}
