"use client";

import React, { useState } from "react";
import {
  Loader2,
  CheckCircle2,
  Download,
  RefreshCw,
  ExternalLink,
  AlertCircle,
  Sparkles,
  Camera,
  Users,
  Dumbbell,
} from "lucide-react";

export type SceneType = "matchday_street" | "training_ground" | "fan_lifestyle";

const SCENES: {
  id: SceneType;
  label: string;
  labelPt: string;
  description: string;
  icon: React.ReactNode;
  exampleDesc: string;
}[] = [
  {
    id: "matchday_street",
    label: "Matchday Street",
    labelPt: "Dia de Jogo — Rua",
    description: "Torcedor nas ruas de Curitiba indo ao Couto Pereira no dia do jogo",
    icon: <Camera className="h-5 w-5" />,
    exampleDesc: "Supporter walking toward stadium, sponsor billboard in background, street energy",
  },
  {
    id: "training_ground",
    label: "Training Ground",
    labelPt: "Centro de Treinamento",
    description: "Jogador no treino com banner do patrocinador ao fundo",
    icon: <Dumbbell className="h-5 w-5" />,
    exampleDesc: "Player in action at training, sponsor banner behind, golden hour light",
  },
  {
    id: "fan_lifestyle",
    label: "Fan Lifestyle",
    labelPt: "Lifestyle do Torcedor",
    description: "Torcedor usando a camisa no cotidiano de Curitiba",
    icon: <Users className="h-5 w-5" />,
    exampleDesc: "Fan at café or park, sponsor brand naturally visible in scene, candid vibe",
  },
];

interface AiCampaignCreativeProps {
  proposalId: string;
  companyId?: string;
  companyName: string;
  sponsorLogoUrl?: string | null;
  onGenerated?: () => void;
}

type GeneratedCreative = {
  url: string;
  sceneType: SceneType;
  durationMs: number;
};

export function AiCampaignCreative({
  proposalId,
  companyId,
  companyName,
  onGenerated,
}: AiCampaignCreativeProps) {
  const [scene, setScene] = useState<SceneType>("matchday_street");
  const [loading, setLoading] = useState(false);
  const [creatives, setCreatives] = useState<GeneratedCreative[]>([]);
  const [error, setError] = useState<string | null>(null);

  const currentCreative = creatives.find((c) => c.sceneType === scene) ?? null;
  const activeScene = SCENES.find((s) => s.id === scene)!;

  const generate = async () => {
    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/media/campaign-creative", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sponsor_name: companyName,
          scene_type: scene,
          proposal_id: proposalId,
          company_id: companyId,
          save_to_proposal: true,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Creative generation failed");

      const newCreative: GeneratedCreative = {
        url: data.url,
        sceneType: scene,
        durationMs: data.duration_ms ?? 0,
      };
      setCreatives((prev) => [
        ...prev.filter((c) => c.sceneType !== scene),
        newCreative,
      ]);
      onGenerated?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-5">
      {/* Header info */}
      <div className="flex items-start gap-2 rounded-lg bg-indigo-50 dark:bg-indigo-900/20 border border-indigo-200 p-3">
        <Sparkles className="h-4 w-4 text-indigo-600 shrink-0 mt-0.5" />
        <p className="text-xs text-indigo-700 dark:text-indigo-300">
          <strong>AI Campaign Creative</strong> — generates editorial/lifestyle images in the style of the
          {" "}<em>"Curitiba é Coritiba"</em> 2026 campaign. Real-feel photography, not a product mock.
          Powered by <strong>gpt-image-2</strong> (OpenAI).
        </p>
      </div>

      {/* Scene selector */}
      <div>
        <div className="text-xs font-semibold text-slate-600 mb-2 uppercase tracking-wide">
          Scene Type
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          {SCENES.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => { setScene(s.id); setError(null); }}
              className={`flex flex-col gap-2 rounded-xl border p-3 text-left transition-all ${
                scene === s.id
                  ? "border-indigo-500 bg-indigo-50 shadow-sm"
                  : "border-slate-200 bg-white hover:border-indigo-300"
              }`}
            >
              <div className={`${scene === s.id ? "text-indigo-600" : "text-slate-500"}`}>
                {s.icon}
              </div>
              <div>
                <div className="text-xs font-semibold text-slate-800">{s.labelPt}</div>
                <div className="text-[10px] text-slate-400 leading-snug mt-0.5">{s.description}</div>
              </div>
            </button>
          ))}
        </div>
        <div className="mt-2 rounded-lg bg-slate-50 border border-slate-200 p-2.5">
          <p className="text-[11px] text-slate-500">
            <strong className="text-slate-700">{activeScene.label}:</strong>{" "}
            {activeScene.exampleDesc}
          </p>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="flex items-start gap-2 rounded-lg bg-red-50 border border-red-200 p-3">
          <AlertCircle className="h-4 w-4 text-red-500 shrink-0 mt-0.5" />
          <p className="text-xs text-red-700">{error}</p>
        </div>
      )}

      {/* Generate */}
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs text-slate-400">
          ~20–40s · gpt-image-2 · 1024×1024 high quality · Saved to proposal
        </p>
        <button
          type="button"
          onClick={generate}
          disabled={loading}
          className="flex items-center gap-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-200 disabled:text-slate-400 text-white px-4 py-2 text-sm font-semibold transition-colors shrink-0"
        >
          {loading ? (
            <><Loader2 className="h-4 w-4 animate-spin" /> Generating…</>
          ) : currentCreative ? (
            <><RefreshCw className="h-4 w-4" /> Regenerate</>
          ) : (
            <><Sparkles className="h-4 w-4" /> Generate Creative</>
          )}
        </button>
      </div>

      {/* Loading state */}
      {loading && (
        <div className="rounded-xl border-2 border-indigo-200 bg-indigo-50 p-8 text-center">
          <Loader2 className="h-8 w-8 animate-spin text-indigo-500 mx-auto mb-3" />
          <p className="text-sm font-medium text-indigo-700">Generating editorial creative…</p>
          <p className="text-xs text-indigo-400 mt-1">
            gpt-image-2 is composing a {activeScene.label.toLowerCase()} scene for {companyName}
          </p>
        </div>
      )}

      {/* Result */}
      {!loading && currentCreative && (
        <div className="rounded-xl border-2 border-indigo-300 bg-white overflow-hidden shadow">
          <img
            src={currentCreative.url}
            alt={`AI Campaign Creative — ${companyName} · ${activeScene.label}`}
            className="w-full object-contain bg-slate-50"
            style={{ maxHeight: 480 }}
          />
          <div className="p-3 flex items-center justify-between gap-2 bg-indigo-50 border-t border-indigo-200">
            <div>
              <div className="text-xs font-semibold text-indigo-800 flex items-center gap-1.5">
                <CheckCircle2 className="h-3.5 w-3.5" /> {activeScene.labelPt} · gpt-image-2
              </div>
              <div className="text-xs text-indigo-500 mt-0.5">
                Generated in {(currentCreative.durationMs / 1000).toFixed(1)}s · Saved to proposal
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <a
                href={currentCreative.url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1 text-xs text-indigo-600 hover:text-indigo-800"
              >
                <ExternalLink className="h-3.5 w-3.5" /> Open
              </a>
              <a
                href={currentCreative.url}
                download={`${companyName.replace(/\s+/g, "_")}_campaign_${scene}.jpg`}
                className="flex items-center gap-1 rounded-lg bg-slate-700 hover:bg-slate-900 text-white px-2.5 py-1.5 text-xs font-medium"
              >
                <Download className="h-3 w-3" /> Download
              </a>
            </div>
          </div>
        </div>
      )}

      {/* Previously generated this session */}
      {creatives.length > 1 && (
        <div className="space-y-1.5">
          <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
            Generated this session
          </div>
          <div className="flex gap-2 flex-wrap">
            {creatives.map((c) => {
              const s = SCENES.find((sc) => sc.id === c.sceneType);
              const isActive = c.sceneType === scene;
              return (
                <button
                  key={c.sceneType}
                  type="button"
                  onClick={() => setScene(c.sceneType)}
                  className={`rounded-lg overflow-hidden border-2 transition-all ${
                    isActive ? "border-indigo-500 shadow" : "border-slate-200 hover:border-indigo-300 opacity-70 hover:opacity-100"
                  }`}
                  title={s?.labelPt}
                >
                  <img src={c.url} alt="" className="w-20 h-20 object-cover bg-slate-100" />
                  <div className="text-[9px] text-center text-slate-500 py-0.5 bg-white">
                    {s?.label}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
