"use client";

import type { PricingTier } from "@/lib/ai/schemas";
import { cn } from "@/lib/utils";
import { CheckCircle2, Star, Sparkles, Zap } from "lucide-react";

interface PricingTiersProps {
  tiers: PricingTier[];
  className?: string;
}

const tierConfig = {
  low: {
    gradient: "from-slate-50 to-slate-100",
    headerBg: "bg-slate-800",
    headerText: "text-white",
    accentColor: "text-slate-600",
    checkColor: "text-slate-500",
    dotColor: "bg-slate-400",
    tagBg: "bg-slate-100 text-slate-700",
    border: "border-slate-200",
    badge: null,
    tierLabel: "Apoiador",
    icon: null,
  },
  mid: {
    gradient: "from-blue-50 to-indigo-50",
    headerBg: "bg-gradient-to-r from-blue-600 to-indigo-600",
    headerText: "text-white",
    accentColor: "text-blue-600",
    checkColor: "text-blue-500",
    dotColor: "bg-blue-500",
    tagBg: "bg-blue-50 text-blue-700",
    border: "border-blue-400 ring-2 ring-blue-400/40",
    badge: "Mais popular",
    tierLabel: "Master",
    icon: Star,
  },
  high: {
    gradient: "from-amber-50 to-orange-50",
    headerBg: "bg-gradient-to-r from-amber-500 to-orange-500",
    headerText: "text-white",
    accentColor: "text-amber-600",
    checkColor: "text-amber-500",
    dotColor: "bg-amber-500",
    tagBg: "bg-amber-50 text-amber-700",
    border: "border-amber-300",
    badge: "Premium",
    tierLabel: "Diamante",
    icon: Sparkles,
  },
};

export function PricingTiers({ tiers, className }: PricingTiersProps) {
  if (!tiers || tiers.length === 0) return null;

  // Sort tiers: low, mid, high
  const sorted = [...tiers].sort((a, b) => {
    const order = { low: 0, mid: 1, high: 2 };
    return (order[a.tier] ?? 0) - (order[b.tier] ?? 0);
  });

  return (
    <div className={cn("grid grid-cols-1 md:grid-cols-3 gap-6 items-start", className)}>
      {sorted.map((tier) => {
        const cfg = tierConfig[tier.tier] ?? tierConfig.mid;
        const Icon = cfg.icon;

        return (
          <div
            key={tier.tier}
            className={cn(
              "relative rounded-2xl border bg-white shadow-sm overflow-hidden flex flex-col transition-all duration-200 hover:shadow-lg hover:-translate-y-0.5",
              cfg.border,
              tier.highlight && "md:-mt-3 md:mb-3 shadow-md",
            )}
          >
            {/* Recommended badge */}
            {cfg.badge && (
              <div className="absolute top-0 inset-x-0 flex justify-center">
                <div className="inline-flex items-center gap-1 rounded-b-xl bg-gradient-to-r from-blue-600 to-indigo-600 px-4 py-1.5 text-xs font-bold text-white shadow-lg">
                  {Icon && <Icon className="h-3 w-3" />}
                  {cfg.badge}
                </div>
              </div>
            )}

            {/* Header */}
            <div className={cn("px-6 py-6 text-white", cfg.headerBg, cfg.badge && "pt-8")}>
              <div className="text-xs font-bold uppercase tracking-[0.2em] opacity-70 mb-1">
                Nível {cfg.tierLabel}
              </div>
              <div className="text-xl font-bold">{tier.label}</div>
              <div className="mt-3 pb-1 border-b border-white/20">
                <div className="text-2xl sm:text-3xl font-extrabold leading-none">{tier.price_range}</div>
              </div>
            </div>

            {/* Gradient background body */}
            <div className={cn("flex flex-col flex-1 bg-gradient-to-b", cfg.gradient)}>
              <div className="p-6 flex flex-col gap-5 flex-1">

                {/* Activations */}
                {tier.activations && tier.activations.length > 0 && (
                  <div>
                    <div className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-slate-400 mb-3">
                      <Zap className="h-3 w-3" />
                      Ativações
                    </div>
                    <ul className="space-y-2">
                      {tier.activations.map((act, i) => (
                        <li key={i} className="flex items-start gap-2.5 text-sm text-slate-700">
                          <CheckCircle2 className={cn("h-4 w-4 shrink-0 mt-0.5", cfg.checkColor)} />
                          <span>{act}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Deliverables */}
                {tier.deliverables && tier.deliverables.length > 0 && (
                  <div>
                    <div className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-slate-400 mb-3">
                      <Star className="h-3 w-3" />
                      Entregas Garantidas
                    </div>
                    <ul className="space-y-2">
                      {tier.deliverables.map((del, i) => (
                        <li key={i} className="flex items-start gap-2.5 text-sm text-slate-700">
                          <span className={cn("mt-2 h-1.5 w-1.5 rounded-full shrink-0", cfg.dotColor)} />
                          <span>{del}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Exposure details */}
                {(tier.digital_exposure || tier.stadium_exposure || tier.visibility) && (
                  <div className="rounded-xl bg-white/70 border border-white p-4 space-y-2.5 mt-auto">
                    {tier.visibility && (
                      <div className="text-xs">
                        <span className="font-semibold text-slate-600">Visibilidade: </span>
                        <span className="text-slate-500">{tier.visibility}</span>
                      </div>
                    )}
                    {tier.digital_exposure && (
                      <div className="text-xs">
                        <span className="font-semibold text-slate-600">Digital: </span>
                        <span className="text-slate-500">{tier.digital_exposure}</span>
                      </div>
                    )}
                    {tier.stadium_exposure && (
                      <div className="text-xs">
                        <span className="font-semibold text-slate-600">Estádio: </span>
                        <span className="text-slate-500">{tier.stadium_exposure}</span>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
