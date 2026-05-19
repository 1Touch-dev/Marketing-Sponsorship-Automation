"use client";

import React, { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Check, ChevronRight } from "lucide-react";

type Preset = {
  id: string;
  name: string;
  description: string;
  icon: string;
  sections: string[];
};

export function ProposalPresetPicker({
  selected,
  onChange,
}: {
  selected: string | null;
  onChange: (presetId: string, sections: string[]) => void;
}) {
  const [presets, setPresets] = useState<Record<string, Preset>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/proposals/blocks")
      .then((r) => r.json())
      .then((d: { presets?: Record<string, Preset> }) => {
        setPresets(d.presets ?? {});
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="grid grid-cols-2 gap-3">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="h-20 rounded-xl bg-muted skeleton" />
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
      {Object.values(presets).map((preset) => {
        const isSelected = selected === preset.id;
        return (
          <button
            key={preset.id}
            onClick={() => onChange(preset.id, preset.sections)}
            className={`text-left rounded-xl border p-4 transition-all hover:shadow-md ${isSelected ? "border-primary bg-primary/5 ring-2 ring-primary/30" : "bg-card hover:border-primary/50"}`}
          >
            <div className="flex items-center justify-between mb-2">
              <span className="text-2xl">{preset.icon}</span>
              {isSelected && <Check className="h-4 w-4 text-primary" />}
            </div>
            <div className="font-medium text-sm">{preset.name}</div>
            <div className="text-xs text-muted-foreground mt-1">{preset.description}</div>
            <div className="text-[10px] text-muted-foreground mt-2 flex items-center gap-1">
              <span>{preset.sections.length} sections</span>
              <ChevronRight className="h-2.5 w-2.5" />
            </div>
          </button>
        );
      })}
    </div>
  );
}
