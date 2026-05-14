"use client";

import type { StrategyVariant } from "@/lib/ai/schemas";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { Zap, Users, Heart, Crown, Wifi, ShoppingBag, Repeat2, Building2 } from "lucide-react";

const variantIcons: Record<string, React.ElementType> = {
  awareness: Zap,
  fan_engagement: Users,
  community: Heart,
  premium: Crown,
  digital: Wifi,
  product_led: ShoppingBag,
  loyalty: Repeat2,
  stadium: Building2,
};

interface StrategyTabsProps {
  variants: StrategyVariant[];
  className?: string;
}

export function StrategyTabs({ variants, className }: StrategyTabsProps) {
  if (!variants || variants.length === 0) return null;

  return (
    <div className={className}>
      <Tabs defaultValue={variants[0].id}>
        <TabsList className="w-full flex-wrap h-auto gap-1 bg-slate-100 p-1.5">
          {variants.map((v) => {
            const Icon = variantIcons[v.id] ?? Zap;
            return (
              <TabsTrigger key={v.id} value={v.id} className="flex items-center gap-1.5 px-4 py-2 text-sm">
                <Icon className="h-3.5 w-3.5" />
                {v.label}
              </TabsTrigger>
            );
          })}
        </TabsList>

        {variants.map((v) => (
          <TabsContent key={v.id} value={v.id} className="mt-4">
            <div className="rounded-xl border border-slate-200 bg-white p-6 space-y-5">
              {/* Tagline */}
              {v.tagline && (
                <p className="text-lg font-semibold text-slate-800 italic">
                  &ldquo;{v.tagline}&rdquo;
                </p>
              )}

              {/* Description */}
              <p className="text-slate-600 leading-relaxed">{v.description}</p>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Key activations */}
                <div>
                  <div className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">
                    Ativações Principais
                  </div>
                  <ul className="space-y-1.5">
                    {v.key_activations.map((act, i) => (
                      <li key={i} className="flex items-start gap-2 text-sm text-slate-700">
                        <span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-blue-500 shrink-0" />
                        {act}
                      </li>
                    ))}
                  </ul>
                </div>

                {/* Details column */}
                <div className="space-y-3">
                  {v.audience_fit && (
                    <div className="rounded-lg bg-slate-50 p-3">
                      <div className="text-xs font-semibold text-slate-500 mb-1">Público-Alvo</div>
                      <p className="text-sm text-slate-700">{v.audience_fit}</p>
                    </div>
                  )}
                  {v.estimated_reach && (
                    <div className="rounded-lg bg-blue-50 p-3">
                      <div className="text-xs font-semibold text-blue-600 mb-1">Alcance Estimado</div>
                      <p className="text-sm text-blue-800">{v.estimated_reach}</p>
                    </div>
                  )}
                  {v.differentiator && (
                    <div className="rounded-lg bg-amber-50 p-3">
                      <div className="text-xs font-semibold text-amber-600 mb-1">Diferencial</div>
                      <p className="text-sm text-amber-800">{v.differentiator}</p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}
