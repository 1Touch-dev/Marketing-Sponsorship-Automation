"use client";

import { useState } from "react";

/**
 * Hardening pass (master_report.md Section 8, Pattern 6) — one-click
 * integration kill switch. Revokes the Gmail token at Google and clears it
 * from our storage, then reloads so the settings page reflects "Not connected".
 */
export function GmailDisconnectButton() {
  const [status, setStatus] = useState<"idle" | "running" | "error">("idle");
  const [error, setError] = useState<string | null>(null);

  async function disconnect() {
    if (!confirm("Disconnect Gmail? This revokes access at Google and stops reply-sync.")) return;
    setStatus("running");
    setError(null);
    try {
      const r = await fetch("/api/auth/gmail/disconnect", { method: "POST" });
      const j = (await r.json()) as { error?: string };
      if (!r.ok) throw new Error(j.error ?? "Failed to disconnect");
      window.location.reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
      setStatus("error");
    }
  }

  return (
    <div className="flex flex-col gap-1">
      <button
        disabled={status === "running"}
        onClick={disconnect}
        className="inline-flex items-center gap-1.5 rounded-md border border-red-200 bg-white px-3 py-1.5 text-xs font-medium text-red-700 shadow-sm hover:bg-red-50 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
      >
        {status === "running" ? "Disconnecting…" : "Disconnect Gmail"}
      </button>
      {error && <p className="text-xs text-red-600 px-1">✗ {error}</p>}
    </div>
  );
}
