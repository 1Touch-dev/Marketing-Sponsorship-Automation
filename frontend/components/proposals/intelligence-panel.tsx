"use client";

import type { CompanyIntelligence } from "@/lib/ai/schemas";
import { cn } from "@/lib/utils";
import { Brain, Target, TrendingUp, MapPin, Globe, Star } from "lucide-react";

interface IntelligencePanelProps {
  intelligence: CompanyIntelligence;
  className?: string;
}

export function IntelligencePanel({ intelligence: intel, className }: IntelligencePanelProps) {
  if (!intel) return null;

  const score = intel.sponsorship_fit_score ?? 0;
  const scoreColor =
    score >= 8 ? "text-green-600" : score >= 6 ? "text-blue-600" : score >= 4 ? "text-amber-600" : "text-red-500";
  const scoreBg =
    score >= 8 ? "bg-green-50 border-green-200" : score >= 6 ? "bg-blue-50 border-blue-200" : score >= 4 ? "bg-amber-50 border-amber-200" : "bg-red-50 border-red-200";

  return (
    <div className={cn("rounded-2xl border border-slate-200 bg-white overflow-hidden", className)}>
      <div className="flex items-center gap-3 px-6 py-4 bg-gradient-to-r from-slate-800 to-slate-700 text-white">
        <Brain className="h-5 w-5" />
        <div>
          <div className="font-semibold text-sm">Análise de Inteligência Comercial</div>
          <div className="text-xs text-slate-300">Gerado por IA com base no perfil da empresa</div>
        </div>
      </div>

      <div className="p-6 space-y-5">
        {/* Score */}
        <div className={cn("flex items-center gap-4 rounded-xl border p-4", scoreBg)}>
          <div className={cn("text-4xl font-extrabold", scoreColor)}>
            {score.toFixed(1)}
            <span className="text-base font-normal text-slate-400">/10</span>
          </div>
          <div>
            <div className="font-semibold text-slate-700 text-sm flex items-center gap-1">
              <Star className="h-4 w-4 text-amber-500" />
              Score de Adequação ao Patrocínio
            </div>
            {intel.sponsorship_fit_rationale && (
              <p className="text-sm text-slate-600 mt-1">{intel.sponsorship_fit_rationale}</p>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {/* Marketing goals */}
          {intel.marketing_goals && intel.marketing_goals.length > 0 && (
            <div>
              <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">
                <Target className="h-3.5 w-3.5" />
                Objetivos de Marketing Inferidos
              </div>
              <ul className="space-y-1">
                {intel.marketing_goals.map((g, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm text-slate-700">
                    <span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-blue-500 shrink-0" />
                    {g}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Brand positioning */}
          {intel.brand_positioning && (
            <div>
              <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">
                <TrendingUp className="h-3.5 w-3.5" />
                Posicionamento de Marca
              </div>
              <p className="text-sm text-slate-700 leading-relaxed">{intel.brand_positioning}</p>
            </div>
          )}

          {/* Audience alignment */}
          {intel.audience_alignment && (
            <div>
              <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">
                <Brain className="h-3.5 w-3.5" />
                Alinhamento de Público
              </div>
              <p className="text-sm text-slate-700 leading-relaxed">{intel.audience_alignment}</p>
            </div>
          )}

          {/* Recommended direction */}
          {intel.recommended_direction && (
            <div>
              <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">
                <Star className="h-3.5 w-3.5 text-amber-500" />
                Direção Recomendada
              </div>
              <p className="text-sm text-slate-700 leading-relaxed">{intel.recommended_direction}</p>
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2 border-t border-slate-100">
          {intel.local_context && (
            <div className="rounded-lg bg-green-50 p-3">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-green-700 mb-1">
                <MapPin className="h-3.5 w-3.5" />
                Contexto Local (Brasil/Paraná)
              </div>
              <p className="text-xs text-green-800 leading-relaxed">{intel.local_context}</p>
            </div>
          )}
          {intel.global_inspiration && (
            <div className="rounded-lg bg-indigo-50 p-3">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-indigo-700 mb-1">
                <Globe className="h-3.5 w-3.5" />
                Inspiração Global
              </div>
              <p className="text-xs text-indigo-800 leading-relaxed">{intel.global_inspiration}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
