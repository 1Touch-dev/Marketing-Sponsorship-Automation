"use client";

import React from "react";
import type { StrategyVariant } from "@/lib/ai/schemas";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import {
  Zap, Users, Heart, Crown, Wifi, ShoppingBag, Repeat2, Building2,
  Target, TrendingUp, Globe,
} from "lucide-react";

const variantConfig: Record<string, { icon: React.ElementType; color: string; bg: string; badge: string }> = {
  awareness:      { icon: Zap,          color: "text-amber-600",   bg: "bg-amber-50 border-amber-200",    badge: "bg-amber-100 text-amber-800" },
  fan_engagement: { icon: Users,        color: "text-blue-600",    bg: "bg-blue-50 border-blue-200",      badge: "bg-blue-100 text-blue-800" },
  community:      { icon: Heart,        color: "text-rose-600",    bg: "bg-rose-50 border-rose-200",      badge: "bg-rose-100 text-rose-800" },
  premium:        { icon: Crown,        color: "text-violet-600",  bg: "bg-violet-50 border-violet-200",  badge: "bg-violet-100 text-violet-800" },
  digital:        { icon: Wifi,         color: "text-cyan-600",    bg: "bg-cyan-50 border-cyan-200",      badge: "bg-cyan-100 text-cyan-800" },
  product_led:    { icon: ShoppingBag,  color: "text-orange-600",  bg: "bg-orange-50 border-orange-200",  badge: "bg-orange-100 text-orange-800" },
  loyalty:        { icon: Repeat2,      color: "text-green-600",   bg: "bg-green-50 border-green-200",    badge: "bg-green-100 text-green-800" },
  stadium:        { icon: Building2,    color: "text-indigo-600",  bg: "bg-indigo-50 border-indigo-200",  badge: "bg-indigo-100 text-indigo-800" },
};

const defaultConfig = { icon: Target, color: "text-slate-600", bg: "bg-slate-50 border-slate-200", badge: "bg-slate-100 text-slate-800" };

interface StrategyTabsProps {
  variants: StrategyVariant[];
  className?: string;
}

export function StrategyTabs({ variants, className }: StrategyTabsProps) {
  if (!variants || variants.length === 0) return null;

  return (
    <div className={className}>
      <Tabs defaultValue={variants[0].id}>
        <TabsList className="flex flex-wrap h-auto gap-1.5 bg-slate-100/80 p-2 rounded-xl mb-2 w-full">
          {variants.map((v) => {
            const cfg = variantConfig[v.id] ?? defaultConfig;
            const Icon = cfg.icon;
            return (
              <TabsTrigger
                key={v.id}
                value={v.id}
                className="flex items-center gap-1.5 px-4 py-2 text-sm rounded-lg data-[state=active]:shadow-sm data-[state=active]:text-slate-900 font-medium"
              >
                <Icon className={cn("h-3.5 w-3.5 shrink-0", cfg.color)} />
                {v.label}
              </TabsTrigger>
            );
          })}
        </TabsList>

        {variants.map((v) => {
          const cfg = variantConfig[v.id] ?? defaultConfig;
          const Icon = cfg.icon;

          return (
            <TabsContent key={v.id} value={v.id} className="mt-0">
              <div className="rounded-2xl border border-slate-200 bg-white p-6 sm:p-8 space-y-6">
                {/* Header */}
                <div className="flex items-start gap-4">
                  <div className={cn("rounded-xl p-3 shrink-0 border", cfg.bg)}>
                    <Icon className={cn("h-6 w-6", cfg.color)} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2 mb-2">
                      <h3 className="text-xl font-bold text-slate-900">{v.label}</h3>
                      <span className={cn("rounded-full px-2.5 py-0.5 text-xs font-semibold", cfg.badge)}>
                        {v.id.replace(/_/g, " ")}
                      </span>
                    </div>
                    {v.tagline && (
                      <p className="text-base text-slate-600 italic font-medium">
                        &ldquo;{v.tagline}&rdquo;
                      </p>
                    )}
                  </div>
                </div>

                {/* Description */}
                <p className="text-slate-600 leading-relaxed text-sm sm:text-base">{v.description}</p>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                  {/* Activations */}
                  <div className="rounded-xl bg-slate-50 border border-slate-100 p-5">
                    <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-500 mb-3">
                      <Zap className="h-3.5 w-3.5" />
                      Ativações Principais
                    </div>
                    <ul className="space-y-2">
                      {v.key_activations.map((act, i) => (
                        <li key={i} className="flex items-start gap-2.5 text-sm text-slate-700">
                          <span className={cn("mt-1.5 h-1.5 w-1.5 rounded-full shrink-0", cfg.color.replace("text-","bg-"))} />
                          {act}
                        </li>
                      ))}
                    </ul>
                  </div>

                  {/* Details */}
                  <div className="space-y-3">
                    {v.audience_fit && (
                      <div className={cn("rounded-xl border p-4", cfg.bg)}>
                        <div className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider mb-1.5" style={{color: "var(--tw-text-opacity)"}}>
                          <Users className={cn("h-3.5 w-3.5", cfg.color)} />
                          <span className={cfg.color}>Público-Alvo</span>
                        </div>
                        <p className="text-sm text-slate-700 leading-relaxed">{v.audience_fit}</p>
                      </div>
                    )}
                    {v.estimated_reach && (
                      <div className="rounded-xl bg-blue-50 border border-blue-100 p-4">
                        <div className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-blue-600 mb-1.5">
                          <TrendingUp className="h-3.5 w-3.5" />
                          Alcance Estimado
                        </div>
                        <p className="text-sm text-blue-800 font-medium">{v.estimated_reach}</p>
                      </div>
                    )}
                    {v.differentiator && (
                      <div className="rounded-xl bg-amber-50 border border-amber-100 p-4">
                        <div className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-amber-600 mb-1.5">
                          <Globe className="h-3.5 w-3.5" />
                          Diferencial
                        </div>
                        <p className="text-sm text-amber-800">{v.differentiator}</p>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </TabsContent>
          );
        })}
      </Tabs>
    </div>
  );
}
