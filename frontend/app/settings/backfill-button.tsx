"use client";

import { useState } from "react";

export function BackfillButton() {
  const [status, setStatus] = useState<"idle" | "running" | "done" | "error">("idle");
  const [result, setResult] = useState<string | null>(null);

  async function run() {
    setStatus("running");
    setResult(null);
    try {
      const r = await fetch("/api/proposals/backfill-deliverables?limit=10", { method: "POST" });
      const j = await r.json() as { processed?: number; total_needing_backfill?: number; remaining?: number; error?: string };
      if (!r.ok) throw new Error(j.error ?? "Failed");
      const msg = j.processed === 0
        ? `✓ Nothing to backfill — all proposals have deliverables`
        : `✓ Processed ${j.processed} proposals. ${j.remaining} remaining.`;
      setResult(msg);
      setStatus("done");
    } catch (err) {
      setResult(`✗ ${err instanceof Error ? err.message : "Unknown error"}`);
      setStatus("error");
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <button
        disabled={status === "running"}
        onClick={run}
        className="inline-flex items-center gap-1.5 rounded-md border border-input bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground shadow-sm hover:bg-primary/90 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
      >
        {status === "running" ? (
          <>
            <span className="h-3 w-3 rounded-full border-2 border-primary-foreground border-t-transparent animate-spin" />
            Running…
          </>
        ) : (
          "Run backfill (10 proposals)"
        )}
      </button>
      {result && (
        <p className={`text-xs px-1 ${status === "done" ? "text-emerald-700 dark:text-emerald-400" : "text-red-600 dark:text-red-400"}`}>
          {result}
        </p>
      )}
    </div>
  );
}
