"use client";

import React, { useState } from "react";
import { LayoutTemplate, Loader2, X, CheckCircle2 } from "lucide-react";

/**
 * Save the current proposal as a reusable, industry-tagged template.
 * Snapshots the proposal's content via the /api/proposal-templates endpoint.
 */
export function SaveAsTemplateButton({
  proposalId,
  defaultIndustry,
}: {
  proposalId: string;
  defaultIndustry?: string | null;
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [industry, setIndustry] = useState(defaultIndustry ?? "");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    if (!name.trim()) {
      setError("Dê um nome ao template.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/proposal-templates", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          industry: industry.trim() || undefined,
          from_proposal_id: proposalId,
        }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error ?? "Falha ao salvar template");
      setDone(true);
      setTimeout(() => {
        setOpen(false);
        setDone(false);
        setName("");
      }, 1200);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        title="Salvar esta proposta como template reutilizável"
        className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-colors"
      >
        <LayoutTemplate className="h-3.5 w-3.5" /> Salvar como template
      </button>

      {open && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-xl bg-white p-5 shadow-xl">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-slate-800">Salvar como template</h3>
              <button onClick={() => setOpen(false)} className="text-slate-400 hover:text-slate-600">
                <X className="h-4 w-4" />
              </button>
            </div>

            {done ? (
              <div className="flex items-center gap-2 text-green-700 text-sm py-6 justify-center">
                <CheckCircle2 className="h-5 w-5" /> Template salvo!
              </div>
            ) : (
              <div className="space-y-3">
                <div className="space-y-1">
                  <label className="text-xs font-medium text-slate-600">Nome do template *</label>
                  <input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Ex.: Patrocínio Bebidas — Nacional"
                    className="w-full text-sm border rounded-md px-3 py-2 outline-none focus:ring-2 ring-green-500/30"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-slate-600">Indústria (opcional)</label>
                  <input
                    value={industry}
                    onChange={(e) => setIndustry(e.target.value)}
                    placeholder="Ex.: Bebidas, Bancos, Varejo"
                    className="w-full text-sm border rounded-md px-3 py-2 outline-none focus:ring-2 ring-green-500/30"
                  />
                  <p className="text-[11px] text-slate-400">
                    Templates são reutilizáveis em novas propostas, filtrados por indústria.
                  </p>
                </div>
                {error && <p className="text-xs text-red-600">{error}</p>}
                <div className="flex justify-end gap-2 pt-1">
                  <button
                    onClick={() => setOpen(false)}
                    className="rounded-lg px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-100"
                  >
                    Cancelar
                  </button>
                  <button
                    onClick={save}
                    disabled={busy}
                    className="flex items-center gap-1.5 rounded-lg bg-green-600 px-4 py-1.5 text-sm font-semibold text-white hover:bg-green-700 disabled:opacity-60"
                  >
                    {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />} Salvar template
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
