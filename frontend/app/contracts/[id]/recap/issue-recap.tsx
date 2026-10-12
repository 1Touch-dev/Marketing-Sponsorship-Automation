"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function IssueRecap({ contractId, gapCount }: { contractId: string; gapCount: number }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [acknowledgement, setAcknowledgement] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const needsAck = gapCount > 0;
  const ready = !needsAck || acknowledgement.trim().length >= 10;

  async function issue() {
    if (!ready) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/contracts/${contractId}/recap/issue`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(needsAck ? { acknowledgement } : {}),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(typeof body.error === "string" ? body.error : "This recap could not be issued.");
        return;
      }
      setOpen(false);
      setAcknowledgement("");
      router.refresh();
    } catch {
      setError("This recap could not be issued.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3">
      <button
        type="button"
        onClick={() => { setOpen(true); setError(null); }}
        className="inline-flex items-center rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
      >
        Issue this recap
      </button>
      {open && (
        <div role="dialog" aria-labelledby="issue-recap-title" className="max-w-xl space-y-3 rounded-xl border bg-card p-4">
          <h2 id="issue-recap-title" className="text-base font-semibold">Issue this recap</h2>
          {needsAck ? (
            <>
              <p className="text-sm text-muted-foreground">
                This recap has {gapCount} gap{gapCount === 1 ? "" : "s"}. Issuing it needs a written acknowledgement of at least 10 characters that those gaps exist.
              </p>
              <label className="block text-xs font-medium" htmlFor="recap-acknowledgement">Acknowledgement</label>
              <textarea
                id="recap-acknowledgement"
                value={acknowledgement}
                onChange={(event) => setAcknowledgement(event.target.value)}
                rows={3}
                className="w-full rounded-md border bg-background px-3 py-2 text-sm"
              />
            </>
          ) : (
            <p className="text-sm text-muted-foreground">This recap has no gaps. Issuing it saves this version as it stands.</p>
          )}
          {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={issue}
              disabled={busy || !ready}
              className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
            >
              {busy ? "Issuing…" : "Issue"}
            </button>
            <button type="button" onClick={() => setOpen(false)} className="rounded-lg border px-4 py-2 text-sm font-medium">
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
