"use client";

import React, { useState } from "react";
import {
  Clock, DollarSign, Package, ListChecks, AlertTriangle,
  Zap, ChevronDown, ChevronUp, Loader2, Sparkles,
  BarChart3, Users, Hammer,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { ExecutionBrief, ExecutionBriefItem } from "@/lib/ai/schemas";

const COMPLEXITY_COLORS = {
  low:    { bg: "bg-green-100",  text: "text-green-800",  label: "Baixa" },
  medium: { bg: "bg-amber-100",  text: "text-amber-800",  label: "Média" },
  high:   { bg: "bg-red-100",    text: "text-red-800",    label: "Alta" },
};

function BriefCard({ brief }: { brief: ExecutionBriefItem }) {
  const [open, setOpen] = useState(false);
  const complexity = COMPLEXITY_COLORS[brief.complexity ?? "medium"];

  return (
    <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
      {/* Header — always visible */}
      <button
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center justify-between p-4 sm:p-5 hover:bg-slate-50 transition-colors text-left"
      >
        <div className="flex items-center gap-3 min-w-0">
          <div className="rounded-lg bg-slate-100 p-2 shrink-0">
            <Zap className="h-4 w-4 text-slate-600" />
          </div>
          <div className="min-w-0">
            <div className="font-semibold text-slate-900 truncate">{brief.strategy_label}</div>
            <div className="flex items-center gap-3 mt-1 flex-wrap">
              <span className="flex items-center gap-1 text-xs text-slate-500">
                <Clock className="h-3 w-3" /> {brief.estimated_duration}
              </span>
              <span className="flex items-center gap-1 text-xs text-slate-500">
                <DollarSign className="h-3 w-3" /> {brief.estimated_cost_brl}
              </span>
              <span className={cn("text-xs font-semibold rounded-full px-2 py-0.5", complexity.bg, complexity.text)}>
                {complexity.label}
              </span>
            </div>
          </div>
        </div>
        {open ? <ChevronUp className="h-4 w-4 text-slate-400 shrink-0" /> : <ChevronDown className="h-4 w-4 text-slate-400 shrink-0" />}
      </button>

      {/* Expandable detail */}
      {open && (
        <div className="border-t border-slate-100 p-4 sm:p-5 space-y-5">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Resources */}
            <div className="rounded-lg bg-blue-50 border border-blue-100 p-4">
              <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-blue-700 mb-3">
                <Users className="h-3.5 w-3.5" />
                Recursos Necessários
              </div>
              <ul className="space-y-1.5">
                {brief.resources_needed.map((r, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm text-blue-900">
                    <Package className="h-3.5 w-3.5 shrink-0 mt-0.5 text-blue-500" />
                    {r}
                  </li>
                ))}
              </ul>
            </div>

            {/* Action items */}
            <div className="rounded-lg bg-slate-50 border border-slate-200 p-4">
              <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-600 mb-3">
                <ListChecks className="h-3.5 w-3.5" />
                Action Items
              </div>
              <ol className="space-y-1.5">
                {brief.action_items.map((item, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm text-slate-700">
                    <span className="shrink-0 w-5 h-5 rounded-full bg-slate-200 text-slate-600 text-xs flex items-center justify-center font-bold">
                      {i + 1}
                    </span>
                    {item}
                  </li>
                ))}
              </ol>
            </div>
          </div>

          {/* Risk */}
          {brief.key_risk && (
            <div className="flex items-start gap-3 rounded-lg bg-amber-50 border border-amber-200 p-3">
              <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
              <div>
                <div className="text-xs font-bold uppercase tracking-wider text-amber-700 mb-1">Risco Principal</div>
                <p className="text-sm text-amber-800">{brief.key_risk}</p>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

interface ExecutionBriefPanelProps {
  proposalId: string;
  initialBrief?: ExecutionBrief | null;
}

export function ExecutionBriefPanel({ proposalId, initialBrief }: ExecutionBriefPanelProps) {
  const [brief, setBrief] = useState<ExecutionBrief | null>(initialBrief ?? null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const generate = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/proposals/${proposalId}/execution-brief`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Generation failed");
      setBrief(data.brief);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Header + generate button */}
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-500 mb-1">
            <Hammer className="h-3.5 w-3.5" />
            Execution Brief
          </div>
          <p className="text-xs text-slate-400">
            Tempo, recursos e custo estimados por estratégia — uso interno somente
          </p>
        </div>
        <button
          onClick={generate}
          disabled={loading}
          className="flex items-center gap-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-white px-3 py-2 text-xs font-semibold transition-colors disabled:opacity-60"
        >
          {loading
            ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Gerando…</>
            : <><Sparkles className="h-3.5 w-3.5" /> {brief ? "Regenerar" : "Gerar Brief"}</>
          }
        </button>
      </div>

      {error && (
        <div className="rounded-lg bg-red-50 border border-red-200 p-3 text-sm text-red-700">{error}</div>
      )}

      {brief ? (
        <>
          {/* Summary stats */}
          <div className="grid grid-cols-3 gap-3">
            <div className="rounded-lg bg-slate-50 border border-slate-200 p-3 text-center">
              <div className="text-lg font-bold text-slate-900">{brief.briefs.length}</div>
              <div className="text-xs text-slate-500">Estratégias</div>
            </div>
            {brief.total_estimated_cost_brl && (
              <div className="col-span-2 rounded-lg bg-green-50 border border-green-200 p-3">
                <div className="flex items-center gap-1.5 text-xs font-bold text-green-700 mb-1">
                  <BarChart3 className="h-3.5 w-3.5" />
                  Custo Total Estimado
                </div>
                <div className="text-sm font-bold text-green-900">{brief.total_estimated_cost_brl}</div>
                {brief.production_timeline_weeks && (
                  <div className="text-xs text-green-600 mt-0.5">Timeline: ~{brief.production_timeline_weeks} semanas</div>
                )}
              </div>
            )}
          </div>

          {/* Individual briefs */}
          <div className="space-y-2">
            {brief.briefs.map((b) => (
              <BriefCard key={b.strategy_id} brief={b} />
            ))}
          </div>

          <p className="text-xs text-slate-400 italic">
            * Valores estimados para planejamento interno. Não incluir na proposta enviada ao patrocinador.
          </p>
        </>
      ) : !loading && (
        <div className="rounded-xl border-2 border-dashed border-slate-200 p-8 text-center">
          <Hammer className="h-8 w-8 text-slate-300 mx-auto mb-3" />
          <p className="text-sm text-slate-500">Clique em &quot;Gerar Brief&quot; para criar estimativas de recursos e custos para cada estratégia de campanha.</p>
        </div>
      )}
    </div>
  );
}
