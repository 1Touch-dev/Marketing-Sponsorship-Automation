"use client";

import React, { useState } from "react";
import {
  Sparkles,
  Loader2,
  CheckCircle2,
  ExternalLink,
  Download,
  X,
  Edit3,
  Image as ImageIcon,
  AlertCircle,
} from "lucide-react";
import type { StrategyVariant } from "@/lib/ai/schemas";

interface AICreativesGeneratorProps {
  proposalId: string;
  companyName: string;
  strategyVariants?: StrategyVariant[] | null;
  campaignTitle?: string;
  uploadedLogoUrl?: string | null;
  onGenerated?: () => void;
}

type GeneratedImage = {
  jobId: string;
  url: string;
  strategyLabel?: string;
  strategyId?: string;
  status: string;
};

type PendingPrompt = {
  prompt: string;
  strategyLabel?: string;
  strategyId?: string;
};

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

function buildFallbackPrompt(
  companyName: string,
  campaignTitle?: string,
  logoUrl?: string | null,
): string {
  const logoNote = logoUrl
    ? `${companyName} logo clearly shown on Coritiba FC jersey and advertising boards. `
    : `${companyName} brand name displayed on jersey and stadium signage. `;
  return (
    `Photorealistic sports marketing campaign image: ${companyName} sponsors Coritiba FC ` +
    `(dark green and white football kit, Estádio Couto Pereira, Curitiba, Brazil). ` +
    `${campaignTitle ? `Campaign: "${campaignTitle}". ` : ""}` +
    `Packed stadium with 40,000 fans, match day golden broadcast lighting, ` +
    `giant LED advertising boards showing "${companyName}" branding. ` +
    `${logoNote}` +
    `Cinematic 16:9 widescreen, high-quality commercial advertising photography.`
  );
}

export function AICreativesGenerator({
  proposalId,
  companyName,
  strategyVariants,
  campaignTitle,
  uploadedLogoUrl,
  onGenerated,
}: AICreativesGeneratorProps) {
  const [loading, setLoading] = useState(false);
  const [images, setImages] = useState<GeneratedImage[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [showApproval, setShowApproval] = useState(false);
  const [pendingPrompts, setPendingPrompts] = useState<PendingPrompt[]>([]);
  const [editingIdx, setEditingIdx] = useState<number | null>(null);

  const buildPrompts = (): PendingPrompt[] => {
    if (strategyVariants && strategyVariants.length > 0) {
      return strategyVariants.slice(0, 3).map((v) => ({
        prompt: buildPromptForStrategy(v, companyName, uploadedLogoUrl),
        strategyLabel: v.label,
        strategyId: v.id,
      }));
    }
    return [
      {
        prompt: buildFallbackPrompt(companyName, campaignTitle, uploadedLogoUrl),
      },
    ];
  };

  const handleGenerateClick = () => {
    const prompts = buildPrompts();
    setPendingPrompts(prompts);
    setEditingIdx(null);
    setShowApproval(true);
  };

  const updatePrompt = (idx: number, value: string) => {
    setPendingPrompts((prev) => prev.map((p, i) => (i === idx ? { ...p, prompt: value } : p)));
  };

  const confirmGenerate = async (promptsToUse?: PendingPrompt[]) => {
    // Use the explicit snapshot passed in (avoids stale closure when the user just
    // edited a textarea and immediately clicked Generate in the same render cycle).
    const prompts = promptsToUse ?? pendingPrompts;
    setShowApproval(false);
    setLoading(true);
    setError(null);

    const created: GeneratedImage[] = [];
    try {
      for (const p of prompts) {
        const res1 = await fetch("/api/image-generation", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            prompt: p.prompt,
            job_type: "campaign_creative",
            proposal_id: proposalId || undefined,
            size: "1536x1024",
            quality: "standard",
            triggered_by: "campaign_generator",
            strategy_variant_id: p.strategyId ?? null,
            strategy_label: p.strategyLabel ?? null,
            display_label: p.strategyLabel ? `Campaign — ${p.strategyLabel}` : "Campaign",
          }),
        });
        const d1 = await res1.json();
        if (!res1.ok) throw new Error(d1.error ?? "Failed to create job");
        const jobId = d1.job?.id;
        if (!jobId) throw new Error("No job ID returned");

        const res2 = await fetch("/api/image-generation", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ job_id: jobId, action: "generate" }),
        });
        const d2 = await res2.json();
        if (!res2.ok) throw new Error(d2.error ?? "Generation failed");

        const imgUrl = d2.output_urls?.[0]?.url ?? d2.selected_url ?? "";
        created.push({
          jobId,
          url: imgUrl,
          strategyLabel: p.strategyLabel,
          strategyId: p.strategyId,
          status: "pending_approval",
        });
      }
      setImages(created);
      onGenerated?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };

  const hasStrategies = strategyVariants && strategyVariants.length > 0;
  const imageCount = hasStrategies ? Math.min(strategyVariants!.length, 3) : 1;

  return (
    <div className="space-y-4">
      {/* Description row */}
      <div className="flex items-start justify-between gap-3">
        <div className="text-xs text-slate-500 space-y-0.5">
          <p>
            Generates <strong className="text-slate-700">{imageCount} image{imageCount > 1 ? "s" : ""}</strong>
            {hasStrategies
              ? ` — one per campaign strategy (${imageCount} of ${strategyVariants!.length})`
              : " — generic campaign visual"} using OpenAI.
          </p>
          {!hasStrategies && (
            <p className="text-amber-600 flex items-center gap-1">
              💡 Run <strong>✨ Enriquecer com IA</strong> first to get strategy-based images (one per strategy variant).
            </p>
          )}
          {uploadedLogoUrl ? (
            <p className="text-green-600 flex items-center gap-1">
              ✓ Sponsor logo available — referenced in prompts
            </p>
          ) : (
            <p className="text-amber-600">No logo uploaded — brand name used in prompts instead</p>
          )}
        </div>
        <button
          onClick={handleGenerateClick}
          disabled={loading}
          className="flex items-center gap-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-200 disabled:text-slate-400 text-white px-4 py-2.5 text-sm font-semibold transition-colors shrink-0"
        >
          {loading ? (
            <><Loader2 className="h-4 w-4 animate-spin" /> Generating…</>
          ) : images.length > 0 ? (
            <><Sparkles className="h-4 w-4" /> Regenerate</>
          ) : (
            <><Sparkles className="h-4 w-4" /> Generate Creatives</>
          )}
        </button>
      </div>

      {/* Error */}
      {error && (
        <div className="flex items-start gap-2 rounded-lg bg-red-50 border border-red-200 p-3">
          <AlertCircle className="h-4 w-4 text-red-500 shrink-0 mt-0.5" />
          <p className="text-xs text-red-700">{error}</p>
        </div>
      )}

      {/* Generated images */}
      {images.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-green-600" />
            <span className="text-xs font-semibold text-green-700">
              {images.length} creative{images.length > 1 ? "s" : ""} generated
            </span>
            <a
              href="/proposals/bulk-approve"
              className="ml-auto text-xs text-indigo-600 hover:text-indigo-800 underline"
            >
              Approve all in bulk →
            </a>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {images.map((img, idx) => (
              <div key={img.jobId} className="rounded-xl border border-slate-200 overflow-hidden bg-white shadow-sm">
                {img.url ? (
                  <img
                    src={img.url}
                    alt={img.strategyLabel ?? `Creative ${idx + 1}`}
                    className="w-full object-cover"
                    style={{ maxHeight: 200 }}
                  />
                ) : (
                  <div className="h-32 flex items-center justify-center bg-slate-50 text-xs text-slate-400">
                    <ImageIcon className="h-6 w-6 opacity-30" />
                  </div>
                )}
                <div className="p-2.5 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <div className="text-xs font-semibold text-slate-700">
                        {img.strategyLabel ?? `Creative ${idx + 1}`}
                      </div>
                      <div className="text-xs text-amber-600 mt-0.5">
                        Pending approval
                      </div>
                    </div>
                    {img.url && (
                      <div className="flex items-center gap-1.5 shrink-0">
                        <a
                          href={img.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs text-indigo-600 hover:text-indigo-800"
                          title="Open full size"
                        >
                          <ExternalLink className="h-3.5 w-3.5" />
                        </a>
                        <a
                          href={img.url}
                          download={`${companyName.replace(/\s+/g, "_")}_creative_${idx + 1}.png`}
                          className="text-xs text-slate-500 hover:text-slate-700"
                          title="Download"
                        >
                          <Download className="h-3.5 w-3.5" />
                        </a>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
          <p className="text-xs text-slate-400">
            Images need approval before appearing on the proposal landing page.{" "}
            <a href="/proposals/bulk-approve" className="underline text-indigo-500">Bulk approve →</a>
          </p>
        </div>
      )}

      {/* Full-screen Prompt Approval Modal */}
      {showApproval && (
        <div className="fixed inset-0 z-[300] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col border border-slate-200">
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-indigo-100 flex items-center justify-center">
                  <Sparkles className="h-4 w-4 text-indigo-600" />
                </div>
                <div>
                  <h2 className="font-bold text-base text-slate-900 dark:text-slate-100">
                    Review Prompts Before Generating
                  </h2>
                  <p className="text-xs text-slate-500">
                    {pendingPrompts.length} image{pendingPrompts.length > 1 ? "s" : ""} · Click any prompt to edit
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowApproval(false)}
                className="rounded-lg p-2 hover:bg-slate-100 transition-colors"
              >
                <X className="h-5 w-5 text-slate-500" />
              </button>
            </div>

            {/* Prompt list — scrollable */}
            <div className="flex-1 overflow-y-auto p-6 space-y-4">
              {pendingPrompts.map((p, i) => (
                <div key={i} className="rounded-xl border border-slate-200 overflow-hidden">
                  {/* Prompt header */}
                  <div className="flex items-center justify-between px-4 py-2.5 bg-slate-50 dark:bg-slate-800 border-b border-slate-200">
                    <div className="flex items-center gap-2">
                      <div className="w-5 h-5 rounded-full bg-indigo-600 text-white text-xs flex items-center justify-center font-bold">
                        {i + 1}
                      </div>
                      <span className="text-sm font-semibold text-slate-700 dark:text-slate-200">
                        {p.strategyLabel ?? "Campaign Creative"}
                      </span>
                    </div>
                    <button
                      onClick={() => setEditingIdx(editingIdx === i ? null : i)}
                      className="flex items-center gap-1 text-xs text-indigo-600 hover:text-indigo-800 font-medium"
                    >
                      <Edit3 className="h-3 w-3" />
                      {editingIdx === i ? "Done" : "Edit"}
                    </button>
                  </div>
                  {/* Prompt body */}
                  <div className="p-4">
                    {editingIdx === i ? (
                      <textarea
                        value={p.prompt}
                        onChange={(e) => updatePrompt(i, e.target.value)}
                        rows={5}
                        className="w-full text-xs font-mono leading-relaxed text-slate-700 dark:text-slate-300 border border-indigo-300 rounded-lg p-3 focus:outline-none focus:ring-2 focus:ring-indigo-400 bg-white dark:bg-slate-800 resize-none"
                      />
                    ) : (
                      <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed whitespace-pre-wrap">
                        {p.prompt}
                      </p>
                    )}
                  </div>
                </div>
              ))}

              {/* Cost estimate */}
              <div className="rounded-lg bg-slate-50 border border-slate-200 px-4 py-3 flex items-center justify-between text-xs text-slate-500">
                <span>Estimated cost: ~${(pendingPrompts.length * 0.04).toFixed(2)} · Model: gpt-image-1</span>
                <span>Size: 1536×1024 (16:9)</span>
              </div>
            </div>

            {/* Footer actions */}
            <div className="flex items-center gap-3 px-6 py-4 border-t border-slate-200 bg-slate-50 dark:bg-slate-800/50 shrink-0">
              <button
                onClick={() => setShowApproval(false)}
                className="flex-1 rounded-xl border border-slate-300 px-4 py-2.5 text-sm text-slate-600 hover:bg-white transition-colors font-medium"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  setEditingIdx(null); // commit any open textarea edit
                  confirmGenerate(pendingPrompts);
                }}
                className="flex-1 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2.5 text-sm font-bold transition-colors flex items-center justify-center gap-2"
              >
                <Sparkles className="h-4 w-4" />
                Generate {pendingPrompts.length} Image{pendingPrompts.length > 1 ? "s" : ""}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
