"use client";

import React, { useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { CheckCircle2, ExternalLink, Loader2, ImageIcon, FileText } from "lucide-react";
import {
  resolveJobImageUrl,
  resolveProposalImageLabel,
  type ImageJobRow,
} from "@/lib/proposals/proposal-images";

type JobRow = ImageJobRow & { proposal_id?: string | null };

type DraftProposal = {
  id: string;
  title: string;
  status: string;
  companies?: { company_name: string } | null;
};

export function BulkApproveClient({
  initialJobs,
  draftProposals,
}: {
  initialJobs: JobRow[];
  draftProposals: DraftProposal[];
}) {
  const [jobs, setJobs] = useState(initialJobs);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const pending = jobs.filter((j) => j.status === "pending_approval" || j.status === "approved");

  function toggle(id: string) {
    setSelected((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }

  function selectAll() {
    setSelected(new Set(pending.map((j) => j.id)));
  }

  async function bulkApprove() {
    if (selected.size === 0) return;
    setLoading(true);
    setMsg(null);
    try {
      const res = await fetch("/api/image-generation", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "bulk_approve",
          job_ids: Array.from(selected),
          approved_by: "bulk_ui",
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed");
      setJobs((prev) =>
        prev.map((j) =>
          selected.has(j.id) ? { ...j, status: "completed" as const } : j
        )
      );
      setSelected(new Set());
      setMsg(`${data.count ?? selected.size} imagem(ns) aprovada(s).`);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Erro");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-8 max-w-5xl">
      <div className="rounded-xl border border-slate-200 bg-white p-4">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <div className="flex items-center gap-2">
            <ImageIcon className="h-5 w-5 text-green-700" />
            <h2 className="font-semibold text-slate-900">Imagens pendentes</h2>
            <span className="text-xs bg-slate-100 px-2 py-0.5 rounded-full">{pending.length}</span>
          </div>
          <div className="flex gap-2">
            <Button type="button" variant="outline" size="sm" onClick={selectAll}>
              Selecionar todas
            </Button>
            <Button
              type="button"
              size="sm"
              className="bg-green-600 hover:bg-green-700"
              disabled={loading || selected.size === 0}
              onClick={bulkApprove}
            >
              {loading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <CheckCircle2 className="h-4 w-4" />
              )}
              Aprovar selecionadas ({selected.size})
            </Button>
          </div>
        </div>
        {msg && <p className="text-xs text-green-700 mb-3">{msg}</p>}

        <div className="space-y-3 max-h-[480px] overflow-y-auto">
          {pending.length === 0 ? (
            <p className="text-sm text-slate-500">Nenhuma imagem pendente.</p>
          ) : (
            pending.map((job) => {
              const url = resolveJobImageUrl(job);
              const company = job.proposal_id ? `Proposta ${job.proposal_id.slice(0, 8)}…` : "—";
              return (
                <label
                  key={job.id}
                  className="flex gap-3 p-3 rounded-lg border border-slate-200 hover:bg-slate-50 cursor-pointer"
                >
                  <input
                    type="checkbox"
                    checked={selected.has(job.id)}
                    onChange={() => toggle(job.id)}
                    className="mt-1"
                  />
                  {url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={url} alt="" className="w-20 h-14 object-cover rounded border" />
                  ) : (
                    <div className="w-20 h-14 bg-slate-100 rounded flex items-center justify-center text-xs text-slate-400">
                      Sem img
                    </div>
                  )}
                  <div className="flex-1 min-w-0 text-xs">
                    <div className="font-semibold text-slate-800">{company}</div>
                    <div className="text-slate-500 truncate">
                      {resolveProposalImageLabel(job)}
                    </div>
                    {job.proposal_id && (
                      <Link
                        href={`/proposals/${job.proposal_id}`}
                        className="text-indigo-600 hover:underline inline-flex items-center gap-1 mt-1"
                      >
                        Ver proposta <ExternalLink className="h-3 w-3" />
                      </Link>
                    )}
                  </div>
                  <span className="text-[10px] text-amber-700 bg-amber-50 px-2 py-0.5 rounded h-fit">
                    {job.status}
                  </span>
                </label>
              );
            })
          )}
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-4">
        <div className="flex items-center gap-2 mb-3">
          <FileText className="h-5 w-5 text-slate-600" />
          <h2 className="font-semibold text-slate-900">Propostas em revisão</h2>
        </div>
        <p className="text-xs text-slate-500 mb-3">
          Geradas em lote via{" "}
          <Link href="/campaigns/bulk" className="text-indigo-600 hover:underline">
            Bulk Campaigns
          </Link>
          — personalize e publique por empresa.
        </p>
        <ul className="space-y-2">
          {draftProposals.map((p) => (
            <li key={p.id} className="flex items-center justify-between text-sm border-b border-slate-100 pb-2">
              <span>
                <span className="font-medium">{p.companies?.company_name}</span>
                <span className="text-slate-400"> · {p.title}</span>
              </span>
              <Link
                href={`/proposals/${p.id}/view`}
                className="text-xs text-indigo-600 hover:underline"
              >
                Editar / visualizar
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
