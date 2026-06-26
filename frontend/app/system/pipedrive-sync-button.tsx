"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { RefreshCw, CheckCircle2, XCircle } from "lucide-react";

export function PipedriveSyncButton() {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; processed?: number; results?: string[]; error?: string } | null>(null);

  async function runSync() {
    setLoading(true);
    setResult(null);
    try {
      const secret = process.env.NEXT_PUBLIC_INTERNAL_SECRET ?? "";
      const res = await fetch("/api/system/pipedrive-sync", {
        method: "POST",
        headers: { "Authorization": `Bearer ${secret}` },
      });
      const data = await res.json() as { ok: boolean; processed?: number; results?: string[]; error?: string };
      setResult(data);
    } catch (e) {
      setResult({ ok: false, error: String(e) });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-3">
      <Button onClick={runSync} disabled={loading} size="sm" className="gap-2">
        <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
        {loading ? "Running Sync…" : "Run Sync Now"}
      </Button>
      {result && (
        <div className={`rounded-lg border p-3 text-sm ${result.ok ? "bg-green-50 border-green-200" : "bg-red-50 border-red-200"}`}>
          <div className="flex items-center gap-2 font-medium mb-1">
            {result.ok ? (
              <CheckCircle2 className="h-4 w-4 text-green-600" />
            ) : (
              <XCircle className="h-4 w-4 text-red-600" />
            )}
            {result.ok ? `Sync complete — ${result.processed ?? 0} item(s) processed` : `Sync failed: ${result.error}`}
          </div>
          {result.results && result.results.length > 0 && (
            <ul className="mt-1 space-y-0.5 text-xs text-muted-foreground list-disc list-inside">
              {result.results.map((r, i) => <li key={i}>{r}</li>)}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
