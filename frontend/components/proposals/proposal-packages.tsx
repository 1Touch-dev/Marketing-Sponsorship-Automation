"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/ui/toaster";
import {
  Package, Plus, Pencil, Trash2, X, DollarSign, Star,
  ChevronDown, ChevronUp, Loader2, CheckCircle2,
} from "lucide-react";

type PackageItem = {
  id: string;
  proposal_id: string;
  name: string;
  description: string | null;
  price_brl: number | null;
  benefits: string[];
  inventory_items: Record<string, unknown>[];
  sort_order: number;
  active: boolean;
};

const PACKAGE_PRESETS = [
  { name: "Prata", description: "Pacote inicial de visibilidade", color: "bg-slate-100 text-slate-700 border-slate-300" },
  { name: "Ouro", description: "Pacote intermediário de alto impacto", color: "bg-amber-50 text-amber-700 border-amber-300" },
  { name: "Diamante", description: "Pacote premium com máxima exposição", color: "bg-purple-50 text-purple-700 border-purple-300" },
];

function formatBRL(value: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 }).format(value);
}

function PackageForm({
  proposalId,
  initialData,
  onSaved,
  onCancel,
}: {
  proposalId: string;
  initialData?: PackageItem;
  onSaved: (p: PackageItem) => void;
  onCancel: () => void;
}) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [benefits, setBenefits] = useState<string[]>(initialData?.benefits ?? []);
  const [newBenefit, setNewBenefit] = useState("");
  const isEdit = !!initialData?.id;

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    const fd = new FormData(e.currentTarget);
    const priceRaw = String(fd.get("price_brl") ?? "").trim();
    const payload = {
      name: String(fd.get("name") ?? "").trim(),
      description: String(fd.get("description") ?? "").trim() || null,
      price_brl: priceRaw ? parseFloat(priceRaw) : null,
      benefits,
      inventory_items: initialData?.inventory_items ?? [],
    };

    try {
      const url = isEdit
        ? `/api/proposals/${proposalId}/packages/${initialData!.id}`
        : `/api/proposals/${proposalId}/packages`;
      const method = isEdit ? "PATCH" : "POST";
      const res = await fetch(url, {
        method,
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j?.error ?? `Save failed (${res.status})`);
      }
      const { data } = await res.json();
      const parsed = {
        ...data,
        benefits: typeof data.benefits === "string" ? JSON.parse(data.benefits) : (data.benefits ?? []),
        inventory_items: typeof data.inventory_items === "string" ? JSON.parse(data.inventory_items) : (data.inventory_items ?? []),
      };
      onSaved(parsed as PackageItem);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4 p-4 border rounded-xl bg-slate-50">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-slate-700">{isEdit ? "Edit Package" : "New Package"}</h3>
        <button type="button" onClick={onCancel} className="text-slate-400 hover:text-slate-600">
          <X className="h-4 w-4" />
        </button>
      </div>

      {!isEdit && (
        <div className="flex gap-2 flex-wrap">
          {PACKAGE_PRESETS.map(p => (
            <button
              key={p.name}
              type="button"
              onClick={() => {
                const nameEl = document.getElementById("pkg-name") as HTMLInputElement;
                const descEl = document.getElementById("pkg-desc") as HTMLTextAreaElement;
                if (nameEl) nameEl.value = p.name;
                if (descEl) descEl.value = p.description;
              }}
              className={`text-xs px-3 py-1 rounded-full border font-medium ${p.color} hover:opacity-80`}
            >
              {p.name}
            </button>
          ))}
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="pkg-name" className="text-xs">Package Name *</Label>
          <Input id="pkg-name" name="name" required defaultValue={initialData?.name} placeholder="Ouro" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="pkg-price" className="text-xs">Price (BRL)</Label>
          <div className="relative">
            <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              id="pkg-price" name="price_brl" type="number" min={0}
              defaultValue={initialData?.price_brl ?? undefined}
              placeholder="50000"
              className="pl-8"
            />
          </div>
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="pkg-desc" className="text-xs">Description</Label>
        <Textarea id="pkg-desc" name="description" rows={2} defaultValue={initialData?.description ?? undefined}
          placeholder="Pacote intermediário com alta visibilidade nas plataformas digitais e no estádio." />
      </div>

      <div className="space-y-2">
        <Label className="text-xs">Benefits</Label>
        <div className="space-y-1.5">
          {benefits.map((b, idx) => (
            <div key={idx} className="flex items-center gap-2">
              <CheckCircle2 className="h-3.5 w-3.5 text-green-500 shrink-0" />
              <span className="text-xs flex-1">{b}</span>
              <button type="button" onClick={() => setBenefits(prev => prev.filter((_, i) => i !== idx))}
                className="text-slate-300 hover:text-red-500">
                <X className="h-3 w-3" />
              </button>
            </div>
          ))}
          <div className="flex gap-2">
            <Input
              value={newBenefit}
              onChange={e => setNewBenefit(e.target.value)}
              onKeyDown={e => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  if (newBenefit.trim()) { setBenefits(prev => [...prev, newBenefit.trim()]); setNewBenefit(""); }
                }
              }}
              placeholder="Adicionar benefício e pressionar Enter…"
              className="text-xs h-8"
            />
            <Button
              type="button" size="sm" variant="outline"
              onClick={() => { if (newBenefit.trim()) { setBenefits(prev => [...prev, newBenefit.trim()]); setNewBenefit(""); } }}
            >
              <Plus className="h-3 w-3" />
            </Button>
          </div>
        </div>
      </div>

      {error && <div className="text-sm text-destructive bg-destructive/10 rounded-md p-2">{error}</div>}

      <div className="flex gap-2">
        <Button type="submit" disabled={saving} size="sm">
          {saving ? "Saving…" : isEdit ? "Save Changes" : "Add Package"}
        </Button>
        <Button type="button" variant="outline" size="sm" onClick={onCancel}>Cancel</Button>
      </div>
    </form>
  );
}

interface ProposalPackagesProps {
  proposalId: string;
}

export function ProposalPackages({ proposalId }: ProposalPackagesProps) {
  const router = useRouter();
  const { toast } = useToast();
  const [packages, setPackages] = useState<PackageItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editPkg, setEditPkg] = useState<PackageItem | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/proposals/${proposalId}/packages`);
      if (res.ok) {
        const { data } = await res.json() as { data: PackageItem[] };
        const parsed = (data ?? []).map(p => ({
          ...p,
          benefits: typeof p.benefits === "string" ? JSON.parse(p.benefits as unknown as string) : (p.benefits ?? []),
          inventory_items: typeof p.inventory_items === "string" ? JSON.parse(p.inventory_items as unknown as string) : (p.inventory_items ?? []),
        }));
        setPackages(parsed);
      }
    } finally {
      setLoading(false);
    }
  }, [proposalId]);

  useEffect(() => { void load(); }, [load]);

  function handleSaved(saved: PackageItem) {
    setPackages(prev => {
      const idx = prev.findIndex(p => p.id === saved.id);
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = saved;
        return next;
      }
      return [...prev, saved];
    });
    setShowForm(false);
    setEditPkg(null);
    toast({ variant: "success", title: editPkg ? "Package updated" : "Package added" });
    router.refresh();
  }

  async function handleDelete(id: string) {
    if (!confirm("Delete this package?")) return;
    try {
      const res = await fetch(`/api/proposals/${proposalId}/packages/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Delete failed");
      setPackages(prev => prev.filter(p => p.id !== id));
      toast({ variant: "success", title: "Package deleted" });
      router.refresh();
    } catch {
      toast({ variant: "destructive", title: "Delete failed" });
    }
  }

  const TIER_COLORS: Record<string, string> = {
    "Prata":    "bg-slate-100 text-slate-700 border-slate-300",
    "Ouro":     "bg-amber-50 text-amber-700 border-amber-300",
    "Diamante": "bg-purple-50 text-purple-700 border-purple-300",
  };

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground py-4">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading packages…
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold flex items-center gap-2">
            <Package className="h-4 w-4 text-primary" />
            Pacotes de Patrocínio
          </h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            Crie até 3 pacotes (ex: Prata, Ouro, Diamante) com preços e benefícios distintos.
          </p>
        </div>
        <Button size="sm" onClick={() => { setEditPkg(null); setShowForm(true); }} className="gap-1.5">
          <Plus className="h-4 w-4" /> Add Package
        </Button>
      </div>

      {(showForm || editPkg) && (
        <PackageForm
          proposalId={proposalId}
          initialData={editPkg ?? undefined}
          onSaved={handleSaved}
          onCancel={() => { setShowForm(false); setEditPkg(null); }}
        />
      )}

      {packages.length === 0 && !showForm && (
        <div className="rounded-xl border-2 border-dashed border-slate-200 p-8 text-center">
          <Package className="h-8 w-8 text-slate-300 mx-auto mb-3" />
          <p className="text-sm text-slate-500">No packages yet.</p>
          <p className="text-xs text-slate-400 mt-1">Add Prata, Ouro, Diamante tiers to let sponsors choose their level.</p>
          <button onClick={() => setShowForm(true)} className="mt-3 text-xs text-primary hover:underline">
            Create first package →
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {packages.map((pkg) => {
          const tierColor = TIER_COLORS[pkg.name] ?? "bg-green-50 text-green-700 border-green-300";
          const isExpanded = expandedId === pkg.id;
          return (
            <div key={pkg.id} className={`rounded-xl border-2 ${tierColor.split(" ")[2]} bg-white overflow-hidden`}>
              <div className={`px-4 py-3 ${tierColor} flex items-center justify-between`}>
                <div className="flex items-center gap-2">
                  <Star className="h-4 w-4" />
                  <span className="font-bold text-sm">{pkg.name}</span>
                </div>
                <div className="flex gap-1">
                  <button onClick={() => setExpandedId(isExpanded ? null : pkg.id)}
                    className="p-1 rounded hover:opacity-70 transition-opacity">
                    {isExpanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                  </button>
                  <button onClick={() => { setEditPkg(pkg); setShowForm(false); }}
                    className="p-1 rounded hover:opacity-70 transition-opacity">
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                  <button onClick={() => handleDelete(pkg.id)}
                    className="p-1 rounded hover:opacity-70 transition-opacity text-red-500">
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>

              <div className="p-4 space-y-3">
                {pkg.price_brl != null && (
                  <div className="text-2xl font-extrabold text-slate-800">
                    {formatBRL(pkg.price_brl)}
                    <span className="text-xs font-normal text-muted-foreground ml-1">/ temporada</span>
                  </div>
                )}
                {pkg.description && (
                  <p className="text-xs text-muted-foreground">{pkg.description}</p>
                )}

                {isExpanded && pkg.benefits.length > 0 && (
                  <ul className="space-y-1.5">
                    {pkg.benefits.map((b, i) => (
                      <li key={i} className="flex items-start gap-2 text-xs">
                        <CheckCircle2 className="h-3.5 w-3.5 text-green-500 shrink-0 mt-0.5" />
                        {b}
                      </li>
                    ))}
                  </ul>
                )}

                {!isExpanded && pkg.benefits.length > 0 && (
                  <p className="text-xs text-muted-foreground">
                    {pkg.benefits.length} benefício{pkg.benefits.length !== 1 ? "s" : ""}
                  </p>
                )}

                {pkg.inventory_items.length > 0 && (
                  <Badge variant="outline" className="text-xs">
                    {pkg.inventory_items.length} item{pkg.inventory_items.length !== 1 ? "s" : ""} de inventário
                  </Badge>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
