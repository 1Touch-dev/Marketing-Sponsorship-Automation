"use client";

import React, { useCallback, useEffect, useState } from "react";
import { CheckCircle2, ImageIcon, Loader2, Link2 } from "lucide-react";
import type { StrategyVariant } from "@/lib/ai/schemas";
import {
  INVENTORY_ASSIGN_OPTIONS,
  type ImageJobRow,
  type ProposalImageAsset,
  buildProposalImagesFromJobs,
  resolveJobImageUrl,
} from "@/lib/proposals/proposal-images";

type Props = {
  proposalId: string;
  strategyVariants?: StrategyVariant[] | null;
  onImagesChange?: (images: ProposalImageAsset[]) => void;
};

export function ProposalImageManager({
  proposalId,
  strategyVariants,
  onImagesChange,
}: Props) {
  const [jobs, setJobs] = useState<ImageJobRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/image-generation?proposal_id=${proposalId}`);
      const data = await res.json();
      if (res.ok) {
        const rows = (data.jobs ?? []) as ImageJobRow[];
        setJobs(rows);
        const assets = buildProposalImagesFromJobs(
          rows.filter((j) => j.status === "completed" || j.status === "approved")
        );
        onImagesChange?.(assets);
      }
    } finally {
      setLoading(false);
    }
  }, [proposalId, onImagesChange]);

  useEffect(() => {
    load();
  }, [load]);

  async function patchJob(
    jobId: string,
    body: Record<string, unknown>
  ): Promise<void> {
    setSavingId(jobId);
    try {
      const res = await fetch("/api/image-generation", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ job_id: jobId, ...body }),
      });
      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.error ?? "Update failed");
      }
      await load();
    } finally {
      setSavingId(null);
    }
  }

  const visibleJobs = jobs.filter(
    (j) =>
      j.status === "completed" ||
      j.status === "approved" ||
      (j.output_urls && j.output_urls.length > 0)
  );

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-xs text-slate-500 py-4">
        <Loader2 className="h-4 w-4 animate-spin" /> Carregando imagens…
      </div>
    );
  }

  if (visibleJobs.length === 0) {
    return (
      <p className="text-xs text-slate-500 py-2">
        Nenhuma imagem gerada ainda. Use o mockup de camisa ou criativos de campanha acima.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <ImageIcon className="h-4 w-4 text-slate-600" />
        <span className="text-xs font-semibold text-slate-700">
          Selecionar imagem e vincular à campanha / inventário
        </span>
      </div>

      <div className="space-y-4">
        {visibleJobs.map((job) => {
          const urls = (job.output_urls ?? []).filter((u) => u?.url && !u.url.startsWith("data:"));
          const selected = job.selected_url ?? resolveJobImageUrl(job);
          const strategies = strategyVariants ?? [];

          return (
            <div
              key={job.id}
              className="rounded-xl border border-slate-200 bg-white p-3 space-y-3"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-xs font-medium text-slate-700 capitalize">
                  {job.display_label || job.job_type.replace(/_/g, " ")}
                </span>
                {selected && (
                  <span className="text-[10px] text-green-700 bg-green-50 px-2 py-0.5 rounded-full flex items-center gap-1">
                    <CheckCircle2 className="h-3 w-3" /> Na proposta
                  </span>
                )}
              </div>

              {urls.length > 0 ? (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {urls.map((u, idx) => (
                    <button
                      key={idx}
                      type="button"
                      disabled={savingId === job.id}
                      onClick={() =>
                        patchJob(job.id, {
                          action: "select_image",
                          selected_url: u.url,
                        })
                      }
                      className={`relative rounded-lg overflow-hidden border-2 transition-all ${
                        selected === u.url
                          ? "border-green-600 ring-2 ring-green-200"
                          : "border-slate-200 hover:border-green-400"
                      }`}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={u.url}
                        alt={`Opção ${idx + 1}`}
                        className="w-full h-24 object-cover"
                      />
                      {selected === u.url && (
                        <span className="absolute top-1 right-1 bg-green-600 text-white text-[9px] px-1.5 py-0.5 rounded">
                          Selecionada
                        </span>
                      )}
                    </button>
                  ))}
                </div>
              ) : selected ? (
                <div className="rounded-lg overflow-hidden border border-slate-200 max-w-xs">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={selected} alt="Selecionada" className="w-full h-32 object-cover" />
                </div>
              ) : null}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1 border-t border-slate-100">
                <label className="text-[10px] text-slate-500">
                  Campanha / estratégia
                  <select
                    className="mt-1 w-full text-xs border border-slate-200 rounded-lg px-2 py-1.5 bg-white"
                    value={job.strategy_variant_id ?? ""}
                    disabled={savingId === job.id}
                    onChange={(e) => {
                      const opt = strategies.find((s) => s.id === e.target.value);
                      patchJob(job.id, {
                        action: "update_metadata",
                        strategy_variant_id: e.target.value || null,
                        strategy_label: opt?.label ?? null,
                      });
                    }}
                  >
                    <option value="">— Não vinculado —</option>
                    {strategies.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="text-[10px] text-slate-500">
                  Inventário
                  <select
                    className="mt-1 w-full text-xs border border-slate-200 rounded-lg px-2 py-1.5 bg-white"
                    value={job.inventory_label ?? ""}
                    disabled={savingId === job.id}
                    onChange={(e) => {
                      const opt = INVENTORY_ASSIGN_OPTIONS.find((o) => o.id === e.target.value);
                      patchJob(job.id, {
                        action: "update_metadata",
                        inventory_label: e.target.value || null,
                        display_label: opt?.label ?? null,
                      });
                    }}
                  >
                    <option value="">— Não vinculado —</option>
                    {INVENTORY_ASSIGN_OPTIONS.map((o) => (
                      <option key={o.id} value={o.id}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={savingId === job.id || job.status === "completed"}
                  onClick={() =>
                    patchJob(job.id, {
                      action: "approve",
                      approved_by: "admin",
                    })
                  }
                  className="text-[10px] text-indigo-600 hover:underline flex items-center gap-1"
                >
                  <Link2 className="h-3 w-3" />
                  Aprovar job
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
