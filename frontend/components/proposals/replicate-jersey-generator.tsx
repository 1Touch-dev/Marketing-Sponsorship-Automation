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
} from "lucide-react";

interface ReplicateJerseyGeneratorProps {
  proposalId: string;
  companyName: string;
  campaignTitle?: string;
}

type GeneratedImage = {
  url: string;
  prompt: string;
  predictionId: string;
  durationMs: number;
  sceneLabel: string;
};

type ScenePreset = {
  label: string;
  description: string;
  promptSuffix: string;
  aspectRatio: "1:1" | "4:5" | "16:9" | "3:4";
};

const SCENE_PRESETS: ScenePreset[] = [
  {
    label: "Produto Estúdio",
    description: "Camisa em estúdio sobre fundo branco",
    promptSuffix: "floating jersey on white background, studio lighting, ecommerce product shot, clean minimal",
    aspectRatio: "4:5",
  },
  {
    label: "Modelo em Campo",
    description: "Atleta vestindo a camisa em campo",
    promptSuffix: "worn by professional athlete standing on football pitch, stadium background, golden hour lighting, lifestyle sports photography",
    aspectRatio: "4:5",
  },
  {
    label: "Patrocinador no Peito",
    description: "Close-up mostrando área do patrocinador",
    promptSuffix: "close up of chest showing sponsor placement area, bold sponsor logo text on chest, macro textile photography, sharp detail",
    aspectRatio: "1:1",
  },
  {
    label: "Dia de Jogo",
    description: "Atleta correndo no estádio",
    promptSuffix: "worn by player running in stadium during match, crowd in background, broadcast camera angle, action sports photography",
    aspectRatio: "16:9",
  },
  {
    label: "Manequim Frontal",
    description: "Vista frontal em manequim",
    promptSuffix: "on mannequin, front view, neutral grey gradient background, professional commercial photography, full torso visible",
    aspectRatio: "3:4",
  },
];

function buildPrompt(sponsorName: string, scenePreset: ScenePreset, customNote: string): string {
  const base = `coritiba_jersey green football kit`;
  const sponsor = customNote.trim()
    ? `with ${sponsorName} sponsor brand on chest, ${customNote.trim()},`
    : `with ${sponsorName} sponsor branding prominently placed on chest,`;
  return `${base} ${sponsor} ${scenePreset.promptSuffix}`;
}

export function ReplicateJerseyGenerator({
  proposalId,
  companyName,
  campaignTitle,
}: ReplicateJerseyGeneratorProps) {
  const [selectedScenes, setSelectedScenes] = useState<number[]>([0, 2]);
  const [customNote, setCustomNote] = useState("");
  const [loading, setLoading] = useState(false);
  const [images, setImages] = useState<GeneratedImage[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [showPresets, setShowPresets] = useState(false);
  const [generatingScene, setGeneratingScene] = useState<string | null>(null);

  const toggleScene = (idx: number) => {
    setSelectedScenes((prev) =>
      prev.includes(idx) ? prev.filter((i) => i !== idx) : [...prev, idx]
    );
  };

  const generate = async () => {
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

        const prompt = buildPrompt(companyName, scene, customNote);

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
        });

        // Show images progressively
        setImages([...results]);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro desconhecido");
    } finally {
      setLoading(false);
      setGeneratingScene(null);
    }
  };

  const totalEstSec = selectedScenes.length * 40;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs text-slate-500 mt-0.5">
            Gera mockups fotorrealistas da camisa Coritiba 2026 com o branding de{" "}
            <span className="font-semibold text-slate-700">{companyName}</span> no peito.
          </p>
          {campaignTitle && (
            <p className="text-xs text-indigo-600 mt-0.5">Campanha: {campaignTitle}</p>
          )}
        </div>
        <span className="shrink-0 text-xs font-semibold text-green-700 bg-green-50 border border-green-200 px-2 py-0.5 rounded-full flex items-center gap-1">
          <span className="w-1.5 h-1.5 rounded-full bg-green-500 inline-block" />
          FLUX LoRA
        </span>
      </div>

      {/* Scene selector */}
      <div>
        <button
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

        {/* Quick summary when collapsed */}
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
      </div>

      {/* Custom note */}
      <div>
        <label className="text-xs font-medium text-slate-600 block mb-1">
          Nota adicional ao prompt (opcional)
        </label>
        <input
          type="text"
          value={customNote}
          onChange={(e) => setCustomNote(e.target.value)}
          placeholder={`ex: logo vermelho e branco da ${companyName}, fundo verde`}
          className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-400"
          disabled={loading}
        />
      </div>

      {/* Error */}
      {error && (
        <div className="rounded-lg bg-red-50 border border-red-200 p-3 text-xs text-red-700">
          {error}
        </div>
      )}

      {/* Generate button */}
      <div className="flex items-center justify-between">
        <p className="text-xs text-slate-400">
          {selectedScenes.length > 0
            ? `~${totalEstSec}s · ~$${(selectedScenes.length * 0.06).toFixed(2)}`
            : "Selecione cenas acima"}
        </p>
        <button
          onClick={generate}
          disabled={loading || selectedScenes.length === 0}
          className="flex items-center gap-2 rounded-lg bg-green-600 hover:bg-green-700 disabled:bg-slate-200 disabled:text-slate-400 text-white px-4 py-2 text-xs font-semibold transition-colors"
        >
          {loading ? (
            <>
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              {generatingScene ? `Gerando: ${generatingScene}…` : "Gerando…"}
            </>
          ) : images.length > 0 ? (
            <>
              <RefreshCw className="h-3.5 w-3.5" /> Regenerar
            </>
          ) : (
            <>
              <Shirt className="h-3.5 w-3.5" /> Gerar Mockups de Camisa
            </>
          )}
        </button>
      </div>

      {/* Results grid */}
      {images.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-green-600" />
            <span className="text-xs font-semibold text-green-700">
              {images.length} mockup{images.length > 1 ? "s" : ""} gerado{images.length > 1 ? "s" : ""}
            </span>
            <span className="text-xs text-slate-400 ml-auto">
              via Replicate FLUX LoRA · trigger: coritiba_jersey
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
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-slate-700">{img.sceneLabel}</span>
                    <span className="text-xs text-slate-400">{(img.durationMs / 1000).toFixed(1)}s</span>
                  </div>
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
                          download={`${companyName.replace(/\s+/g, "_")}_${img.sceneLabel.replace(/\s+/g, "_")}.webp`}
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

          <p className="text-xs text-slate-400">
            💡 Para adicionar o logo do patrocinador diretamente, use o{" "}
            <a href="/mockup-editor" className="text-indigo-600 hover:underline">
              Mockup Editor
            </a>
            .
          </p>
        </div>
      )}
    </div>
  );
}
