"use client";

import { useState } from "react";
import { Check, Pencil, X } from "lucide-react";

export function InlineIndustryEdit({ companyId, currentIndustry }: { companyId: string; currentIndustry: string | null }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(currentIndustry ?? "");
  const [saving, setSaving] = useState(false);
  const [display, setDisplay] = useState(currentIndustry);

  async function save() {
    setSaving(true);
    try {
      const res = await fetch(`/api/companies/${companyId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ industry: value.trim() || null }),
      });
      if (res.ok) {
        setDisplay(value.trim() || null);
        setEditing(false);
      }
    } finally {
      setSaving(false);
    }
  }

  if (editing) {
    return (
      <span className="inline-flex items-center gap-1">
        <input
          autoFocus
          className="border rounded px-2 py-0.5 text-sm w-48"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") save(); if (e.key === "Escape") setEditing(false); }}
          placeholder="Ex: Automotivo, Financeiro…"
        />
        <button onClick={save} disabled={saving} className="text-green-600 hover:text-green-800 p-0.5">
          <Check className="h-3.5 w-3.5" />
        </button>
        <button onClick={() => setEditing(false)} className="text-slate-400 hover:text-slate-600 p-0.5">
          <X className="h-3.5 w-3.5" />
        </button>
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-1 group cursor-pointer" onClick={() => setEditing(true)}>
      <span className="text-sm text-muted-foreground">{display || "Sem indústria"}</span>
      <Pencil className="h-3 w-3 text-slate-400 opacity-0 group-hover:opacity-100 transition-opacity" />
    </span>
  );
}
