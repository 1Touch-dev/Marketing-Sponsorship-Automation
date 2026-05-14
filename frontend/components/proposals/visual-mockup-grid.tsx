"use client";

import type { VisualPrompt } from "@/lib/ai/schemas";
import { cn } from "@/lib/utils";
import { ImageIcon, Shirt, Building2, Monitor, Share2, Package, CalendarDays, Sparkles } from "lucide-react";

const typeIcons: Record<VisualPrompt["type"], React.ElementType> = {
  jersey: Shirt,
  stadium_banner: Building2,
  led_board: Monitor,
  social_media: Share2,
  product_placement: Package,
  event_activation: CalendarDays,
  campaign_hero: Sparkles,
};

const typeColors: Record<VisualPrompt["type"], string> = {
  jersey: "from-green-500 to-emerald-600",
  stadium_banner: "from-blue-500 to-indigo-600",
  led_board: "from-violet-500 to-purple-600",
  social_media: "from-pink-500 to-rose-600",
  product_placement: "from-orange-500 to-amber-600",
  event_activation: "from-teal-500 to-cyan-600",
  campaign_hero: "from-yellow-400 to-orange-500",
};

interface VisualMockupGridProps {
  visuals: VisualPrompt[];
  companyName?: string;
  className?: string;
}

export function VisualMockupGrid({ visuals, companyName, className }: VisualMockupGridProps) {
  if (!visuals || visuals.length === 0) return null;

  return (
    <div className={cn("grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4", className)}>
      {visuals.map((visual) => {
        const Icon = typeIcons[visual.type] ?? ImageIcon;
        const gradient = typeColors[visual.type] ?? "from-slate-500 to-slate-600";

        return (
          <div
            key={visual.id}
            className="group relative rounded-xl border border-slate-200 bg-white overflow-hidden shadow-sm hover:shadow-md transition-shadow"
          >
            {/* Mockup placeholder */}
            <div className={cn("relative h-40 bg-gradient-to-br flex items-center justify-center", gradient)}>
              <Icon className="h-16 w-16 text-white/30" />
              {/* Overlay text */}
              <div className="absolute inset-0 flex flex-col items-center justify-center p-4">
                <Icon className="h-8 w-8 text-white mb-2" />
                <span className="text-white font-bold text-sm text-center leading-tight">{visual.label}</span>
                {companyName && (
                  <span className="mt-1 text-white/70 text-xs text-center">{companyName}</span>
                )}
              </div>
              {/* Visual type badge */}
              <div className="absolute top-2 right-2">
                <span className="rounded-full bg-black/20 backdrop-blur-sm px-2 py-0.5 text-xs text-white font-medium">
                  {visual.type.replace(/_/g, " ")}
                </span>
              </div>
            </div>

            {/* Info panel */}
            <div className="p-4">
              <div className="font-semibold text-slate-800 text-sm mb-1">{visual.label}</div>
              {visual.placeholder_description && (
                <p className="text-xs text-slate-500 mb-3">{visual.placeholder_description}</p>
              )}
              {/* Prompt (collapsed) */}
              <details className="group/details">
                <summary className="cursor-pointer text-xs text-blue-600 hover:text-blue-800 font-medium select-none">
                  Ver prompt de geração ↓
                </summary>
                <div className="mt-2 rounded-md bg-slate-50 p-3 text-xs text-slate-600 leading-relaxed font-mono whitespace-pre-wrap">
                  {visual.prompt}
                </div>
                {visual.style_notes && (
                  <div className="mt-1 text-xs text-slate-400 italic">{visual.style_notes}</div>
                )}
              </details>
            </div>
          </div>
        );
      })}
    </div>
  );
}
