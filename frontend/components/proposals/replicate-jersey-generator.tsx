"use client";

import React, { useState } from "react";
import {
  Shirt,
  Loader2,
  Sparkles,
  CheckCircle2,
  Download,
  RefreshCw,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  Shield,
  AlertCircle,
  Eye,
  X,
} from "lucide-react";
import { SCENE_PRESETS, buildReplicatePrompt } from "@/lib/media/jersey-prompts";
import {
  JERSEY_PLACEMENTS,
  type JerseyPlacementId,
} from "@/lib/media/jersey-placements";
import { JerseyPlacementPreview } from "./jersey-placement-preview";

interface ReplicateJerseyGeneratorProps {
  proposalId: string;
  companyId?: string;
  companyName: string;
  sponsorLogoUrl?: string | null;
  campaignTitle?: string;
  showPlacementPreview?: boolean;
  onPlacementChange?: (placement: JerseyPlacementId) => void;
  onGenerated?: () => void;
}

type GeneratedImage = {
  url: string;
  prompt: string;
  predictionId?: string;
  durationMs: number;
  sceneLabel: string;
  source: "official" | "replicate";
  placement?: JerseyPlacementId;
};

type MockupMode = "official" | "creative";

export function ReplicateJerseyGenerator({
  proposalId,
  companyId,
  companyName,
  sponsorLogoUrl,
  campaignTitle,
  showPlacementPreview = false,
  onPlacementChange,
  onGenerated,
}: ReplicateJerseyGeneratorProps) {
  const [mode, setMode] = useState<MockupMode>("official");
  const [placement, setPlacementState] = useState<JerseyPlacementId>("chest_sponsor");
  const setPlacement = (p: JerseyPlacementId) => {
    setPlacementState(p);
    onPlacementChange?.(p);
  };
  const [selectedScenes, setSelectedScenes] = useState<number[]>([0, 2]);
  const [customNote, setCustomNote] = useState("");
  const [loading, setLoading] = useState(false);
  const [images, setImages] = useState<GeneratedImage[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [showPresets, setShowPresets] = useState(false);
  const [generatingScene, setGeneratingScene] = useState<string | null>(null);
  const [showPromptPreview, setShowPromptPreview] = useState(false);
  const [previewPrompt, setPreviewPrompt] = useState<string>("");
  const [pendingGeneration, setPendingGeneration] = useState<"official" | "creative" | null>(null);

  const toggleScene = (idx: number) => {
    setSelectedScenes((prev) =>
      prev.includes(idx) ? prev.filter((i) => i !== idx) : [...prev, idx]
    );
  };

  const generateOfficial = async () => {
    setLoading(true);
    setError(null);
    setImages([]);
    setGeneratingScene("Mockup oficial");

    try {
      const res = await fetch("/api/media/jersey-mockup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sponsor_name: companyName,
          sponsor_logo_url: sponsorLogoUrl ?? undefined,
          placement,
          proposal_id: proposalId,
          company_id: companyId,
          save_to_proposal: true,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Falha no mockup oficial");

      const placementLabel =
        JERSEY_PLACEMENTS.find((p) => p.id === placement)?.labelPt ?? placement;

      setImages([
        {
          url: data.url,
          prompt: `Mockup oficial — ${companyName} · ${placementLabel}. Escudo Coritiba intacto.`,
          durationMs: data.duration_ms ?? 0,
          sceneLabel: "Mockup Oficial (Recomendado)",
          source: "official",
          placement,
        },
      ]);
      onGenerated?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro desconhecido");
    } finally {
      setLoading(false);
      setGeneratingScene(null);
    }
  };

  const generateCreative = async () => {
    if (selectedScenes.length === 0) {
      setError("Selecione ao menos 1 cena para gerar.");
      return;
    }

    setLoading(true);
    setError(null);
    setImages([]);

    const results: GeneratedImage[] = [];

    try {
      for (const sceneIdx of selectedScenes) {
        const scene = SCENE_PRESETS[sceneIdx];
        setGeneratingScene(scene.label);

        const prompt = buildReplicatePrompt(companyName, scene, customNote, placement);

        const res = await fetch("/api/media/replicate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            prompt,
            num_outputs: 1,
            aspect_ratio: scene.aspectRatio,
            proposal_id: proposalId,
          }),
        });

        const data = await res.json();

        if (!res.ok) {
          throw new Error(data.error ?? `Falha ao gerar cena "${scene.label}"`);
        }

        results.push({
          url: data.output_urls?.[0] ?? "",
          prompt,
          predictionId: data.prediction_id,
          durationMs: data.duration_ms,
          sceneLabel: scene.label,
          source: "replicate",
          placement,
        });

        setImages([...results]);
      }
      onGenerated?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro desconhecido");
    } finally {
      setLoading(false);
      setGeneratingScene(null);
    }
  };

  const generate = () => {
    // Show prompt preview before firing
    if (mode === "official") {
      setPreviewPrompt(`Mockup oficial — ${companyName} · colocação da camisa. Escudo Coritiba intacto.`);
    } else {
      if (selectedScenes.length === 0) return setError("Selecione ao menos 1 cena para gerar.");
      const firstScene = SCENE_PRESETS[selectedScenes[0]];
      const samplePrompt = buildReplicatePrompt(companyName, firstScene, customNote, placement);
      setPreviewPrompt(selectedScenes.length > 1
        ? `${selectedScenes.length} cenas selecionadas. Exemplo de prompt (cena 1):\n\n${samplePrompt}`
        : samplePrompt
      );
    }
    setPendingGeneration(mode);
    setShowPromptPreview(true);
  };

  const confirmGeneration = () => {
    setShowPromptPreview(false);
    setPendingGeneration(null);
    if (pendingGeneration === "official") generateOfficial();
    else generateCreative();
  };

  const totalEstSec = mode === "official" ? 3 : selectedScenes.length * 40;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs text-slate-500 mt-0.5">
            Patrocinador <span className="font-semibold text-slate-700">{companyName}</span> no
            peito oposto ao escudo. O escudo Coritiba{" "}
            <span className="font-semibold text-green-800">nunca é alterado</span>.
          </p>
          {campaignTitle && (
            <p className="text-xs text-indigo-600 mt-0.5">Campanha: {campaignTitle}</p>
          )}
        </div>
      </div>

      {/* Mode tabs */}
      <div className="flex rounded-lg border border-slate-200 overflow-hidden text-xs font-medium">
        <button
          type="button"
          onClick={() => setMode("official")}
          className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 transition-colors ${
            mode === "official"
              ? "bg-green-600 text-white"
              : "bg-white text-slate-600 hover:bg-slate-50"
          }`}
        >
          <Shield className="h-3.5 w-3.5" />
          Mockup oficial
        </button>
        <button
          type="button"
          onClick={() => setMode("creative")}
          className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 transition-colors ${
            mode === "creative"
              ? "bg-indigo-600 text-white"
              : "bg-white text-slate-600 hover:bg-slate-50"
          }`}
        >
          <Sparkles className="h-3.5 w-3.5" />
          Cenas criativas (IA)
        </button>
      </div>

      {mode === "official" ? (
        <div className="rounded-lg bg-green-50 border border-green-200 p-3 text-xs text-green-900">
          <strong>Recomendado para propostas.</strong> Usa foto real da camisa 2026; o escudo fica
          fixo e o logo do patrocinador é aplicado apenas no lado correto do peito.
        </div>
      ) : (
        <div className="rounded-lg bg-amber-50 border border-amber-200 p-3 text-xs text-amber-900 flex gap-2">
          <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
          <span>
            Cenas geradas por IA podem variar. Para o peito do patrocinador na proposta, prefira{" "}
            <strong>Mockup oficial</strong>.
          </span>
        </div>
      )}

      {showPlacementPreview && (
        <JerseyPlacementPreview placement={placement} className="max-w-sm" />
      )}

      {/* Placement selector */}
      <div>
        <label className="text-xs font-medium text-slate-600 block mb-1.5">
          Posição do patrocinador
        </label>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
          {JERSEY_PLACEMENTS.map((p) => (
            <label
              key={p.id}
              className={`flex items-start gap-2 rounded-lg border px-3 py-2 text-left transition-colors ${
                p.comingSoon || !p.enabled
                  ? "border-slate-100 bg-slate-50 opacity-60 cursor-not-allowed"
                  : placement === p.id
                    ? "border-green-400 bg-green-50 cursor-pointer"
                    : "border-slate-200 bg-white hover:border-slate-300 cursor-pointer"
              }`}
            >
              <input
                type="radio"
                name="placement"
                value={p.id}
                checked={placement === p.id}
                disabled={!p.enabled || p.comingSoon}
                onChange={() => setPlacement(p.id)}
                className="mt-0.5"
              />
              <div className="min-w-0">
                <div className="text-xs font-semibold text-slate-700">{p.labelPt}</div>
                <div className="text-xs text-slate-400">{p.description}</div>
                {p.comingSoon && (
                  <span className="text-xs text-amber-600 font-medium">Em breve</span>
                )}
              </div>
            </label>
          ))}
        </div>
      </div>

      {/* Creative-only: scene selector */}
      {mode === "creative" && (
        <div>
          <button
            type="button"
            onClick={() => setShowPresets(!showPresets)}
            className="flex items-center gap-1.5 text-xs font-medium text-slate-600 hover:text-slate-900 transition-colors"
          >
            {showPresets ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
            Cenas selecionadas ({selectedScenes.length}/{SCENE_PRESETS.length})
          </button>

          {showPresets && (
            <div className="mt-2 grid grid-cols-1 gap-1.5">
              {SCENE_PRESETS.map((scene, idx) => (
                <label
                  key={idx}
                  className={`flex items-center gap-2.5 rounded-lg border px-3 py-2 cursor-pointer transition-colors ${
                    selectedScenes.includes(idx)
                      ? "border-indigo-300 bg-indigo-50"
                      : "border-slate-200 bg-white hover:border-slate-300"
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={selectedScenes.includes(idx)}
                    onChange={() => toggleScene(idx)}
                    className="rounded"
                  />
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-semibold text-slate-700">{scene.label}</div>
                    <div className="text-xs text-slate-400 truncate">{scene.description}</div>
                  </div>
                  <span className="text-xs text-slate-400 shrink-0">{scene.aspectRatio}</span>
                </label>
              ))}
            </div>
          )}

          {!showPresets && selectedScenes.length > 0 && (
            <div className="mt-1.5 flex flex-wrap gap-1">
              {selectedScenes.map((idx) => (
                <span
                  key={idx}
                  className="text-xs bg-indigo-50 text-indigo-700 border border-indigo-200 px-2 py-0.5 rounded-full"
                >
                  {SCENE_PRESETS[idx].label}
                </span>
              ))}
            </div>
          )}

          <div className="mt-3">
            <label className="text-xs font-medium text-slate-600 block mb-1">
              Nota adicional ao prompt (opcional)
            </label>
            <input
              type="text"
              value={customNote}
              onChange={(e) => setCustomNote(e.target.value)}
              placeholder={`ex: logo vermelho e branco da ${companyName}`}
              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-400"
              disabled={loading}
            />
          </div>
        </div>
      )}

      {error && (
        <div className="rounded-lg bg-red-50 border border-red-200 p-3 text-xs text-red-700">
          {error}
        </div>
      )}

      <div className="flex items-center justify-between">
        <p className="text-xs text-slate-400">
          {mode === "official"
            ? "Instantâneo · salvo na proposta"
            : selectedScenes.length > 0
              ? `~${totalEstSec}s · ~$${(selectedScenes.length * 0.06).toFixed(2)}`
              : "Selecione cenas acima"}
        </p>
        <button
          type="button"
          onClick={generate}
          disabled={loading || (mode === "creative" && selectedScenes.length === 0)}
          className="flex items-center gap-2 rounded-lg bg-green-600 hover:bg-green-700 disabled:bg-slate-200 disabled:text-slate-400 text-white px-4 py-2 text-xs font-semibold transition-colors"
        >
          {loading ? (
            <>
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              {generatingScene ? `${generatingScene}…` : "Gerando…"}
            </>
          ) : images.length > 0 ? (
            <>
              <RefreshCw className="h-3.5 w-3.5" /> Regenerar
            </>
          ) : (
            <>
              <Shirt className="h-3.5 w-3.5" />
              {mode === "official" ? "Gerar mockup oficial" : "Gerar cenas IA"}
            </>
          )}
        </button>
      </div>

      {images.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-green-600" />
            <span className="text-xs font-semibold text-green-700">
              {images.length} mockup{images.length > 1 ? "s" : ""} gerado{images.length > 1 ? "s" : ""}
              {mode === "official" && " — visível na landing da proposta"}
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {images.map((img, idx) => (
              <div key={idx} className="rounded-xl border border-slate-200 overflow-hidden bg-white shadow-sm">
                {img.url ? (
                  <img
                    src={img.url}
                    alt={img.sceneLabel}
                    className="w-full object-cover max-h-64"
                  />
                ) : (
                  <div className="h-40 flex items-center justify-center bg-slate-50 text-xs text-slate-400">
                    Imagem não disponível
                  </div>
                )}
                <div className="p-2.5 space-y-1.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-semibold text-slate-700">{img.sceneLabel}</span>
                    <span
                      className={`text-xs px-1.5 py-0.5 rounded ${
                        img.source === "official"
                          ? "bg-green-100 text-green-800"
                          : "bg-indigo-100 text-indigo-800"
                      }`}
                    >
                      {img.source === "official" ? "Oficial" : "IA"}
                    </span>
                  </div>
                  <p className="text-xs text-slate-500">
                    Escudo: lado esquerdo do atleta (fixo) · Patrocinador: lado oposto
                  </p>
                  <p className="text-xs text-slate-400 line-clamp-2">{img.prompt}</p>
                  <div className="flex gap-1.5">
                    {img.url && (
                      <>
                        <a
                          href={img.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-1 text-xs text-indigo-600 hover:text-indigo-800"
                        >
                          <ExternalLink className="h-3 w-3" /> Abrir
                        </a>
                        <a
                          href={img.url}
                          download={`${companyName.replace(/\s+/g, "_")}_${img.sceneLabel.replace(/\s+/g, "_")}.jpg`}
                          className="flex items-center gap-1 text-xs text-slate-500 hover:text-slate-700"
                        >
                          <Download className="h-3 w-3" /> Download
                        </a>
                      </>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Prompt Preview Modal */}
      {showPromptPreview && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl max-w-lg w-full p-6 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Eye className="h-4 w-4 text-green-600" />
                <h3 className="font-semibold text-sm">Confirmar geração</h3>
              </div>
              <button onClick={() => { setShowPromptPreview(false); setPendingGeneration(null); }}>
                <X className="h-4 w-4 text-muted-foreground hover:text-foreground" />
              </button>
            </div>
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-1.5 uppercase tracking-wide">Prompt que será usado</p>
              <div className="bg-slate-50 dark:bg-slate-800 rounded-lg border p-3 text-xs font-mono leading-relaxed whitespace-pre-wrap max-h-40 overflow-y-auto">
                {previewPrompt}
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              Você pode editar a nota adicional abaixo para personalizar o prompt antes de confirmar.
            </p>
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => { setShowPromptPreview(false); setPendingGeneration(null); }}
                className="rounded-lg border px-4 py-2 text-sm hover:bg-accent transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={confirmGeneration}
                className="rounded-lg bg-green-600 hover:bg-green-700 text-white px-4 py-2 text-sm font-semibold transition-colors flex items-center gap-2"
              >
                <Shirt className="h-3.5 w-3.5" /> Confirmar e gerar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
