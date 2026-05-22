"use client";

import React, { useState } from "react";
import { Sparkles, Loader2, Image as ImageIcon, ExternalLink, CheckCircle2 } from "lucide-react";
import type { StrategyVariant } from "@/lib/ai/schemas";

interface CampaignImageGeneratorProps {
  proposalId: string;
  companyName: string;
  strategyVariants?: StrategyVariant[] | null;
  campaignTitle?: string;
}

type GeneratedJob = {
  id: string;
  prompt: string;
  status: string;
  output_urls?: Array<{ url: string }>;
  job_type: string;
  strategy_label?: string;
};

export function CampaignImageGenerator({
  proposalId,
  companyName,
  strategyVariants,
  campaignTitle,
}: CampaignImageGeneratorProps) {
  const [loading, setLoading] = useState(false);
  const [jobs, setJobs] = useState<GeneratedJob[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const generate = async () => {
    setLoading(true);
    setError(null);

    // Build prompts for campaign creatives based on strategies
    const prompts: Array<{ prompt: string; job_type: string; strategy_label?: string }> = [];

    if (strategyVariants && strategyVariants.length > 0) {
      for (const v of strategyVariants.slice(0, 3)) {
        const activations = v.key_activations?.slice(0, 2).join(" and ") ?? "stadium activation";
        prompts.push({
          prompt: `Professional sports marketing campaign creative visual for ${companyName} sponsoring Coritiba FC. Strategy: ${v.label}. Activation: ${activations}. Scene: Estádio Couto Pereira, Curitiba, Brazil. Green and white Coritiba FC colors, modern stadium atmosphere, ${companyName} branding prominently displayed. High quality advertising photography style, 16:9 widescreen format.`,
          job_type: "campaign_creative",
          strategy_label: v.label,
        });
      }
    } else {
      prompts.push({
        prompt: `Professional sports marketing campaign creative for ${companyName} × Coritiba FC sponsorship. ${campaignTitle ?? "Stadium activation"}. Estádio Couto Pereira in Curitiba, Brazil. Green and white team colors, exciting game atmosphere, sponsor branding integrated naturally. High-quality advertising photography, 16:9 format.`,
        job_type: "campaign_creative",
      });
    }

    const created: GeneratedJob[] = [];

    try {
      for (const p of prompts) {
        // Step 1: Create job (status: pending_approval)
        const res1 = await fetch("/api/image-generation", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            prompt: p.prompt,
            job_type: p.job_type,
            proposal_id: proposalId || undefined,
            size: "1792x1024",
            quality: "standard",
            triggered_by: "campaign_generator",
          }),
        });
        const d1 = await res1.json();
        if (!res1.ok) throw new Error(d1.error ?? "Failed to create job");
        const jobId = d1.job?.id;
        if (!jobId) throw new Error("No job ID returned");

        // Step 2: Auto-approve
        await fetch("/api/image-generation", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ job_id: jobId, action: "approve", approved_by: "admin" }),
        });

        // Step 3: Generate image
        const res3 = await fetch("/api/image-generation", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ job_id: jobId, action: "generate" }),
        });
        const d3 = await res3.json();
        if (!res3.ok) throw new Error(d3.error ?? "Generation failed");

        created.push({
          id: jobId,
          prompt: p.prompt,
          status: "completed",
          output_urls: d3.output_urls ?? [],
          job_type: p.job_type,
          strategy_label: p.strategy_label,
        });
      }

      setJobs(created);
      setDone(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-xs font-semibold text-slate-600 mb-0.5">Imagens de Campanha</div>
          <p className="text-xs text-slate-400">
            Gera visuais criativos para cada estratégia de campanha
          </p>
        </div>
        <button
          onClick={generate}
          disabled={loading}
          className="flex items-center gap-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-200 disabled:text-slate-400 text-white px-3 py-2 text-xs font-semibold transition-colors"
        >
          {loading ? (
            <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Gerando…</>
          ) : done ? (
            <><CheckCircle2 className="h-3.5 w-3.5" /> Regenerar</>
          ) : (
            <><Sparkles className="h-3.5 w-3.5" /> Gerar Criativos</>
          )}
        </button>
      </div>

      {error && (
        <div className="rounded-lg bg-red-50 border border-red-200 p-3 text-xs text-red-700">{error}</div>
      )}

      {jobs.length > 0 && (
        <div className="space-y-3">
          {jobs.map((job, idx) => (
            <div key={job.id} className="rounded-lg border border-slate-200 bg-slate-50 p-3 space-y-2">
              <div className="flex items-center gap-3">
                <ImageIcon className="h-4 w-4 text-indigo-500 shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-medium text-slate-700 truncate">
                    Criativo {idx + 1}{job.strategy_label ? ` — ${job.strategy_label}` : ""}
                  </div>
                  <div className={`text-xs mt-0.5 ${job.status === "completed" ? "text-green-600" : "text-amber-600"}`}>
                    {job.status === "completed" ? "✓ Gerado com sucesso" : "⏳ Processando…"}
                  </div>
                </div>
                <a
                  href="/media-generation"
                  className="flex items-center gap-1 text-xs text-indigo-600 hover:text-indigo-800 shrink-0"
                >
                  Ver todos <ExternalLink className="h-3 w-3" />
                </a>
              </div>
              {job.status === "completed" && job.output_urls && job.output_urls.length > 0 && (
                <img
                  src={job.output_urls[0].url}
                  alt={`Criativo ${idx + 1}`}
                  className="w-full rounded-md border border-slate-200 object-cover max-h-48"
                />
              )}
            </div>
          ))}
          <p className="text-xs text-slate-400">
            As imagens também aparecem na aba &quot;Imagens Geradas&quot; e na landing page da proposta.
          </p>
        </div>
      )}

      {!done && !loading && (
        <div className="text-xs text-slate-400">
          Gera {Math.min(strategyVariants?.length ?? 1, 3)} imagem(ns) — 1 por estratégia de campanha
        </div>
      )}
    </div>
  );
}
