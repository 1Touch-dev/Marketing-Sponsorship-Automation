"use client";

import type { PricingTier } from "@/lib/ai/schemas";
import { cn } from "@/lib/utils";
import { CheckCircle2, Star } from "lucide-react";

interface PricingTiersProps {
  tiers: PricingTier[];
  className?: string;
}

const tierColors = {
  low: {
    border: "border-slate-200",
    header: "bg-slate-50",
    badge: "bg-slate-100 text-slate-700",
    accent: "text-slate-600",
    button: "bg-slate-800 text-white hover:bg-slate-700",
  },
  mid: {
    border: "border-blue-500 ring-2 ring-blue-500 ring-offset-2",
    header: "bg-blue-600",
    badge: "bg-blue-100 text-blue-800",
    accent: "text-blue-700",
    button: "bg-blue-600 text-white hover:bg-blue-700",
  },
  high: {
    border: "border-amber-400",
    header: "bg-gradient-to-r from-amber-500 to-orange-500",
    badge: "bg-amber-100 text-amber-800",
    accent: "text-amber-600",
    button: "bg-gradient-to-r from-amber-500 to-orange-500 text-white hover:opacity-90",
  },
};

export function PricingTiers({ tiers, className }: PricingTiersProps) {
  if (!tiers || tiers.length === 0) return null;

  return (
    <div className={cn("grid grid-cols-1 md:grid-cols-3 gap-6", className)}>
      {tiers.map((tier) => {
        const colors = tierColors[tier.tier] ?? tierColors.mid;
        const isHighlighted = tier.highlight;

        return (
          <div
            key={tier.tier}
            className={cn(
              "relative rounded-2xl border bg-white shadow-sm overflow-hidden flex flex-col transition-shadow hover:shadow-lg",
              colors.border,
              isHighlighted && "scale-[1.02]",
            )}
          >
            {isHighlighted && (
              <div className="absolute top-3 right-3 z-10">
                <span className="inline-flex items-center gap-1 rounded-full bg-blue-600 px-3 py-1 text-xs font-semibold text-white shadow">
                  <Star className="h-3 w-3 fill-white" />
                  Recomendado
                </span>
              </div>
            )}

            {/* Header */}
            <div className={cn("px-6 py-5 text-white", colors.header, tier.tier === "low" && "text-slate-800")}>
              <div className="text-xs font-semibold uppercase tracking-widest opacity-75 mb-1">
                {tier.tier === "low" ? "Apoiador" : tier.tier === "mid" ? "Master" : "Diamante"}
              </div>
              <div className="text-xl font-bold">{tier.label}</div>
              <div className="mt-2 text-2xl font-extrabold leading-none">{tier.price_range}</div>
            </div>

            {/* Body */}
            <div className="p-6 flex flex-col gap-5 flex-1">
              {/* Activations */}
              {tier.activations && tier.activations.length > 0 && (
                <div>
                  <div className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">
                    Ativações Incluídas
                  </div>
                  <ul className="space-y-1.5">
                    {tier.activations.map((act, i) => (
                      <li key={i} className="flex items-start gap-2 text-sm text-slate-700">
                        <CheckCircle2 className={cn("h-4 w-4 shrink-0 mt-0.5", colors.accent)} />
                        {act}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Deliverables */}
              {tier.deliverables && tier.deliverables.length > 0 && (
                <div>
                  <div className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">
                    Entregas
                  </div>
                  <ul className="space-y-1.5">
                    {tier.deliverables.map((del, i) => (
                      <li key={i} className="flex items-start gap-2 text-sm text-slate-700">
                        <span className={cn("mt-1 h-1.5 w-1.5 rounded-full shrink-0", tier.tier === "low" ? "bg-slate-400" : tier.tier === "mid" ? "bg-blue-500" : "bg-amber-500")} />
                        {del}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Exposure details */}
              {(tier.digital_exposure || tier.stadium_exposure || tier.visibility) && (
                <div className="rounded-lg bg-slate-50 p-4 text-sm space-y-1.5">
                  {tier.visibility && (
                    <div><span className="font-medium text-slate-600">Visibilidade:</span> <span className="text-slate-500">{tier.visibility}</span></div>
                  )}
                  {tier.digital_exposure && (
                    <div><span className="font-medium text-slate-600">Digital:</span> <span className="text-slate-500">{tier.digital_exposure}</span></div>
                  )}
                  {tier.stadium_exposure && (
                    <div><span className="font-medium text-slate-600">Estádio:</span> <span className="text-slate-500">{tier.stadium_exposure}</span></div>
                  )}
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
