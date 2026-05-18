"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";

export function CoritibMetricForm({ categories }: { categories: string[] }) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const selectCls = "w-full h-9 rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring";

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    const fd = new FormData(e.currentTarget);
    const payload = {
      category: String(fd.get("category") ?? ""),
      metric_name: String(fd.get("metric_name") ?? "").trim(),
      metric_value: String(fd.get("metric_value") ?? "").trim(),
      unit: String(fd.get("unit") ?? "").trim() || null,
      description: String(fd.get("description") ?? "").trim() || null,
      source: String(fd.get("source") ?? "").trim() || null,
      is_featured: fd.get("is_featured") === "on",
    };
    try {
      const res = await fetch("/api/coritiba-metrics", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j?.error ?? `Save failed (${res.status})`);
      }
      (e.target as HTMLFormElement).reset();
      setSuccess(true);
      router.refresh();
      setTimeout(() => setSuccess(false), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label htmlFor="category">Category *</Label>
          <select id="category" name="category" className={selectCls} required>
            {categories.map((c) => (
              <option key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1)}</option>
            ))}
          </select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="metric_name">Metric Name *</Label>
          <Input id="metric_name" name="metric_name" required placeholder="e.g. Stadium capacity" />
        </div>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
        <div className="space-y-1.5 col-span-1 sm:col-span-1">
          <Label htmlFor="metric_value">Value *</Label>
          <Input id="metric_value" name="metric_value" required placeholder="e.g. 40.502" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="unit">Unit</Label>
          <Input id="unit" name="unit" placeholder="e.g. lugares, %, R$" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="source">Source</Label>
          <Input id="source" name="source" placeholder="e.g. IBGE 2024" />
        </div>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="description">Description</Label>
        <Textarea id="description" name="description" rows={2} placeholder="Context about this metric..." />
      </div>
      <div className="flex items-center gap-2">
        <input type="checkbox" id="is_featured" name="is_featured" className="rounded" />
        <Label htmlFor="is_featured" className="cursor-pointer">Feature in proposal hero stats</Label>
      </div>
      {error && <div className="text-sm text-destructive bg-destructive/10 rounded-md p-2">{error}</div>}
      {success && <div className="text-sm text-green-700 bg-green-50 rounded-md p-2">✓ Metric added successfully</div>}
      <Button type="submit" disabled={saving}>
        <Plus className="h-4 w-4 mr-1" />
        {saving ? "Saving…" : "Add Metric"}
      </Button>
    </form>
  );
}
