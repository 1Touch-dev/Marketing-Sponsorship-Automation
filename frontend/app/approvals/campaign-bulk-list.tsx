"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/shared/status-badge";
import { formatDate, truncate } from "@/lib/utils";

export type CampaignBulkRow = {
  id: string;
  title: string;
  status: string;
  createdAt: string;
  companyName: string;
};

export function CampaignBulkList({ campaigns }: { campaigns: CampaignBulkRow[] }) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [pending, setPending] = useState<"approved" | "rejected" | null>(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<{ current: number; total: number } | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const ids = campaigns.map((c) => c.id);
  const selectedIds = ids.filter((id) => selected.has(id));
  const allSelected = ids.length > 0 && selectedIds.length === ids.length;

  function setSelection(next: Set<string>) {
    setSelected(next);
    if (next.size === 0) setPending(null);
  }

  function toggle(id: string) {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelection(next);
  }

  function toggleAll() {
    setSelection(allSelected ? new Set() : new Set(ids));
  }

  async function confirm() {
    if (!pending || selectedIds.length === 0 || busy) return;
    const status = pending;
    const total = selectedIds.length;
    setBusy(true);
    setProgress({ current: 1, total });
    const nextErrors: Record<string, string> = {};
    const succeeded = new Set<string>();

    for (let index = 0; index < selectedIds.length; index += 1) {
      const id = selectedIds[index];
      setProgress({ current: index + 1, total });
      try {
        const res = await fetch(`/api/campaigns/${id}/status`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status }),
        });
        if (res.ok) {
          succeeded.add(id);
        } else {
          const body = (await res.json().catch(() => ({}))) as { error?: unknown };
          nextErrors[id] =
            typeof body.error === "string" ? body.error : "Could not update this campaign";
        }
      } catch {
        nextErrors[id] = "Could not update this campaign";
      }
    }

    setErrors((prev) => {
      const merged = { ...prev };
      for (const id of succeeded) delete merged[id];
      return { ...merged, ...nextErrors };
    });
    setSelected((prev) => {
      const next = new Set(prev);
      for (const id of succeeded) next.delete(id);
      return next;
    });
    setPending(null);
    setProgress(null);
    setBusy(false);
    router.refresh();
  }

  const count = selectedIds.length;
  const verb = pending === "rejected" ? "Reject" : "Approve";
  const noun = count === 1 ? "campaign" : "campaigns";

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={allSelected}
            onChange={toggleAll}
            aria-label="Select all campaigns on this page"
          />
          Select all
        </label>
        <Button
          type="button"
          size="sm"
          disabled={count === 0 || busy}
          onClick={() => setPending("approved")}
        >
          Approve selected
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={count === 0 || busy}
          onClick={() => setPending("rejected")}
        >
          Reject selected
        </Button>
      </div>

      {pending && count > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-md border bg-muted/40 px-3 py-2 text-sm">
          <span>
            {verb} {count} {noun}?
          </span>
          <Button type="button" size="sm" disabled={busy} onClick={() => void confirm()}>
            {busy ? "Saving…" : "Confirm"}
          </Button>
          {busy && progress && (
            <span className="text-muted-foreground">
              Updating {progress.current} of {progress.total}
            </span>
          )}
          <Button type="button" size="sm" variant="ghost" disabled={busy} onClick={() => setPending(null)}>
            Cancel
          </Button>
        </div>
      )}

      {campaigns.map((c) => (
        <div key={c.id} className="rounded-lg border bg-card">
          <div className="flex items-center gap-3 p-4">
            <input
              type="checkbox"
              checked={selected.has(c.id)}
              onChange={() => toggle(c.id)}
              aria-label={`Select ${c.title}`}
              className="shrink-0"
            />
            <Link
              href={`/campaigns/${c.id}`}
              className="flex min-w-0 flex-1 items-center justify-between gap-3 hover:opacity-80"
            >
              <div className="min-w-0">
                <div className="font-medium text-sm">{truncate(c.title, 90)}</div>
                <div className="text-xs text-muted-foreground">
                  {c.companyName} · {formatDate(c.createdAt)}
                </div>
              </div>
              <StatusBadge status={c.status} />
            </Link>
          </div>
          {errors[c.id] && (
            <p role="alert" className="px-4 pb-3 text-xs text-destructive">{errors[c.id]}</p>
          )}
        </div>
      ))}
    </div>
  );
}
