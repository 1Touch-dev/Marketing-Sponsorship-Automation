"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import {
  BARTER_STATUSES,
  BARTER_STATUS_LABELS,
  BARTER_TYPES,
  BARTER_TYPE_LABELS,
} from "@/lib/barter/parse";

const selectCls = "h-8 rounded-md border border-input bg-background px-2 py-1 text-xs shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring";

export function BarterItemEditor({
  itemId,
  status,
  barterType,
  targetPrice,
}: {
  itemId: string;
  status: string;
  barterType: string;
  targetPrice: number | null;
}) {
  const router = useRouter();
  const [nextStatus, setNextStatus] = useState(status || "open");
  const [nextType, setNextType] = useState(barterType || "full_barter");
  const [nextTarget, setNextTarget] = useState(targetPrice == null ? "" : String(targetPrice));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSave() {
    setSaving(true);
    setError(null);
    const payload: Record<string, unknown> = {
      status: nextStatus,
      barter_type: nextType,
      target_price: nextTarget === "" ? null : Number(nextTarget),
    };
    if (payload.target_price !== null && (!Number.isFinite(payload.target_price as number) || (payload.target_price as number) < 0)) {
      setError("Target / negotiated price must be a number ≥ 0");
      setSaving(false);
      return;
    }
    try {
      const res = await fetch(`/api/barter/${itemId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j?.error ?? `Save failed (${res.status})`);
      }
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mt-3 space-y-2 border-t pt-3">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
        <div className="space-y-1">
          <Label htmlFor={`barter-status-${itemId}`} className="text-xs">Status</Label>
          <select
            id={`barter-status-${itemId}`}
            className={`${selectCls} w-full`}
            value={nextStatus}
            onChange={(e) => setNextStatus(e.target.value)}
          >
            {BARTER_STATUSES.map((s) => (
              <option key={s} value={s}>{BARTER_STATUS_LABELS[s]}</option>
            ))}
          </select>
        </div>
        <div className="space-y-1">
          <Label htmlFor={`barter-type-${itemId}`} className="text-xs">Barter Type</Label>
          <select
            id={`barter-type-${itemId}`}
            className={`${selectCls} w-full`}
            value={nextType}
            onChange={(e) => setNextType(e.target.value)}
          >
            {BARTER_TYPES.map((t) => (
              <option key={t} value={t}>{BARTER_TYPE_LABELS[t]}</option>
            ))}
          </select>
        </div>
        <div className="space-y-1">
          <Label htmlFor={`barter-target-${itemId}`} className="text-xs">Target / negotiated price (BRL)</Label>
          <Input
            id={`barter-target-${itemId}`}
            type="number"
            min={0}
            step="0.01"
            value={nextTarget}
            onChange={(e) => setNextTarget(e.target.value)}
            placeholder="e.g. 1500"
            className="h-8 text-xs"
          />
        </div>
      </div>
      <Button type="button" size="sm" onClick={onSave} disabled={saving}>
        {saving ? "Saving…" : "Save"}
      </Button>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
