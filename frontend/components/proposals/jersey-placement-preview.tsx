"use client";

import React from "react";
import Image from "next/image";
import { cn } from "@/lib/utils";
import {
  JERSEY_BASE_PUBLIC_PATH,
  JERSEY_PLACEMENTS,
  type JerseyPlacementId,
} from "@/lib/media/jersey-placements";

export function JerseyPlacementPreview({
  placement,
  className,
}: {
  placement: JerseyPlacementId;
  className?: string;
}) {
  const zone = JERSEY_PLACEMENTS.find((p) => p.id === placement);
  if (!zone) return null;

  return (
    <div className={cn("relative rounded-xl overflow-hidden border border-slate-200 bg-slate-100", className)}>
      <Image
        src={JERSEY_BASE_PUBLIC_PATH}
        alt="Camisa Coritiba 2026 — referência de posicionamento"
        width={429}
        height={540}
        className="w-full h-auto object-cover"
        priority={false}
      />
      <div
        className="absolute border-2 border-green-500 bg-green-500/25 rounded-sm pointer-events-none"
        style={{
          left: `${zone.x * 100}%`,
          top: `${zone.y * 100}%`,
          width: `${zone.w * 100}%`,
          height: `${zone.h * 100}%`,
        }}
        aria-hidden
      />
      <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/70 to-transparent px-3 py-2">
        <p className="text-[10px] text-white font-medium">{zone.labelPt}</p>
        <p className="text-[9px] text-white/80">
          Escudo fixo (peito esq. do atleta) · Patrocinador na zona destacada
        </p>
      </div>
    </div>
  );
}
