"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/ui/toaster";
import {
  Plus, X, Pencil, Trash2, DollarSign, Eye,
  Package, Smartphone, ChevronDown, ChevronUp,
  Clock, Users, BarChart3,
} from "lucide-react";

const PHYSICAL_CATEGORIES: Record<string, string> = {
  jersey: "Jersey Sponsorship",
  led_board: "LED Board",
  banner: "Stadium Banner",
  scoreboard: "Scoreboard",
  press_backdrop: "Press Backdrop",
  stadium_branding: "Stadium Branding",
  training_kit: "Training Kit",
  vip_area: "VIP Area",
  custom: "Custom Category",
};

const DIGITAL_CATEGORIES: Record<string, string> = {
  social_post: "Social Feed Post",
  stories: "Stories / Reels",
  youtube: "YouTube",
  reels: "Reels / TikTok",
  influencer: "Player / Influencer",
  sponsored_content: "Sponsored Content",
  email_newsletter: "Email Newsletter",
  app_push: "App Push Notification",
  custom: "Custom Category",
};

const ALL_KNOWN_CATEGORIES = new Set([
  ...Object.keys(PHYSICAL_CATEGORIES),
  ...Object.keys(DIGITAL_CATEGORIES),
]);

const AVAILABILITY_COLORS: Record<string, string> = {
  available: "text-green-700 bg-green-50 border-green-200",
  limited: "text-amber-700 bg-amber-50 border-amber-200",
  sold: "text-red-700 bg-red-50 border-red-200",
};

type Item = Record<string, unknown>;

const selectCls =
  "w-full h-9 rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring";

function ItemForm({
  physicalCategories,
  digitalCategories,
  initialData,
  onSaved,
  onCancel,
}: {
  physicalCategories: Record<string, string>;
  digitalCategories: Record<string, string>;
  initialData?: Item;
  onSaved: (item: Item) => void;
  onCancel: () => void;
}) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [inventoryType, setInventoryType] = useState<string>(
    (initialData?.inventory_type as string) ?? "physical"
  );

  // Determine initial category select value: if stored category is not a known key, treat as custom
  const storedCategory = (initialData?.category as string) ?? "";
  const isStoredCategoryUnknown = storedCategory && !ALL_KNOWN_CATEGORIES.has(storedCategory);
  const [selectedCategory, setSelectedCategory] = useState<string>(
    isStoredCategoryUnknown ? "custom" : storedCategory
  );
  const [customCategoryName, setCustomCategoryName] = useState<string>(
    isStoredCategoryUnknown ? storedCategory : ""
  );

  const catMap = inventoryType === "physical" ? physicalCategories : digitalCategories;
  const isEdit = !!initialData?.id;

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    const fd = new FormData(e.currentTarget);
    const rawCategory = String(fd.get("category") ?? "");
    const resolvedCategory = rawCategory === "custom"
      ? String(fd.get("custom_category_name") ?? "").trim()
      : rawCategory;
    const payload: Record<string, unknown> = {
      name: String(fd.get("name") ?? "").trim(),
      description: String(fd.get("description") ?? "").trim() || null,
      inventory_type: inventoryType,
      category: resolvedCategory,
      price_min: fd.get("price_min") ? Number(fd.get("price_min")) : null,
      price_max: fd.get("price_max") ? Number(fd.get("price_max")) : null,
      unit: String(fd.get("unit") ?? "").trim() || null,
      availability: String(fd.get("availability") ?? "available"),
      exposure_reach: String(fd.get("exposure_reach") ?? "").trim() || null,
      placement_zone: String(fd.get("placement_zone") ?? "").trim() || null,
      // Digital-specific
      avg_views: fd.get("avg_views") ? Number(fd.get("avg_views")) : null,
      content_hours: fd.get("content_hours") ? Number(fd.get("content_hours")) : null,
      team_required: String(fd.get("team_required") ?? "").trim() || null,
      // Physical-specific
      production_cost: fd.get("production_cost") ? Number(fd.get("production_cost")) : null,
      setup_hours: fd.get("setup_hours") ? Number(fd.get("setup_hours")) : null,
      line_items: String(fd.get("line_items") ?? "").trim() || null,
      // Operational fields
      period: String(fd.get("period") ?? "").trim() || null,
      quantity: fd.get("quantity") ? Number(fd.get("quantity")) : null,
      responsible: String(fd.get("responsible") ?? "").trim() || null,
    };
    try {
      const url = isEdit ? `/api/inventory/${initialData!.id}` : "/api/inventory";
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
      const j = await res.json();
      onSaved(j.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4 p-4 border rounded-xl bg-slate-50">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-slate-700">{isEdit ? "Edit Item" : "New Inventory Item"}</h3>
        <button type="button" onClick={onCancel} className="text-slate-400 hover:text-slate-600">
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="flex gap-2">
        {["physical", "digital"].map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setInventoryType(t)}
            className={`px-3 py-1.5 rounded-md text-xs border font-medium transition-colors capitalize ${
              inventoryType === t
                ? "bg-primary text-primary-foreground border-primary"
                : "bg-background border-input hover:bg-muted"
            }`}
          >
            {t === "physical" ? <Package className="h-3 w-3 inline mr-1" /> : <Smartphone className="h-3 w-3 inline mr-1" />}
            {t}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="name" className="text-xs">Item Name *</Label>
          <Input
            id="name" name="name" required
            defaultValue={initialData?.name as string}
            placeholder="e.g. Jersey Front — Principal Sponsor"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="category" className="text-xs">Category *</Label>
          <select
            id="category"
            name="category"
            className={selectCls}
            required
            value={selectedCategory}
            onChange={e => setSelectedCategory(e.target.value)}
          >
            {Object.entries(catMap).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
          {selectedCategory === "custom" && (
            <Input
              name="custom_category_name"
              required
              value={customCategoryName}
              onChange={e => setCustomCategoryName(e.target.value)}
              placeholder="Enter custom category name..."
              className="mt-1.5 text-sm"
            />
          )}
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="description" className="text-xs">Description</Label>
        <Textarea
          id="description" name="description" rows={2}
          defaultValue={initialData?.description as string}
          placeholder="Details about this inventory item..."
        />
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="price_min" className="text-xs">Min Price (BRL)</Label>
          <Input id="price_min" name="price_min" type="number" defaultValue={initialData?.price_min as number} placeholder="5000" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="price_max" className="text-xs">Max Price (BRL)</Label>
          <Input id="price_max" name="price_max" type="number" defaultValue={initialData?.price_max as number} placeholder="25000" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="unit" className="text-xs">Unit</Label>
          <Input id="unit" name="unit" defaultValue={initialData?.unit as string} placeholder="per match" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="availability" className="text-xs">Availability</Label>
          <select id="availability" name="availability" className={selectCls} defaultValue={initialData?.availability as string ?? "available"}>
            {["available", "limited", "sold"].map((s) => (
              <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="exposure_reach" className="text-xs">Exposure / Reach</Label>
          <Input id="exposure_reach" name="exposure_reach" defaultValue={initialData?.exposure_reach as string} placeholder="e.g. 40K+ torcedores/jogo + TV nacional" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="placement_zone" className="text-xs">Placement Zone</Label>
          <Input id="placement_zone" name="placement_zone" defaultValue={initialData?.placement_zone as string} placeholder="e.g. jersey_chest, led_perimeter" />
        </div>
      </div>

      {/* Digital-specific fields */}
      {inventoryType === "digital" && (
        <div className="rounded-lg bg-blue-50 border border-blue-100 p-3 space-y-3">
          <p className="text-xs font-semibold text-blue-700 flex items-center gap-1.5">
            <BarChart3 className="h-3.5 w-3.5" /> Digital Performance Fields
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="avg_views" className="text-xs">Avg Views / Post</Label>
              <Input id="avg_views" name="avg_views" type="number" defaultValue={initialData?.avg_views as number} placeholder="e.g. 50000" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="content_hours" className="text-xs">Content Hours / Item</Label>
              <Input id="content_hours" name="content_hours" type="number" step="0.5" defaultValue={initialData?.content_hours as number} placeholder="e.g. 4" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="team_required" className="text-xs">Team Required</Label>
              <Input id="team_required" name="team_required" defaultValue={initialData?.team_required as string} placeholder="e.g. Editor, Photographer, Player" />
            </div>
          </div>
        </div>
      )}

      {/* Physical-specific fields */}
      {inventoryType === "physical" && (
        <div className="rounded-lg bg-orange-50 border border-orange-100 p-3 space-y-3">
          <p className="text-xs font-semibold text-orange-700 flex items-center gap-1.5">
            <Clock className="h-3.5 w-3.5" /> Physical Production Fields
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="production_cost" className="text-xs">Production Cost (BRL)</Label>
              <Input id="production_cost" name="production_cost" type="number" defaultValue={initialData?.production_cost as number} placeholder="e.g. 15000" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="setup_hours" className="text-xs">Setup Hours</Label>
              <Input id="setup_hours" name="setup_hours" type="number" step="0.5" defaultValue={initialData?.setup_hours as number} placeholder="e.g. 8" />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="line_items" className="text-xs">Line Items / Requirements</Label>
            <Textarea id="line_items" name="line_items" rows={2} defaultValue={initialData?.line_items as string} placeholder="e.g. LED panel rental: R$5000, Installation team: R$2000, Electrician: R$1500" />
          </div>
        </div>
      )}

      {/* Operational fields */}
      <div className="rounded-lg bg-slate-50 border border-slate-200 p-3 space-y-3">
        <p className="text-xs font-semibold text-slate-600">Operational Details</p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="period" className="text-xs">Period</Label>
            <Input id="period" name="period" defaultValue={initialData?.period as string} placeholder="e.g. Jan–Dec 2026" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="quantity" className="text-xs">Quantity</Label>
            <Input id="quantity" name="quantity" type="number" defaultValue={initialData?.quantity as number} placeholder="e.g. 20" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="responsible" className="text-xs">Responsible</Label>
            <Input id="responsible" name="responsible" defaultValue={initialData?.responsible as string} placeholder="e.g. Marketing Team" />
          </div>
        </div>
      </div>

      {error && <div className="text-sm text-destructive bg-destructive/10 rounded-md p-2">{error}</div>}

      <div className="flex items-center gap-2">
        <Button type="submit" disabled={saving} size="sm">
          <Plus className="h-4 w-4 mr-1" />
          {saving ? "Saving…" : isEdit ? "Save Changes" : "Add to Inventory"}
        </Button>
        <Button type="button" variant="outline" size="sm" onClick={onCancel}>Cancel</Button>
      </div>
    </form>
  );
}

function InventoryRow({
  item,
  onEdit,
  onDelete,
}: {
  item: Item;
  onEdit: (item: Item) => void;
  onDelete: (id: string) => void;
}) {
  const avail = (item.availability as string) || "available";
  const availStyle = AVAILABILITY_COLORS[avail] || AVAILABILITY_COLORS.available;

  return (
    <div className="py-3 flex items-start gap-3 group">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <p className="text-sm font-medium">{item.name as string}</p>
          <Badge className={`text-xs border ${availStyle} capitalize`} variant="outline">
            {avail}
          </Badge>
          {!!item.placement_zone && (
            <Badge variant="outline" className="text-xs">{(item.placement_zone as string).replace(/_/g, " ")}</Badge>
          )}
        </div>
        {!!item.description && <p className="text-xs text-muted-foreground mt-0.5">{item.description as string}</p>}
        {!!item.exposure_reach && (
          <div className="flex items-center gap-1 mt-1">
            <Eye className="h-3 w-3 text-muted-foreground" />
            <p className="text-xs text-muted-foreground">{item.exposure_reach as string}</p>
          </div>
        )}
        {/* Digital fields */}
        {!!(item.avg_views || item.content_hours || item.team_required) && (
          <div className="flex flex-wrap gap-2 mt-1">
            {!!item.avg_views && (
              <span className="inline-flex items-center gap-0.5 text-xs text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded">
                <BarChart3 className="h-2.5 w-2.5" /> {Number(item.avg_views).toLocaleString("pt-BR")} views
              </span>
            )}
            {!!item.content_hours && (
              <span className="inline-flex items-center gap-0.5 text-xs text-indigo-600 bg-indigo-50 px-1.5 py-0.5 rounded">
                <Clock className="h-2.5 w-2.5" /> {String(item.content_hours)}h
              </span>
            )}
            {!!item.team_required && (
              <span className="inline-flex items-center gap-0.5 text-xs text-purple-600 bg-purple-50 px-1.5 py-0.5 rounded">
                <Users className="h-2.5 w-2.5" /> {item.team_required as string}
              </span>
            )}
          </div>
        )}
        {/* Physical fields */}
        {!!(item.production_cost || item.setup_hours) && (
          <div className="flex flex-wrap gap-2 mt-1">
            {!!item.production_cost && (
              <span className="inline-flex items-center gap-0.5 text-xs text-orange-600 bg-orange-50 px-1.5 py-0.5 rounded">
                <DollarSign className="h-2.5 w-2.5" /> Prod: R${Number(item.production_cost).toLocaleString("pt-BR")}
              </span>
            )}
            {!!item.setup_hours && (
              <span className="inline-flex items-center gap-0.5 text-xs text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded">
                <Clock className="h-2.5 w-2.5" /> Setup: {String(item.setup_hours)}h
              </span>
            )}
          </div>
        )}
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <div className="text-right space-y-0.5">
          {!!(item.price_min || item.price_max) && (
            <div className="flex items-center gap-1 justify-end">
              <DollarSign className="h-3 w-3 text-muted-foreground" />
              <p className="text-xs font-medium">
                {item.price_min && item.price_max
                  ? `R$ ${Number(item.price_min).toLocaleString("pt-BR")} – ${Number(item.price_max).toLocaleString("pt-BR")}`
                  : item.price_min
                  ? `R$ ${Number(item.price_min).toLocaleString("pt-BR")}+`
                  : `até R$ ${Number(item.price_max).toLocaleString("pt-BR")}`}
              </p>
            </div>
          )}
          {!!item.unit && <p className="text-xs text-muted-foreground">{item.unit as string}</p>}
        </div>
        <div className="flex gap-1 transition-opacity">
          <button
            onClick={() => onEdit(item)}
            className="p-1.5 rounded-md hover:bg-slate-100 text-slate-400 hover:text-slate-600"
            title="Edit"
          >
            <Pencil className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={() => onDelete(item.id as string)}
            className="p-1.5 rounded-md hover:bg-red-50 text-slate-400 hover:text-red-600"
            title="Delete"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}

export function InventoryManager({ initialItems }: { initialItems: Item[] }) {
  const router = useRouter();
  const { toast } = useToast();
  const [items, setItems] = useState<Item[]>(initialItems);
  const [showForm, setShowForm] = useState(false);
  const [editItem, setEditItem] = useState<Item | null>(null);
  const [activeTab, setActiveTab] = useState<"physical" | "digital" | "all">("physical");
  const [expandedCats, setExpandedCats] = useState<Set<string>>(new Set(Object.keys(PHYSICAL_CATEGORIES)));
  const [filterAvailability, setFilterAvailability] = useState<string>("");
  const [filterCategory, setFilterCategory] = useState<string>("");
  const [filterPriceMin, setFilterPriceMin] = useState<string>("");
  const [filterPriceMax, setFilterPriceMax] = useState<string>("");
  const [filterSearch, setFilterSearch] = useState<string>("");

  const catMap = activeTab === "physical" ? PHYSICAL_CATEGORIES : activeTab === "digital" ? DIGITAL_CATEGORIES : { ...PHYSICAL_CATEGORIES, ...DIGITAL_CATEGORIES };
  const tabItems = activeTab === "all" ? items : items.filter((i) => i.inventory_type === activeTab);

  const filteredItems = tabItems.filter((i) => {
    if (filterAvailability && i.availability !== filterAvailability) return false;
    if (filterCategory && i.category !== filterCategory) return false;
    if (filterPriceMin && (Number(i.price_min) || 0) < Number(filterPriceMin)) return false;
    if (filterPriceMax && (Number(i.price_max) || 0) > Number(filterPriceMax)) return false;
    if (filterSearch) {
      const q = filterSearch.toLowerCase();
      if (!(String(i.name ?? "").toLowerCase().includes(q) || String(i.description ?? "").toLowerCase().includes(q))) return false;
    }
    return true;
  });

  const hasFilters = !!(filterAvailability || filterCategory || filterPriceMin || filterPriceMax || filterSearch);

  const byCategory = tabItems.reduce<Record<string, Item[]>>((acc, item) => {
    const cat = (item.category as string) || "other";
    acc[cat] = acc[cat] || [];
    acc[cat].push(item);
    return acc;
  }, {});

  const totalAvailable = items.filter((i) => i.availability === "available").length;
  const totalLimited = items.filter((i) => i.availability === "limited").length;

  function handleSaved(saved: Item) {
    setItems((prev) => {
      const idx = prev.findIndex((i) => i.id === saved.id);
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = saved;
        return next;
      }
      return [saved, ...prev];
    });
    setShowForm(false);
    setEditItem(null);
    toast({ variant: "success", title: editItem ? "Item updated" : "Item added to inventory" });
    router.refresh();
  }

  async function handleDelete(id: string) {
    if (!confirm("Delete this inventory item?")) return;
    try {
      const res = await fetch(`/api/inventory/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Delete failed");
      setItems((prev) => prev.filter((i) => i.id !== id));
      toast({ variant: "success", title: "Item deleted" });
      router.refresh();
    } catch {
      toast({ variant: "destructive", title: "Delete failed" });
    }
  }

  function toggleCat(cat: string) {
    setExpandedCats((prev) => {
      const next = new Set(prev);
      if (next.has(cat)) next.delete(cat);
      else next.add(cat);
      return next;
    });
  }

  return (
    <div className="space-y-6">
      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "Total Items", value: items.length, color: "bg-blue-50 text-blue-700", icon: <Package className="h-4 w-4" /> },
          { label: "Available", value: totalAvailable, color: "bg-green-50 text-green-700", icon: <Eye className="h-4 w-4" /> },
          { label: "Limited", value: totalLimited, color: "bg-amber-50 text-amber-700", icon: <Eye className="h-4 w-4" /> },
          { label: "Categories", value: Object.keys(byCategory).length, color: "bg-purple-50 text-purple-700", icon: <Eye className="h-4 w-4" /> },
        ].map(({ label, value, color, icon }) => (
          <div key={label} className={`rounded-lg border p-3 ${color}`}>
            <div className="flex items-center gap-1.5 text-xs opacity-70 mb-1">{icon}{label}</div>
            <p className="text-2xl font-bold">{value}</p>
          </div>
        ))}
      </div>

      {/* Header with Add button */}
      <div className="flex items-center justify-between">
        <div className="flex gap-2">
          {(["physical", "digital", "all"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setActiveTab(t)}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-lg border text-sm font-medium transition-colors capitalize ${
                activeTab === t ? "bg-primary text-primary-foreground border-primary" : "bg-background border-input hover:bg-muted"
              }`}
            >
              {t === "physical" ? <Package className="h-4 w-4" /> : t === "digital" ? <Smartphone className="h-4 w-4" /> : <BarChart3 className="h-4 w-4" />}
              {t === "all" ? "All Items" : `${t} Inventory`}
            </button>
          ))}
        </div>
        <Button
          size="sm"
          onClick={() => { setEditItem(null); setShowForm(true); window.scrollTo({ top: 0, behavior: "smooth" }); }}
          className="gap-1.5"
        >
          <Plus className="h-4 w-4" /> Add Item
        </Button>
      </div>

      {/* Inline Add/Edit Form */}
      {(showForm || editItem) && (
        <ItemForm
          physicalCategories={PHYSICAL_CATEGORIES}
          digitalCategories={DIGITAL_CATEGORIES}
          initialData={editItem ?? undefined}
          onSaved={handleSaved}
          onCancel={() => { setShowForm(false); setEditItem(null); }}
        />
      )}

      {/* Items by category */}
      {Object.keys(catMap).map((cat) => {
        const catItems = byCategory[cat] || [];
        const isExpanded = expandedCats.has(cat);
        return (
          <div key={cat} className="rounded-xl border bg-white overflow-hidden">
            <button
              onClick={() => toggleCat(cat)}
              className="w-full flex items-center justify-between px-4 py-3 hover:bg-slate-50 transition-colors"
            >
              <div className="flex items-center gap-2">
                {activeTab === "physical"
                  ? <Package className="h-4 w-4 text-blue-500" />
                  : <Smartphone className="h-4 w-4 text-purple-500" />}
                <span className="text-sm font-semibold text-slate-700">{catMap[cat]}</span>
                <span className="text-xs bg-slate-100 text-slate-600 rounded-full px-2 py-0.5 font-medium">{catItems.length}</span>
              </div>
              {isExpanded ? <ChevronUp className="h-4 w-4 text-slate-400" /> : <ChevronDown className="h-4 w-4 text-slate-400" />}
            </button>

            {isExpanded && (
              <div className="border-t">
                {catItems.length > 0 ? (
                  <div className="divide-y px-4">
                    {catItems.map((item) => (
                      <InventoryRow
                        key={item.id as string}
                        item={item}
                        onEdit={(i) => { setEditItem(i); setShowForm(false); }}
                        onDelete={handleDelete}
                      />
                    ))}
                  </div>
                ) : (
                  <div className="px-4 py-6 text-center">
                    <p className="text-sm text-muted-foreground">No {catMap[cat]} items yet</p>
                    <button
                      onClick={() => { setEditItem(null); setShowForm(true); }}
                      className="mt-2 text-xs text-primary hover:underline flex items-center gap-1 mx-auto"
                    >
                      <Plus className="h-3 w-3" /> Add first item
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
