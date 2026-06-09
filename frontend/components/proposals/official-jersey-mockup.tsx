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
} from "lucide-react";
import {
  JERSEY_PLACEMENTS,
  type JerseyPlacementId,
} from "@/lib/media/jersey-placements";
import { JerseyPlacementPreview } from "./jersey-placement-preview";

interface OfficialJerseyMockupProps {
  proposalId: string;
  companyId?: string;
  companyName: string;
  sponsorLogoUrl?: string | null;
  showPlacementPreview?: boolean;
  onPlacementChange?: (placement: JerseyPlacementId) => void;
  onGenerated?: () => void;
}

type GeneratedImage = {
  url: string;
  placement: JerseyPlacementId;
  durationMs: number;
};

export function OfficialJerseyMockup({
  proposalId,
  companyId,
  companyName,
  sponsorLogoUrl,
  showPlacementPreview = false,
  onPlacementChange,
  onGenerated,
}: OfficialJerseyMockupProps) {
  const [placement, setPlacementState] = useState<JerseyPlacementId>("chest_sponsor");
  const [loading, setLoading] = useState(false);
  const [image, setImage] = useState<GeneratedImage | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showConfirm, setShowConfirm] = useState(false);

  const hasLogo = !!sponsorLogoUrl;

  const setPlacement = (p: JerseyPlacementId) => {
    setPlacementState(p);
    onPlacementChange?.(p);
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
          proposal_id: proposalId,
          company_id: companyId,
          save_to_proposal: true,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Mockup generation failed");

      setImage({ url: data.url, placement, durationMs: data.duration_ms ?? 0 });
      onGenerated?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  };

  const placementLabel = JERSEY_PLACEMENTS.find((p) => p.id === placement)?.labelPt ?? placement;

  return (
    <div className="space-y-4">
      {/* Logo lock notice */}
      <div className="flex items-start gap-2 rounded-lg bg-slate-50 dark:bg-slate-800/40 border border-slate-200 p-3">
        <Lock className="h-4 w-4 text-green-600 shrink-0 mt-0.5" />
        <p className="text-xs text-slate-600 dark:text-slate-300">
          <strong>Crest is locked</strong> — the Coritiba FC badge in the base kit photo is never
          touched. Your logo is composited on the <strong>opposite</strong> side only.
          {hasLogo ? (
            <span className="ml-1 text-green-600 font-medium">✓ Logo uploaded and ready.</span>
          ) : (
            <span className="ml-1 text-amber-600 font-medium">Upload a logo above to generate.</span>
          )}
        </p>
      </div>

      {/* Placement selector */}
      {showPlacementPreview && (
        <JerseyPlacementPreview placement={placement} className="max-w-xs mx-auto" />
      )}

      <div>
        <div className="text-xs font-semibold text-slate-600 mb-2">Choose sponsor position</div>
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
                <div className="text-xs text-slate-400 leading-snug">{p.description}</div>
                {p.comingSoon && <span className="text-xs text-amber-600 font-medium">Em breve</span>}
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
          Instantaneous · Saved to proposal · Position: <strong>{placementLabel}</strong>
        </p>
        <button
          type="button"
          onClick={() => setShowConfirm(true)}
          disabled={!hasLogo || loading}
          className="flex items-center gap-2 rounded-lg bg-green-600 hover:bg-green-700 disabled:bg-slate-200 disabled:text-slate-400 text-white px-4 py-2 text-sm font-semibold transition-colors shrink-0"
        >
          {loading ? (
            <><Loader2 className="h-4 w-4 animate-spin" /> Generating…</>
          ) : image ? (
            <><RefreshCw className="h-4 w-4" /> Regenerate</>
          ) : (
            <>👕 Generate Mockup</>
          )}
        </button>
      </div>

      {/* Confirm modal */}
      {showConfirm && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl max-w-sm w-full p-6 space-y-4 border border-slate-200">
            <div className="text-center space-y-2">
              <div className="text-3xl">👕</div>
              <h3 className="font-bold text-base text-slate-900 dark:text-slate-100">
                Generate Official Mockup?
              </h3>
              <p className="text-sm text-slate-500">
                Your logo will be placed on the{" "}
                <strong className="text-slate-700">{placementLabel}</strong> of the Coritiba FC kit.
                The club crest is never altered.
              </p>
            </div>
            <div className="rounded-lg bg-green-50 border border-green-200 p-3 text-xs text-green-800 flex items-center gap-2">
              <Lock className="h-3.5 w-3.5 shrink-0" />
              This mockup always uses <strong>your uploaded logo</strong> — it will never change between generations.
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

      {/* Result */}
      {image && (
        <div className="rounded-xl border-2 border-green-300 bg-white overflow-hidden shadow">
          <img
            src={image.url}
            alt={`Jersey mockup — ${companyName}`}
            className="w-full object-contain bg-slate-50"
            style={{ maxHeight: 360 }}
          />
          <div className="p-3 flex items-center justify-between gap-2 bg-green-50 border-t border-green-200">
            <div>
              <div className="text-xs font-semibold text-green-800 flex items-center gap-1.5">
                <CheckCircle2 className="h-3.5 w-3.5" /> Official mockup · {placementLabel}
              </div>
              <div className="text-xs text-green-600 mt-0.5">
                Generated in {(image.durationMs / 1000).toFixed(1)}s · Saved to proposal
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <a
                href={image.url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1 text-xs text-indigo-600 hover:text-indigo-800"
              >
                <ExternalLink className="h-3.5 w-3.5" /> Open
              </a>
              <a
                href={image.url}
                download={`${companyName.replace(/\s+/g, "_")}_jersey_${placement}.jpg`}
                className="flex items-center gap-1 rounded-lg bg-slate-700 hover:bg-slate-900 text-white px-2.5 py-1.5 text-xs font-medium"
              >
                <Download className="h-3 w-3" /> Download
              </a>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
