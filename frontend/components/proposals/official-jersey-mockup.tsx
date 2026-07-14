"use client";

import React, { useState } from "react";
import {
  Loader2,
  CheckCircle2,
  Download,
  RefreshCw,
  ExternalLink,
  Lock,
  AlertCircle,
  Shirt,
} from "lucide-react";
import {
  JERSEY_PLACEMENTS,
  type JerseyPlacementId,
} from "@/lib/media/jersey-placements";

type KitType = "flat" | "home" | "training" | "goalkeeper";

const KIT_TABS: { id: KitType; label: string; emoji: string; description: string }[] = [
  { id: "home", label: "Home Kit", emoji: "🟢", description: "2026 home — green & white, matchday player photo" },
  { id: "training", label: "Training", emoji: "⚫", description: "2026 training kit — dark navy" },
  { id: "goalkeeper", label: "Goalkeeper", emoji: "🟩", description: "2026 GK kit — green" },
  { id: "flat", label: "Flat Kit", emoji: "👕", description: "Flat lay — all zones visible, good for presentations" },
];

interface OfficialJerseyMockupProps {
  proposalId: string;
  companyId?: string;
  companyName: string;
  sponsorLogoUrl?: string | null;
  onGenerated?: () => void;
}

type GeneratedImage = {
  url: string;
  placement: JerseyPlacementId;
  kitType: KitType;
  durationMs: number;
};

export function OfficialJerseyMockup({
  proposalId,
  companyId,
  companyName,
  sponsorLogoUrl,
  onGenerated,
}: OfficialJerseyMockupProps) {
  const [kitType, setKitType] = useState<KitType>("home");
  const [placement, setPlacementState] = useState<JerseyPlacementId>("chest_sponsor");
  const [loading, setLoading] = useState(false);
  const [images, setImages] = useState<GeneratedImage[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [showConfirm, setShowConfirm] = useState(false);

  const hasLogo = !!sponsorLogoUrl;
  const currentImage = images.find((i) => i.placement === placement && i.kitType === kitType) ?? null;

  const setPlacement = (p: JerseyPlacementId) => {
    setPlacementState(p);
    setError(null);
  };

  const handleKitChange = (k: KitType) => {
    setKitType(k);
    setError(null);
  };

  const generate = async () => {
    setShowConfirm(false);
    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/media/jersey-mockup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sponsor_name: companyName,
          sponsor_logo_url: sponsorLogoUrl ?? undefined,
          placement,
          kit_type: kitType,
          proposal_id: proposalId,
          company_id: companyId,
          save_to_proposal: true,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Mockup generation failed");

      const newImg: GeneratedImage = {
        url: data.url,
        placement,
        kitType,
        durationMs: data.duration_ms ?? 0,
      };
      setImages((prev) => [
        ...prev.filter((i) => !(i.placement === placement && i.kitType === kitType)),
        newImg,
      ]);
      onGenerated?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  };

  const placementLabel = JERSEY_PLACEMENTS.find((p) => p.id === placement)?.labelPt ?? placement;
  const activeKit = KIT_TABS.find((k) => k.id === kitType)!;

  return (
    <div className="space-y-5">
      {/* Logo lock notice */}
      <div className="flex items-start gap-2 rounded-lg bg-slate-50 dark:bg-slate-800/40 border border-slate-200 p-3">
        <Lock className="h-4 w-4 text-green-600 shrink-0 mt-0.5" />
        <p className="text-xs text-slate-600 dark:text-slate-300">
          <strong>Crest is locked</strong> — the Coritiba FC badge is baked into the kit photo and never touched.
          Your logo is composited on the chosen placement only.
          {hasLogo ? (
            <span className="ml-1 text-green-600 font-medium">✓ Logo uploaded and ready.</span>
          ) : (
            <span className="ml-1 text-amber-600 font-medium">Upload a logo above to generate.</span>
          )}
        </p>
      </div>

      {/* Kit type tabs */}
      <div>
        <div className="text-xs font-semibold text-slate-600 mb-2 uppercase tracking-wide">
          Kit Type
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {KIT_TABS.map((kit) => (
            <button
              key={kit.id}
              type="button"
              onClick={() => handleKitChange(kit.id)}
              className={`flex flex-col items-center gap-1 rounded-xl border px-3 py-3 text-center transition-all ${
                kitType === kit.id
                  ? "border-green-500 bg-green-50 shadow-sm"
                  : "border-slate-200 bg-white hover:border-green-300"
              }`}
            >
              <span className="text-xl">{kit.emoji}</span>
              <span className="text-xs font-semibold text-slate-700">{kit.label}</span>
              <span className="text-[10px] text-slate-400 leading-tight hidden sm:block">{kit.description}</span>
            </button>
          ))}
        </div>
        <p className="text-[11px] text-slate-400 mt-1.5">
          {activeKit.emoji} <strong>{activeKit.label}:</strong> {activeKit.description}
        </p>
      </div>

      {/* Placement zone selector */}
      <div>
        <div className="text-xs font-semibold text-slate-600 mb-2 uppercase tracking-wide">
          Sponsor Position — <span className="text-green-600 font-normal normal-case">{JERSEY_PLACEMENTS.length} zones available (James confirmed all locations)</span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
          {JERSEY_PLACEMENTS.map((p) => (
            <label
              key={p.id}
              className={`flex items-start gap-2 rounded-lg border px-3 py-2 text-left transition-colors ${
                p.comingSoon || !p.enabled
                  ? "border-slate-100 bg-slate-50 opacity-50 cursor-not-allowed"
                  : placement === p.id
                    ? "border-green-400 bg-green-50 cursor-pointer shadow-sm"
                    : "border-slate-200 bg-white hover:border-green-300 cursor-pointer"
              }`}
            >
              <input
                type="radio"
                name="jersey-placement"
                value={p.id}
                checked={placement === p.id}
                disabled={!p.enabled || !!p.comingSoon}
                onChange={() => setPlacement(p.id)}
                className="mt-0.5 accent-green-600"
              />
              <div className="min-w-0">
                <div className="text-xs font-semibold text-slate-700">{p.labelPt}</div>
                <div className="text-[10px] text-slate-400 leading-snug">{p.description}</div>
                {p.comingSoon && (
                  <span className="text-[10px] text-amber-600 font-medium">Em breve</span>
                )}
              </div>
            </label>
          ))}
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="flex items-start gap-2 rounded-lg bg-red-50 border border-red-200 p-3">
          <AlertCircle className="h-4 w-4 text-red-500 shrink-0 mt-0.5" />
          <p className="text-xs text-red-700">{error}</p>
        </div>
      )}

      {/* Generate button */}
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs text-slate-400">
          {activeKit.emoji} <strong>{activeKit.label}</strong> · {placementLabel}
        </p>
        <button
          type="button"
          onClick={() => setShowConfirm(true)}
          disabled={!hasLogo || loading}
          className="flex items-center gap-2 rounded-lg bg-green-600 hover:bg-green-700 disabled:bg-slate-200 disabled:text-slate-400 text-white px-4 py-2 text-sm font-semibold transition-colors shrink-0"
        >
          {loading ? (
            <><Loader2 className="h-4 w-4 animate-spin" /> Generating…</>
          ) : currentImage ? (
            <><RefreshCw className="h-4 w-4" /> Regenerate</>
          ) : (
            <><Shirt className="h-4 w-4" /> Generate Mockup</>
          )}
        </button>
      </div>

      {/* Confirm modal */}
      {showConfirm && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl max-w-sm w-full p-6 space-y-4 border border-slate-200">
            <div className="text-center space-y-2">
              <div className="text-3xl">{activeKit.emoji}</div>
              <h3 className="font-bold text-base text-slate-900 dark:text-slate-100">
                Generate Jersey Mockup?
              </h3>
              <p className="text-sm text-slate-500">
                Kit: <strong className="text-slate-700">{activeKit.label}</strong> · Zone:{" "}
                <strong className="text-slate-700">{placementLabel}</strong>
              </p>
            </div>
            <div className="rounded-lg bg-green-50 border border-green-200 p-3 text-xs text-green-800 flex items-center gap-2">
              <Lock className="h-3.5 w-3.5 shrink-0" />
              Your uploaded logo will be placed — Coritiba crest is never modified.
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setShowConfirm(false)}
                className="flex-1 rounded-lg border border-slate-300 px-4 py-2.5 text-sm text-slate-600 hover:bg-slate-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={generate}
                className="flex-1 rounded-lg bg-green-600 hover:bg-green-700 text-white px-4 py-2.5 text-sm font-semibold transition-colors"
              >
                ✓ Generate
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Result image */}
      {currentImage && (
        <div className="rounded-xl border-2 border-green-300 bg-white overflow-hidden shadow">
          <img
            src={currentImage.url}
            alt={`Jersey mockup — ${companyName}`}
            className="w-full object-contain bg-slate-50"
            style={{ maxHeight: 420 }}
          />
          <div className="p-3 flex items-center justify-between gap-2 bg-green-50 border-t border-green-200">
            <div>
              <div className="text-xs font-semibold text-green-800 flex items-center gap-1.5">
                <CheckCircle2 className="h-3.5 w-3.5" /> {activeKit.label} · {placementLabel}
              </div>
              <div className="text-xs text-green-600 mt-0.5">
                Generated in {(currentImage.durationMs / 1000).toFixed(1)}s · Saved to proposal
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <a
                href={currentImage.url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1 text-xs text-indigo-600 hover:text-indigo-800"
              >
                <ExternalLink className="h-3.5 w-3.5" /> Open
              </a>
              <a
                href={currentImage.url}
                download={`${companyName.replace(/\s+/g, "_")}_${kitType}_${placement}.jpg`}
                className="flex items-center gap-1 rounded-lg bg-slate-700 hover:bg-slate-900 text-white px-2.5 py-1.5 text-xs font-medium"
              >
                <Download className="h-3 w-3" /> Download
              </a>
            </div>
          </div>
        </div>
      )}

      {/* Previously generated for this session */}
      {images.length > 1 && (
        <div className="space-y-1.5">
          <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
            Generated this session
          </div>
          <div className="flex gap-2 flex-wrap">
            {images.map((img) => {
              const kit = KIT_TABS.find((k) => k.id === img.kitType);
              const zone = JERSEY_PLACEMENTS.find((z) => z.id === img.placement);
              const isActive = img.placement === placement && img.kitType === kitType;
              return (
                <button
                  key={`${img.kitType}-${img.placement}`}
                  type="button"
                  onClick={() => {
                    setKitType(img.kitType);
                    setPlacementState(img.placement);
                  }}
                  className={`rounded-lg overflow-hidden border-2 transition-all ${
                    isActive ? "border-green-500 shadow" : "border-slate-200 hover:border-green-300 opacity-70 hover:opacity-100"
                  }`}
                  title={`${kit?.label} · ${zone?.labelPt}`}
                >
                  <img src={img.url} alt="" className="w-16 h-20 object-cover bg-slate-100" />
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
