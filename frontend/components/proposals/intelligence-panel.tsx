"use client";

import type { CompanyIntelligence } from "@/lib/ai/schemas";
import { cn } from "@/lib/utils";
import { Brain, Target, TrendingUp, MapPin, Globe, Star, ChevronRight, Lightbulb, Heart } from "lucide-react";

interface IntelligencePanelProps {
  intelligence: CompanyIntelligence;
  className?: string;
}

function ScoreBar({ score }: { score: number }) {
  const pct = (score / 10) * 100;
  const color = score >= 8 ? "bg-emerald-500" : score >= 6 ? "bg-blue-500" : score >= 4 ? "bg-amber-500" : "bg-red-400";
  return (
    <div className="w-full bg-slate-100 rounded-full h-2.5 overflow-hidden">
      <div className={cn("h-full rounded-full transition-all", color)} style={{ width: `${pct}%` }} />
    </div>
  );
}

export function IntelligencePanel({ intelligence: intel, className }: IntelligencePanelProps) {
  if (!intel) return null;

  const score = intel.sponsorship_fit_score ?? 0;
  const scoreLabel = score >= 8 ? "Excelente" : score >= 6 ? "Bom" : score >= 4 ? "Moderado" : "Baixo";
  const scoreColorText = score >= 8 ? "text-emerald-600" : score >= 6 ? "text-blue-600" : score >= 4 ? "text-amber-600" : "text-red-500";
  const scoreBg = score >= 8 ? "bg-emerald-50 border-emerald-200" : score >= 6 ? "bg-blue-50 border-blue-200" : score >= 4 ? "bg-amber-50 border-amber-200" : "bg-red-50 border-red-200";

  return (
    <div className={cn("rounded-2xl border border-slate-200 bg-white overflow-hidden shadow-sm", className)}>
      {/* Header */}
      <div className="px-7 py-5 bg-gradient-to-r from-slate-900 to-slate-700 text-white flex items-center gap-4">
        <div className="rounded-xl bg-white/10 p-3 shrink-0">
          <Brain className="h-6 w-6 text-blue-300" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="font-bold text-white">Análise de Inteligência Comercial</div>
          <div className="text-xs text-slate-400 mt-0.5">Análise estratégica gerada por IA com base no perfil da empresa</div>
        </div>
        <div className="text-right shrink-0">
          <div className="text-2xl font-extrabold text-white">{score.toFixed(1)}<span className="text-sm font-normal text-slate-400">/10</span></div>
          <div className={cn("text-xs font-semibold", score >= 8 ? "text-emerald-300" : score >= 6 ? "text-blue-300" : "text-amber-300")}>
            {scoreLabel}
          </div>
        </div>
      </div>

      <div className="p-6 sm:p-7 space-y-6">
        {/* Score bar + rationale */}
        <div className={cn("rounded-xl border p-5", scoreBg)}>
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Star className={cn("h-4 w-4", scoreColorText)} />
              <span className="text-sm font-semibold text-slate-700">Score de Adequação ao Patrocínio</span>
            </div>
            <span className={cn("text-xl font-extrabold", scoreColorText)}>{score.toFixed(1)}</span>
          </div>
          <ScoreBar score={score} />
          {intel.sponsorship_fit_rationale && (
            <p className="text-sm text-slate-600 mt-3 leading-relaxed">{intel.sponsorship_fit_rationale}</p>
          )}
        </div>

        {/* Main grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
          {/* Marketing goals */}
          {intel.marketing_goals && intel.marketing_goals.length > 0 && (
            <div className="space-y-1">
              <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-400 mb-3">
                <Target className="h-3.5 w-3.5" />
                Objetivos de Marketing
              </div>
              <ul className="space-y-2">
                {intel.marketing_goals.map((g, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm text-slate-700 rounded-lg bg-slate-50 px-3 py-2">
                    <ChevronRight className="h-4 w-4 text-blue-500 shrink-0 mt-0.5" />
                    {g}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Brand positioning */}
          <div className="space-y-4">
            {intel.brand_positioning && (
              <div>
                <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">
                  <TrendingUp className="h-3.5 w-3.5" />
                  Posicionamento de Marca
                </div>
                <p className="text-sm text-slate-700 leading-relaxed bg-slate-50 rounded-lg p-3">{intel.brand_positioning}</p>
              </div>
            )}

            {intel.audience_alignment && (
              <div>
                <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">
                  <Heart className="h-3.5 w-3.5" />
                  Alinhamento de Público
                </div>
                <p className="text-sm text-slate-700 leading-relaxed bg-slate-50 rounded-lg p-3">{intel.audience_alignment}</p>
              </div>
            )}
          </div>
        </div>

        {/* Recommended direction */}
        {intel.recommended_direction && (
          <div className="rounded-xl bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 p-5">
            <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-blue-600 mb-2">
              <Lightbulb className="h-3.5 w-3.5" />
              Direção Estratégica Recomendada
            </div>
            <p className="text-sm text-blue-900 leading-relaxed font-medium">{intel.recommended_direction}</p>
          </div>
        )}

        {/* Local + global */}
        {(intel.local_context || intel.global_inspiration) && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {intel.local_context && (
              <div className="rounded-xl bg-emerald-50 border border-emerald-200 p-4">
                <div className="flex items-center gap-1.5 text-xs font-bold text-emerald-700 mb-2 uppercase tracking-wider">
                  <MapPin className="h-3.5 w-3.5" />
                  Contexto Local — Brasil/Paraná
                </div>
                <p className="text-xs text-emerald-800 leading-relaxed">{intel.local_context}</p>
              </div>
            )}
            {intel.global_inspiration && (
              <div className="rounded-xl bg-indigo-50 border border-indigo-200 p-4">
                <div className="flex items-center gap-1.5 text-xs font-bold text-indigo-700 mb-2 uppercase tracking-wider">
                  <Globe className="h-3.5 w-3.5" />
                  Inspiração Global
                </div>
                <p className="text-xs text-indigo-800 leading-relaxed">{intel.global_inspiration}</p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
