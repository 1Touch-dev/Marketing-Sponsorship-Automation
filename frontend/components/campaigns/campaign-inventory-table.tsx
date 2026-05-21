"use client";

import React, { useState, useCallback } from "react";
import {
  Plus, Trash2, Save, ChevronDown, ChevronUp, DollarSign,
  Zap, FileText, Globe, Users, Package, Edit2, Check,
  ArrowUp, ArrowDown, Loader2, TrendingUp,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ─── Inventory item config ────────────────────────────────────────────────────
export const INVENTORY_CATALOG = [
  { id: "jersey_chest",       name: "Jersey — Principal (Chest)",          category: "Jersey",      price_brl: 150000, unit: "temporada" },
  { id: "jersey_sleeve",      name: "Jersey — Manga (Sleeve)",              category: "Jersey",      price_brl: 50000,  unit: "temporada" },
  { id: "jersey_back",        name: "Jersey — Costas (Back)",               category: "Jersey",      price_brl: 35000,  unit: "temporada" },
  { id: "led_board",          name: "LED Perimetral — Couto Pereira",       category: "Estádio",     price_brl: 40000,  unit: "jogo" },
  { id: "scoreboard",         name: "Telão Gigante — Vídeo Ad (30s)",       category: "Estádio",     price_brl: 15000,  unit: "jogo" },
  { id: "press_backdrop",     name: "Press Backdrop / Flash Zone",          category: "Estádio",     price_brl: 12000,  unit: "mês" },
  { id: "vip_hospitality",    name: "VIP Hospitality Zone",                 category: "Estádio",     price_brl: 30000,  unit: "jogo" },
  { id: "stadium_naming",     name: "Naming Rights de Área",               category: "Estádio",     price_brl: 80000,  unit: "temporada" },
  { id: "matchday_activation",name: "Matchday Fan Zone Activation",         category: "Ativação",    price_brl: 25000,  unit: "jogo" },
  { id: "instagram_post",     name: "Instagram — Post Patrocinado",         category: "Digital",     price_brl: 5000,   unit: "post" },
  { id: "instagram_reels",    name: "Instagram — Reels Patrocinado",        category: "Digital",     price_brl: 8000,   unit: "vídeo" },
  { id: "youtube_video",      name: "YouTube — Vídeo Patrocinado",          category: "Digital",     price_brl: 15000,  unit: "vídeo" },
  { id: "player_content",     name: "Player Brand Integration",             category: "Digital",     price_brl: 20000,  unit: "campanha" },
  { id: "youth_academy",      name: "Youth Academy Co-Branding",            category: "Comunidade",  price_brl: 20000,  unit: "mês" },
  { id: "social_responsibility","name": "Ação Social / RSC",                category: "Comunidade",  price_brl: 15000,  unit: "ação" },
  { id: "equipment_supply",   name: "Fornecimento de Equipamentos",         category: "Permuta",     price_brl: 0,      unit: "lote" },
  { id: "media_production",   name: "Produção de Mídia / Vídeo",           category: "Permuta",     price_brl: 0,      unit: "produção" },
];

type LineItem = {
  id: string;
  catalog_id: string;
  name: string;
  category: string;
  quantity: number;
  unit: string;
  unit_price: number;
  notes: string;
  included: boolean;
};

function formatBRL(value: number) {
  return value === 0 ? "—" : new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 }).format(value);
}

interface CampaignInventoryTableProps {
  campaignId: string;
  initialLines?: LineItem[];
  onSaved?: (lines: LineItem[]) => void;
}

export function CampaignInventoryTable({ campaignId, initialLines = [], onSaved }: CampaignInventoryTableProps) {
  const [lines, setLines] = useState<LineItem[]>(initialLines);
  const [showCatalog, setShowCatalog] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);

  const total = lines.filter(l => l.included).reduce((sum, l) => sum + l.unit_price * l.quantity, 0);

  const addItem = useCallback((catalogItem: typeof INVENTORY_CATALOG[0]) => {
    const newLine: LineItem = {
      id: crypto.randomUUID(),
      catalog_id: catalogItem.id,
      name: catalogItem.name,
      category: catalogItem.category,
      quantity: 1,
      unit: catalogItem.unit,
      unit_price: catalogItem.price_brl,
      notes: "",
      included: true,
    };
    setLines(prev => [...prev, newLine]);
    setShowCatalog(false);
  }, []);

  const updateLine = useCallback((id: string, updates: Partial<LineItem>) => {
    setLines(prev => prev.map(l => l.id === id ? { ...l, ...updates } : l));
  }, []);

  const removeLine = useCallback((id: string) => {
    setLines(prev => prev.filter(l => l.id !== id));
  }, []);

  const moveUp = useCallback((idx: number) => {
    if (idx === 0) return;
    setLines(prev => {
      const next = [...prev];
      [next[idx - 1], next[idx]] = [next[idx], next[idx - 1]];
      return next;
    });
  }, []);

  const moveDown = useCallback((idx: number) => {
    setLines(prev => {
      if (idx === prev.length - 1) return prev;
      const next = [...prev];
      [next[idx], next[idx + 1]] = [next[idx + 1], next[idx]];
      return next;
    });
  }, []);

  const save = useCallback(async () => {
    setSaving(true);
    try {
      const res = await fetch(`/api/campaigns/${campaignId}/inventory`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ inventory_lines: lines }),
      });
      if (!res.ok) throw new Error("Save failed");
      setSavedAt(new Date().toLocaleTimeString("pt-BR"));
      onSaved?.(lines);
    } catch {
      // keep state
    } finally {
      setSaving(false);
    }
  }, [lines, campaignId, onSaved]);

  const categories = [...new Set(INVENTORY_CATALOG.map(i => i.category))];

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-slate-800">Inventário da Campanha</h3>
          <p className="text-xs text-slate-500 mt-0.5">Monte o pacote de patrocínio com itens e preços</p>
        </div>
        <div className="flex items-center gap-2">
          {savedAt && (
            <span className="flex items-center gap-1 text-xs text-green-600">
              <Check className="h-3 w-3" /> Salvo {savedAt}
            </span>
          )}
          <button
            onClick={save}
            disabled={saving || lines.length === 0}
            className="flex items-center gap-1.5 rounded-lg bg-green-600 hover:bg-green-700 text-white px-3 py-1.5 text-xs font-semibold transition-colors disabled:opacity-50"
          >
            {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
            Salvar
          </button>
          <button
            onClick={() => setShowCatalog(v => !v)}
            className="flex items-center gap-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-white px-3 py-1.5 text-xs font-semibold transition-colors"
          >
            <Plus className="h-3 w-3" />
            Adicionar item
            {showCatalog ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
          </button>
        </div>
      </div>

      {/* Catalog picker */}
      {showCatalog && (
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
          <div className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-3">Catálogo de Inventário</div>
          <div className="space-y-3">
            {categories.map(cat => (
              <div key={cat}>
                <div className="text-xs font-semibold text-slate-600 mb-2">{cat}</div>
                <div className="flex flex-wrap gap-2">
                  {INVENTORY_CATALOG.filter(i => i.category === cat).map(item => (
                    <button
                      key={item.id}
                      onClick={() => addItem(item)}
                      className="flex items-center gap-1.5 rounded-lg bg-white border border-slate-200 hover:border-green-400 hover:bg-green-50 px-3 py-1.5 text-xs font-medium text-slate-700 transition-colors"
                    >
                      <Plus className="h-3 w-3 text-green-600" />
                      {item.name}
                      {item.price_brl > 0 && (
                        <span className="text-slate-400 ml-1">{formatBRL(item.price_brl)}/{item.unit}</span>
                      )}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Table */}
      {lines.length > 0 ? (
        <div className="rounded-xl border border-slate-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200">
                <th className="text-left px-3 py-2.5 text-xs font-semibold text-slate-600 w-6"></th>
                <th className="text-left px-3 py-2.5 text-xs font-semibold text-slate-600">Item</th>
                <th className="text-left px-3 py-2.5 text-xs font-semibold text-slate-600 w-24">Qtde</th>
                <th className="text-left px-3 py-2.5 text-xs font-semibold text-slate-600 w-32">Preço Unit.</th>
                <th className="text-left px-3 py-2.5 text-xs font-semibold text-slate-600 w-28">Total</th>
                <th className="text-left px-3 py-2.5 text-xs font-semibold text-slate-600 w-24">Incluso</th>
                <th className="w-20 px-3 py-2.5"></th>
              </tr>
            </thead>
            <tbody>
              {lines.map((line, idx) => (
                <tr key={line.id} className={cn("border-b border-slate-100 last:border-0 hover:bg-slate-50/50",
                  !line.included && "opacity-50")}>
                  {/* Reorder */}
                  <td className="px-2 py-2">
                    <div className="flex flex-col gap-0.5">
                      <button onClick={() => moveUp(idx)} className="text-slate-300 hover:text-slate-600 transition-colors">
                        <ArrowUp className="h-3 w-3" />
                      </button>
                      <button onClick={() => moveDown(idx)} className="text-slate-300 hover:text-slate-600 transition-colors">
                        <ArrowDown className="h-3 w-3" />
                      </button>
                    </div>
                  </td>

                  {/* Name + notes */}
                  <td className="px-3 py-2">
                    {editingId === line.id ? (
                      <div className="space-y-1">
                        <input
                          value={line.name}
                          onChange={e => updateLine(line.id, { name: e.target.value })}
                          className="w-full text-xs border rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-green-400"
                        />
                        <input
                          value={line.notes}
                          onChange={e => updateLine(line.id, { notes: e.target.value })}
                          placeholder="Notas (opcional)…"
                          className="w-full text-xs border rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-green-400 text-slate-500"
                        />
                      </div>
                    ) : (
                      <div>
                        <div className="font-medium text-slate-800 text-xs">{line.name}</div>
                        {line.notes && <div className="text-xs text-slate-400 mt-0.5">{line.notes}</div>}
                        <span className="text-[10px] bg-slate-100 text-slate-500 rounded-full px-2 py-0.5 mt-1 inline-block">
                          {line.category}
                        </span>
                      </div>
                    )}
                  </td>

                  {/* Quantity */}
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-1">
                      <input
                        type="number"
                        min={1}
                        value={line.quantity}
                        onChange={e => updateLine(line.id, { quantity: parseInt(e.target.value) || 1 })}
                        className="w-14 text-xs border rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-green-400 text-center"
                      />
                      <span className="text-xs text-slate-400">{line.unit}</span>
                    </div>
                  </td>

                  {/* Unit price */}
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-1">
                      <span className="text-xs text-slate-400">R$</span>
                      <input
                        type="number"
                        min={0}
                        value={line.unit_price}
                        onChange={e => updateLine(line.id, { unit_price: parseFloat(e.target.value) || 0 })}
                        className="w-24 text-xs border rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-green-400 text-right"
                      />
                    </div>
                  </td>

                  {/* Line total */}
                  <td className="px-3 py-2">
                    <span className={cn("text-xs font-semibold", line.included ? "text-green-700" : "text-slate-400")}>
                      {formatBRL(line.unit_price * line.quantity)}
                    </span>
                  </td>

                  {/* Included toggle */}
                  <td className="px-3 py-2">
                    <button
                      onClick={() => updateLine(line.id, { included: !line.included })}
                      className={cn(
                        "w-10 h-5 rounded-full transition-colors relative shrink-0",
                        line.included ? "bg-green-500" : "bg-slate-200"
                      )}
                    >
                      <span className={cn(
                        "absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-all",
                        line.included ? "left-5" : "left-0.5"
                      )} />
                    </button>
                  </td>

                  {/* Actions */}
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => setEditingId(editingId === line.id ? null : line.id)}
                        className="p-1 rounded hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors"
                      >
                        {editingId === line.id ? <Check className="h-3.5 w-3.5" /> : <Edit2 className="h-3.5 w-3.5" />}
                      </button>
                      <button
                        onClick={() => removeLine(line.id)}
                        className="p-1 rounded hover:bg-red-50 text-slate-300 hover:text-red-500 transition-colors"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>

            {/* Totals footer */}
            <tfoot>
              <tr className="bg-green-50 border-t-2 border-green-200">
                <td colSpan={4} className="px-3 py-3 text-xs font-bold text-green-800 uppercase tracking-wide">
                  <span className="flex items-center gap-1.5">
                    <TrendingUp className="h-3.5 w-3.5" />
                    Valor Total do Pacote
                  </span>
                </td>
                <td className="px-3 py-3 text-sm font-extrabold text-green-800">
                  {formatBRL(total)}
                </td>
                <td colSpan={2} className="px-3 py-3 text-xs text-green-600">
                  {lines.filter(l => l.included).length} itens inclusos
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      ) : (
        <div className="rounded-xl border-2 border-dashed border-slate-200 p-8 text-center">
          <DollarSign className="h-8 w-8 text-slate-300 mx-auto mb-3" />
          <p className="text-sm text-slate-500">Adicione itens do catálogo para montar o pacote de patrocínio</p>
        </div>
      )}
    </div>
  );
}
