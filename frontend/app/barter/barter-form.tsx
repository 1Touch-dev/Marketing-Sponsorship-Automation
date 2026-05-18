"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";

const CATEGORIES = ["product", "service", "technology", "media", "logistics", "food_beverage", "equipment", "other"];

export function BarterForm() {
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
      item_name: String(fd.get("item_name") ?? "").trim(),
      description: String(fd.get("description") ?? "").trim() || null,
      category: String(fd.get("category") ?? "product"),
      quantity: String(fd.get("quantity") ?? "").trim() || null,
      current_supplier: String(fd.get("current_supplier") ?? "").trim() || null,
      current_price: fd.get("current_price") ? Number(fd.get("current_price")) : null,
      target_price: fd.get("target_price") ? Number(fd.get("target_price")) : null,
      barter_type: String(fd.get("barter_type") ?? "full_barter"),
      priority: String(fd.get("priority") ?? "medium"),
      notes: String(fd.get("notes") ?? "").trim() || null,
    };
    try {
      const res = await fetch("/api/barter", {
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
          <Label htmlFor="item_name">Item / Service Name *</Label>
          <Input id="item_name" name="item_name" required placeholder="e.g. Printed banners for stadium" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="category">Category *</Label>
          <select id="category" name="category" className={selectCls} required>
            {CATEGORIES.map((c) => <option key={c} value={c}>{c.replace("_", " ").replace(/\b\w/g, (l) => l.toUpperCase())}</option>)}
          </select>
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="description">Description</Label>
        <Textarea id="description" name="description" rows={2} placeholder="What exactly is needed, specs, requirements..." />
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="quantity">Quantity / Frequency</Label>
          <Input id="quantity" name="quantity" placeholder="e.g. 50 units/month" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="current_supplier">Current Supplier</Label>
          <Input id="current_supplier" name="current_supplier" placeholder="Company name" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="current_price">Current Price (BRL)</Label>
          <Input id="current_price" name="current_price" type="number" placeholder="15000" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="target_price">Target Price (BRL)</Label>
          <Input id="target_price" name="target_price" type="number" placeholder="8000" />
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label htmlFor="barter_type">Barter Type</Label>
          <select id="barter_type" name="barter_type" className={selectCls}>
            <option value="full_barter">Full Barter (no cash)</option>
            <option value="partial_barter">Partial Barter (barter + payment)</option>
            <option value="negotiated_discount">Negotiated Discount via Sponsorship</option>
          </select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="priority">Priority</Label>
          <select id="priority" name="priority" className={selectCls}>
            <option value="high">High</option>
            <option value="medium">Medium</option>
            <option value="low">Low</option>
          </select>
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="notes">Notes / Strategy</Label>
        <Textarea id="notes" name="notes" rows={2} placeholder="Negotiation notes, leverage points, sponsorship offer ideas..." />
      </div>

      {error && <div className="text-sm text-destructive bg-destructive/10 rounded-md p-2">{error}</div>}
      {success && <div className="text-sm text-green-700 bg-green-50 rounded-md p-2">✓ Barter item added successfully</div>}

      <Button type="submit" disabled={saving}>
        <Plus className="h-4 w-4 mr-1" />
        {saving ? "Saving…" : "Add Barter Item"}
      </Button>
    </form>
  );
}
