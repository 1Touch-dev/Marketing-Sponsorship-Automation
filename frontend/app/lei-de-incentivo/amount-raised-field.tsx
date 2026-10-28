"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";

export function AmountRaisedField({
  projectId,
  budgetRaised,
  budgetTotal,
}: {
  projectId: string;
  budgetRaised: number;
  budgetTotal: number;
}) {
  const router = useRouter();
  const [value, setValue] = useState(String(budgetRaised || 0));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSave() {
    setSaving(true);
    setError(null);
    const n = Number(value);
    if (!Number.isFinite(n) || n < 0) {
      setError("Amount raised must be a number ≥ 0");
      setSaving(false);
      return;
    }
    try {
      const res = await fetch(`/api/social-projects/${projectId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ budget_raised: n }),
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
    <div className="mt-3 space-y-1.5">
      <Label htmlFor={`amount-raised-${projectId}`} className="text-xs">Amount raised (BRL)</Label>
      <div className="flex flex-wrap items-center gap-2">
        <Input
          id={`amount-raised-${projectId}`}
          type="number"
          min={0}
          step="0.01"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          className="h-8 w-36 text-sm"
        />
        <Button type="button" size="sm" onClick={onSave} disabled={saving}>
          {saving ? "Saving…" : "Save"}
        </Button>
        {budgetTotal > 0 && (
          <span className="text-xs text-muted-foreground">
            R$ {Number(value || 0).toLocaleString("pt-BR")} / R$ {budgetTotal.toLocaleString("pt-BR")}
          </span>
        )}
      </div>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
