"use client";

import React, { useState } from "react";
import { Sparkles, Loader2, Image as ImageIcon, ExternalLink, CheckCircle2, Upload } from "lucide-react";
import type { StrategyVariant } from "@/lib/ai/schemas";

interface CampaignImageGeneratorProps {
  proposalId: string;
  companyName: string;
  strategyVariants?: StrategyVariant[] | null;
  campaignTitle?: string;
  uploadedLogoUrl?: string | null;
  disabled?: boolean;
}

type GeneratedJob = {
  id: string;
  prompt: string;
  status: string;
  output_urls?: Array<{ url: string }>;
  job_type: string;
  strategy_label?: string;
};

/** Build a vivid, strategy-aware prompt for each campaign strategy */
function buildPromptForStrategy(
  strategy: StrategyVariant,
  companyName: string,
  logoUrl?: string | null,
): string {
  const activations = strategy.key_activations?.slice(0, 2).join(" and ") ?? "stadium activation";
  const tagline = strategy.tagline ? `Tagline: "${strategy.tagline}". ` : "";
  const logoNote = logoUrl
    ? `${companyName} brand logo clearly visible on Coritiba FC jersey and stadium advertising boards. `
    : `${companyName} brand name prominently displayed on jersey and stadium signage. `;
  return (
    `Photorealistic sports marketing campaign image: ${companyName} sponsors Coritiba FC football club ` +
    `(dark green and white kit, Estádio Couto Pereira, Curitiba, Brazil). ` +
    `${tagline}` +
    `Campaign concept: "${strategy.label}". ` +
    `Key activations: ${activations}. ` +
    `Scene: packed stadium, match day atmosphere, 40,000 fans in green and white, golden broadcast lighting, ` +
    `massive LED advertising boards showing "${companyName}" branding. ` +
    `${logoNote}` +
    `Cinematic 16:9 widescreen, commercial advertising photography quality, high contrast, vibrant colors.`
  );
}

export function CampaignImageGenerator({
  proposalId,
  companyName,
  strategyVariants,
  campaignTitle,
  uploadedLogoUrl,
  disabled = false,
}: CampaignImageGeneratorProps) {
  const [loading, setLoading] = useState(false);
  const [jobs, setJobs] = useState<GeneratedJob[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [pendingPrompts, setPendingPrompts] = useState<Array<{ prompt: string; job_type: string; strategy_label?: string }>>([]);

  const buildPrompts = () => {
    const prompts: Array<{ prompt: string; job_type: string; strategy_label?: string }> = [];
    if (strategyVariants && strategyVariants.length > 0) {
      for (const v of strategyVariants.slice(0, 3)) {
        prompts.push({
          prompt: buildPromptForStrategy(v, companyName, uploadedLogoUrl),
          job_type: "campaign_creative",
          strategy_label: v.label,
        });
      }
    } else {
      const logoNote = uploadedLogoUrl
        ? `${companyName} logo clearly shown on Coritiba FC jersey and advertising boards. `
        : `${companyName} brand name displayed on jersey and stadium signage. `;
      prompts.push({
        prompt:
          `Photorealistic sports marketing campaign image: ${companyName} sponsors Coritiba FC ` +
          `(dark green and white football kit, Estádio Couto Pereira, Curitiba, Brazil). ` +
          `${campaignTitle ? `Campaign: "${campaignTitle}". ` : ""}` +
          `Packed stadium with 40,000 fans, match day golden broadcast lighting, ` +
          `giant LED advertising boards showing "${companyName}" branding. ` +
          `${logoNote}` +
          `Cinematic 16:9 widescreen, high-quality commercial advertising photography.`,
        job_type: "campaign_creative",
      });
    }
    return prompts;
  };

  const handleGenerateClick = () => {
    const prompts = buildPrompts();
    setPendingPrompts(prompts);
    setShowPreview(true);
  };

  const confirmGenerate = async () => {
    setShowPreview(false);
    setLoading(true);
    setError(null);

    const created: GeneratedJob[] = [];

    try {
      for (const p of pendingPrompts) {
        const strategyId =
          strategyVariants?.find((s) => s.label === p.strategy_label)?.id ?? undefined;

        const res1 = await fetch("/api/image-generation", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            prompt: p.prompt,
            job_type: p.job_type,
            proposal_id: proposalId || undefined,
            size: "1536x1024",
            quality: "standard",
            triggered_by: "campaign_generator",
            strategy_variant_id: strategyId,
            strategy_label: p.strategy_label ?? null,
            display_label: p.strategy_label ? `Campanha — ${p.strategy_label}` : "Campanha",
          }),
        });
        const d1 = await res1.json();
        if (!res1.ok) throw new Error(d1.error ?? "Failed to create job");
        const jobId = d1.job?.id;
        if (!jobId) throw new Error("No job ID returned");

        // Generate directly from pending_approval (no auto-approve needed)
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
          status: "pending_approval",
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
            {strategyVariants && strategyVariants.length > 0
              ? `Gera ${Math.min(strategyVariants.length, 3)} imagem(ns) — 1 criativo por estratégia`
              : "Gera 1 imagem criativa para a campanha"}
          </p>
          {uploadedLogoUrl && (
            <p className="text-xs text-green-600 mt-0.5 flex items-center gap-1">
              <Upload className="h-2.5 w-2.5" /> Logo carregado — será incluído nos prompts
            </p>
          )}
        </div>
        <button
          onClick={handleGenerateClick}
          disabled={disabled || loading}
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

      {/* Prompt preview modal */}
      {showPreview && (
        <div className="rounded-lg border-2 border-indigo-200 bg-indigo-50 p-4 space-y-3">
          <div className="text-xs font-semibold text-indigo-700">
            Revise os prompts antes de gerar ({pendingPrompts.length} imagem{pendingPrompts.length > 1 ? "ns" : ""}):
          </div>
          {pendingPrompts.map((p, i) => (
            <div key={i} className="rounded border border-indigo-100 bg-white p-2">
              <div className="text-xs font-medium text-slate-600 mb-1">
                {p.strategy_label ? `Estratégia: ${p.strategy_label}` : `Imagem ${i + 1}`}
              </div>
              <p className="text-xs text-slate-500 whitespace-pre-wrap leading-relaxed">{p.prompt}</p>
            </div>
          ))}
          <div className="flex gap-2">
            <button
              onClick={confirmGenerate}
              className="flex items-center gap-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white px-3 py-2 text-xs font-semibold"
            >
              <Sparkles className="h-3 w-3" /> Confirmar e Gerar
            </button>
            <button
              onClick={() => setShowPreview(false)}
              className="rounded-lg border border-slate-300 px-3 py-2 text-xs text-slate-600 hover:bg-slate-100"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}

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
                  <div className={`text-xs mt-0.5 ${(job.status === "completed" || job.status === "pending_approval") ? "text-green-600" : "text-amber-600"}`}>
                    {(job.status === "completed" || job.status === "pending_approval") ? "✓ Gerado — aguardando aprovação em lote" : "⏳ Processando…"}
                  </div>
                </div>
                <a
                  href="/proposals/bulk-approve"
                  className="flex items-center gap-1 text-xs text-indigo-600 hover:text-indigo-800 shrink-0"
                >
                  Aprovar <ExternalLink className="h-3 w-3" />
                </a>
              </div>
              {(job.status === "completed" || job.status === "pending_approval") && job.output_urls && job.output_urls.length > 0 && (
                <img
                  src={job.output_urls[0].url}
                  alt={`Criativo ${idx + 1}`}
                  className="w-full rounded-md border border-slate-200 object-cover max-h-48"
                />
              )}
            </div>
          ))}
          <p className="text-xs text-slate-400">
            Imagens aguardam aprovação em <a href="/proposals/bulk-approve" className="underline text-indigo-500">Aprovação em lote</a> antes de aparecer na landing page.
          </p>
        </div>
      )}
    </div>
  );
}
