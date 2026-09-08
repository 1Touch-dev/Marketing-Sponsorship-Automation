"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/**
 * Phase 5 — triggers app/api/proposals/detect-cold. Session-protected like
 * every other scheduler-pattern endpoint in this codebase (advance,
 * sync-threads) — an authenticated admin click is what actually invokes it
 * today; wiring an unattended n8n/cron trigger needs a separate internal-
 * auth mechanism these endpoints don't have yet.
 */
export function DetectColdButton() {
  const router = useRouter();
  const [status, setStatus] = useState<"idle" | "running" | "error">("idle");
  const [result, setResult] = useState<string | null>(null);

  async function run() {
    setStatus("running");
    setResult(null);
    try {
      const r = await fetch("/api/proposals/detect-cold", { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
      const j = (await r.json()) as { checked?: number; results?: Array<{ action: string }>; error?: string };
      if (!r.ok) throw new Error(j.error ?? "Failed");
      const created = (j.results ?? []).filter((x) => x.action === "nudge_created").length;
      setResult(created > 0 ? `✓ Checked ${j.checked} proposals, queued ${created} nudge(s)` : `✓ Checked ${j.checked} proposals — nothing gone cold`);
      setStatus("idle");
      router.refresh();
    } catch (err) {
      setResult(`✗ ${err instanceof Error ? err.message : "Unknown error"}`);
      setStatus("error");
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        disabled={status === "running"}
        onClick={run}
        className="inline-flex items-center gap-1.5 rounded-md border border-input bg-background px-3 py-1.5 text-xs font-medium shadow-sm hover:bg-accent transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
      >
        {status === "running" ? "Checking…" : "Detect gone-cold proposals"}
      </button>
      {result && (
        <p className={`text-xs ${status === "error" ? "text-red-600 dark:text-red-400" : "text-emerald-700 dark:text-emerald-400"}`}>{result}</p>
      )}
    </div>
  );
}
