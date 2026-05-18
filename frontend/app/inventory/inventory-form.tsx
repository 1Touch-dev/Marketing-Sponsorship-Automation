"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";

export function InventoryForm({
  physicalCategories,
  digitalCategories,
}: {
  physicalCategories: Record<string, string>;
  digitalCategories: Record<string, string>;
}) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [inventoryType, setInventoryType] = useState("physical");

  const selectCls = "w-full h-9 rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring";
  const catMap = inventoryType === "physical" ? physicalCategories : digitalCategories;

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    const fd = new FormData(e.currentTarget);
    const payload = {
      name: String(fd.get("name") ?? "").trim(),
      description: String(fd.get("description") ?? "").trim() || null,
      inventory_type: inventoryType,
      category: String(fd.get("category") ?? ""),
      price_min: fd.get("price_min") ? Number(fd.get("price_min")) : null,
      price_max: fd.get("price_max") ? Number(fd.get("price_max")) : null,
      unit: String(fd.get("unit") ?? "").trim() || null,
      availability: String(fd.get("availability") ?? "available"),
      exposure_reach: String(fd.get("exposure_reach") ?? "").trim() || null,
      placement_zone: String(fd.get("placement_zone") ?? "").trim() || null,
    };
    try {
      const res = await fetch("/api/inventory", {
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
      <div className="flex gap-2 mb-2">
        {["physical", "digital"].map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setInventoryType(t)}
            className={`px-3 py-1.5 rounded-md text-sm border transition-colors capitalize ${inventoryType === t ? "bg-primary text-primary-foreground border-primary" : "bg-background border-input hover:bg-muted"}`}
          >
            {t}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label htmlFor="name">Item Name *</Label>
          <Input id="name" name="name" required placeholder="e.g. Jersey Front — Principal Sponsor" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="category">Category *</Label>
          <select id="category" name="category" className={selectCls} required>
            {Object.entries(catMap).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="description">Description</Label>
        <Textarea id="description" name="description" rows={2} placeholder="Details about this inventory item..." />
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="price_min">Min Price (BRL)</Label>
          <Input id="price_min" name="price_min" type="number" placeholder="5000" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="price_max">Max Price (BRL)</Label>
          <Input id="price_max" name="price_max" type="number" placeholder="25000" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="unit">Unit</Label>
          <Input id="unit" name="unit" placeholder="per match" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="availability">Availability</Label>
          <select id="availability" name="availability" className={selectCls}>
            {["available", "limited", "sold"].map((s) => <option key={s} value={s} className="capitalize">{s.charAt(0).toUpperCase() + s.slice(1)}</option>)}
          </select>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label htmlFor="exposure_reach">Exposure / Reach</Label>
          <Input id="exposure_reach" name="exposure_reach" placeholder="e.g. 40K+ torcedores/jogo + TV nacional" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="placement_zone">Placement Zone</Label>
          <Input id="placement_zone" name="placement_zone" placeholder="e.g. jersey_chest, led_perimeter" />
        </div>
      </div>

      {error && <div className="text-sm text-destructive bg-destructive/10 rounded-md p-2">{error}</div>}
      {success && <div className="text-sm text-green-700 bg-green-50 rounded-md p-2">✓ Inventory item added</div>}

      <Button type="submit" disabled={saving}>
        <Plus className="h-4 w-4 mr-1" />
        {saving ? "Saving…" : "Add to Inventory"}
      </Button>
    </form>
  );
}
