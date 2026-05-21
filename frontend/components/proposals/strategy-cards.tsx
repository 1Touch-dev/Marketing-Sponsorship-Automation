"use client";

import React from "react";
import type { StrategyVariant } from "@/lib/ai/schemas";
import { cn } from "@/lib/utils";
import {
  Zap, Users, Heart, Crown, Wifi, ShoppingBag, Repeat2, Building2,
  Target, TrendingUp, Globe, CheckCircle2, ArrowRight,
} from "lucide-react";

const variantConfig: Record<string, {
  icon: React.ElementType;
  color: string;
  bg: string;
  border: string;
  badge: string;
  accentBar: string;
}> = {
  awareness:      { icon: Zap,         color: "text-amber-700",  bg: "bg-amber-50",   border: "border-amber-200",  badge: "bg-amber-100 text-amber-800",  accentBar: "bg-amber-500" },
  fan_engagement: { icon: Users,       color: "text-blue-700",   bg: "bg-blue-50",    border: "border-blue-200",   badge: "bg-blue-100 text-blue-800",    accentBar: "bg-blue-500" },
  community:      { icon: Heart,       color: "text-rose-700",   bg: "bg-rose-50",    border: "border-rose-200",   badge: "bg-rose-100 text-rose-800",    accentBar: "bg-rose-500" },
  premium:        { icon: Crown,       color: "text-violet-700", bg: "bg-violet-50",  border: "border-violet-200", badge: "bg-violet-100 text-violet-800", accentBar: "bg-violet-500" },
  digital:        { icon: Wifi,        color: "text-cyan-700",   bg: "bg-cyan-50",    border: "border-cyan-200",   badge: "bg-cyan-100 text-cyan-800",    accentBar: "bg-cyan-500" },
  product_led:    { icon: ShoppingBag, color: "text-orange-700", bg: "bg-orange-50",  border: "border-orange-200", badge: "bg-orange-100 text-orange-800", accentBar: "bg-orange-500" },
  loyalty:        { icon: Repeat2,     color: "text-green-700",  bg: "bg-green-50",   border: "border-green-200",  badge: "bg-green-100 text-green-800",  accentBar: "bg-green-500" },
  stadium:        { icon: Building2,   color: "text-indigo-700", bg: "bg-indigo-50",  border: "border-indigo-200", badge: "bg-indigo-100 text-indigo-800", accentBar: "bg-indigo-500" },
};
const defaultConfig = {
  icon: Target, color: "text-slate-700", bg: "bg-slate-50", border: "border-slate-200",
  badge: "bg-slate-100 text-slate-800", accentBar: "bg-slate-400",
};

interface StrategyCardsProps {
  variants: StrategyVariant[];
}

export function StrategyCards({ variants }: StrategyCardsProps) {
  if (!variants || variants.length === 0) return null;

  return (
    <div className="space-y-8">
      {variants.map((v, idx) => {
        const cfg = variantConfig[v.id] ?? defaultConfig;
        const Icon = cfg.icon;

        return (
          <div
            key={v.id}
            className={cn(
              "relative rounded-2xl border bg-white overflow-hidden",
              cfg.border
            )}
          >
            {/* Accent bar top */}
            <div className={cn("h-1 w-full", cfg.accentBar)} />

            {/* Strategy number badge */}
            <div className="absolute top-5 right-5 flex items-center justify-center w-8 h-8 rounded-full bg-slate-100 text-slate-500 text-xs font-bold">
              {idx + 1}
            </div>

            <div className="p-6 sm:p-8">
              {/* Header */}
              <div className="flex items-start gap-4 mb-5">
                <div className={cn("rounded-xl p-3 shrink-0 border", cfg.bg, cfg.border)}>
                  <Icon className={cn("h-6 w-6", cfg.color)} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2 mb-1.5">
                    <h3 className="text-xl font-bold text-slate-900">{v.label}</h3>
                    <span className={cn("rounded-full px-2.5 py-0.5 text-xs font-semibold", cfg.badge)}>
                      {v.id.replace(/_/g, " ")}
                    </span>
                  </div>
                  {v.tagline && (
                    <p className="text-base text-slate-500 italic">&ldquo;{v.tagline}&rdquo;</p>
                  )}
                </div>
              </div>

              {/* Description */}
              <p className="text-slate-600 leading-relaxed mb-6">{v.description}</p>

              {/* Two-column detail area */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                {/* Key activations */}
                <div className="rounded-xl bg-slate-50 border border-slate-100 p-5">
                  <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-500 mb-4">
                    <Zap className="h-3.5 w-3.5" />
                    Ativações Principais
                  </div>
                  <ul className="space-y-2.5">
                    {v.key_activations.map((act, i) => (
                      <li key={i} className="flex items-start gap-2.5">
                        <CheckCircle2 className={cn("h-4 w-4 shrink-0 mt-0.5", cfg.color)} />
                        <span className="text-sm text-slate-700 leading-relaxed">{act}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                {/* Stats & differentiators */}
                <div className="space-y-3">
                  {v.audience_fit && (
                    <div className={cn("rounded-xl border p-4", cfg.bg, cfg.border)}>
                      <div className={cn("flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider mb-2", cfg.color)}>
                        <Users className="h-3.5 w-3.5" />
                        Público-Alvo
                      </div>
                      <p className="text-sm text-slate-700 leading-relaxed">{v.audience_fit}</p>
                    </div>
                  )}
                  {v.estimated_reach && (
                    <div className="rounded-xl bg-blue-50 border border-blue-100 p-4">
                      <div className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-blue-600 mb-2">
                        <TrendingUp className="h-3.5 w-3.5" />
                        Alcance Estimado
                      </div>
                      <p className="text-sm text-blue-800 font-semibold">{v.estimated_reach}</p>
                    </div>
                  )}
                  {v.differentiator && (
                    <div className="rounded-xl bg-amber-50 border border-amber-100 p-4">
                      <div className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-amber-600 mb-2">
                        <Globe className="h-3.5 w-3.5" />
                        Diferencial
                      </div>
                      <p className="text-sm text-amber-800">{v.differentiator}</p>
                    </div>
                  )}
                  {!v.audience_fit && !v.estimated_reach && !v.differentiator && (
                    <div className="flex items-center gap-2 text-sm text-slate-400 p-4">
                      <ArrowRight className="h-4 w-4" />
                      Estratégia personalizada para seus objetivos
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
