"use client";

import type { VisualPrompt } from "@/lib/ai/schemas";
import { cn } from "@/lib/utils";
import { Shirt, Building2, Monitor, Share2, Package, CalendarDays, Sparkles, Copy, Check } from "lucide-react";
import { useState } from "react";

const typeConfig: Record<VisualPrompt["type"], {
  icon: React.ElementType;
  gradient: string;
  label: string;
  emoji: string;
}> = {
  jersey:           { icon: Shirt,        gradient: "from-green-500 via-emerald-500 to-teal-600",      label: "Camisa / Kit",        emoji: "⚽" },
  stadium_banner:   { icon: Building2,    gradient: "from-blue-500 via-blue-600 to-indigo-700",        label: "Banner Estádio",      emoji: "🏟️" },
  led_board:        { icon: Monitor,      gradient: "from-violet-500 via-purple-500 to-indigo-600",    label: "Painel LED",          emoji: "📺" },
  social_media:     { icon: Share2,       gradient: "from-pink-500 via-rose-500 to-red-500",           label: "Redes Sociais",       emoji: "📱" },
  product_placement:{ icon: Package,      gradient: "from-orange-400 via-orange-500 to-amber-600",     label: "Produto",             emoji: "🎁" },
  event_activation: { icon: CalendarDays, gradient: "from-teal-400 via-cyan-500 to-blue-500",          label: "Ativação no Evento",  emoji: "🎉" },
  campaign_hero:    { icon: Sparkles,     gradient: "from-yellow-400 via-amber-400 to-orange-500",     label: "Hero da Campanha",    emoji: "✨" },
};

interface VisualMockupGridProps {
  visuals: VisualPrompt[];
  companyName?: string;
  className?: string;
}

function VisualCard({ visual, companyName }: { visual: VisualPrompt; companyName?: string }) {
  const [copied, setCopied] = useState(false);
  const cfg = typeConfig[visual.type] ?? typeConfig.campaign_hero;
  const Icon = cfg.icon;

  async function copyPrompt() {
    await navigator.clipboard.writeText(visual.prompt);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  }

  return (
    <div className="group rounded-2xl border border-slate-200 bg-white overflow-hidden shadow-sm hover:shadow-lg transition-all duration-200 hover:-translate-y-0.5 flex flex-col">
      {/* Visual placeholder */}
      <div className={cn("relative h-44 bg-gradient-to-br flex flex-col items-center justify-center p-6", cfg.gradient)}>
        {/* Background pattern */}
        <div className="absolute inset-0 opacity-10"
          style={{ backgroundImage: "repeating-linear-gradient(45deg, transparent, transparent 10px, rgba(255,255,255,.1) 10px, rgba(255,255,255,.1) 20px)" }}
        />
        {/* Type tag */}
        <div className="absolute top-3 left-3">
          <span className="rounded-lg bg-black/20 backdrop-blur-sm px-2.5 py-1 text-xs text-white font-semibold">
            {cfg.emoji} {cfg.label}
          </span>
        </div>
        {/* Aspect ratio badge */}
        {visual.aspect_ratio && (
          <div className="absolute top-3 right-3">
            <span className="rounded-md bg-white/20 px-2 py-0.5 text-xs text-white/80 font-mono">{visual.aspect_ratio}</span>
          </div>
        )}
        {/* Center icon + company */}
        <div className="relative text-center">
          <div className="rounded-2xl bg-white/15 p-4 mb-3 inline-block">
            <Icon className="h-10 w-10 text-white" />
          </div>
          <div className="text-white font-bold text-sm">{visual.label}</div>
          {companyName && <div className="text-white/60 text-xs mt-0.5">{companyName}</div>}
        </div>
      </div>

      {/* Info panel */}
      <div className="p-5 flex flex-col flex-1">
        <div className="font-semibold text-slate-800 text-sm mb-1.5">{visual.label}</div>

        {visual.placeholder_description && (
          <p className="text-xs text-slate-500 mb-4 leading-relaxed flex-1">{visual.placeholder_description}</p>
        )}

        {/* Style notes pill */}
        {visual.style_notes && (
          <div className="mb-3">
            <span className="inline-block rounded-full bg-slate-100 text-slate-600 px-3 py-1 text-xs font-medium">
              {visual.style_notes}
            </span>
          </div>
        )}

        {/* Prompt (expandable) */}
        <details className="group/d mt-auto">
          <summary className="cursor-pointer text-xs font-semibold text-blue-600 hover:text-blue-800 select-none flex items-center gap-1 list-none">
            <span className="group-open/d:rotate-90 transition-transform inline-block">▶</span>
            Ver prompt de geração
          </summary>
          <div className="mt-2 relative">
            <div className="rounded-xl bg-slate-900 text-slate-300 p-4 text-xs leading-relaxed font-mono whitespace-pre-wrap pr-10">
              {visual.prompt}
            </div>
            <button
              onClick={copyPrompt}
              className="absolute top-2 right-2 rounded-lg bg-slate-700 hover:bg-slate-600 p-1.5 text-slate-300 transition-colors"
              title="Copiar prompt"
            >
              {copied ? <Check className="h-3.5 w-3.5 text-green-400" /> : <Copy className="h-3.5 w-3.5" />}
            </button>
          </div>
        </details>
      </div>
    </div>
  );
}

export function VisualMockupGrid({ visuals, companyName, className }: VisualMockupGridProps) {
  if (!visuals || visuals.length === 0) return null;

  return (
    <div className={cn("grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5", className)}>
      {visuals.map((visual) => (
        <VisualCard key={visual.id} visual={visual} companyName={companyName} />
      ))}
    </div>
  );
}
