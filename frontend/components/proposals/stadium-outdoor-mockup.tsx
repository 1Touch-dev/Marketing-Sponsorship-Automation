"use client";

import React, { useState } from "react";
import {
  Loader2,
  CheckCircle2,
  Download,
  RefreshCw,
  ExternalLink,
  AlertCircle,
  MapPin,
} from "lucide-react";
import {
  STADIUM_PLACEMENTS,
  STADIUM_BASES,
  type StadiumPlacementId,
} from "@/lib/media/stadium-placements";

interface StadiumOutdoorMockupProps {
  proposalId: string;
  companyId?: string;
  companyName: string;
  sponsorLogoUrl?: string | null;
  onGenerated?: () => void;
}

type GeneratedImage = {
  url: string;
  placement: StadiumPlacementId;
  basePhoto: string;
  durationMs: number;
};

const PLACEMENT_ICONS: Record<string, string> = {
  led_board_main: "📺",
  led_board_near_goal: "⚽",
  main_stand_facade: "🏟️",
  exterior_facade: "🌙",
  scoreboard: "📊",
};

export function StadiumOutdoorMockup({
  proposalId,
  companyId,
  companyName,
  sponsorLogoUrl,
  onGenerated,
}: StadiumOutdoorMockupProps) {
  const [placement, setPlacement] = useState<StadiumPlacementId>("led_board_main");
  const [loading, setLoading] = useState(false);
  const [image, setImage] = useState<GeneratedImage | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showConfirm, setShowConfirm] = useState(false);

  const hasLogo = !!sponsorLogoUrl;
  const selectedZone = STADIUM_PLACEMENTS.find((p) => p.id === placement);
  const baseInfo = selectedZone ? STADIUM_BASES[selectedZone.basePhoto] : null;

  const generate = async () => {
    setShowConfirm(false);
    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/media/stadium-mockup", {
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
      const data = await res.json() as {
        url?: string; duration_ms?: number; base_photo?: string;
        base_image?: string; error?: string;
      };
      if (!res.ok) throw new Error(data.error ?? "Stadium mockup generation failed");

      setImage({
        url: data.url!,
        placement,
        basePhoto: data.base_image ?? "",
        durationMs: data.duration_ms ?? 0,
      });
      onGenerated?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Info notice */}
      <div className="flex items-start gap-2 rounded-lg bg-slate-50 dark:bg-slate-800/40 border border-slate-200 p-3">
        <MapPin className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
        <p className="text-xs text-slate-600 dark:text-slate-300">
          <strong>Real Couto Pereira photos</strong> — your logo is composited onto actual stadium
          advertising boards. 5 placements across 4 different photos (match day, aerial, night, drone).
          {hasLogo ? (
            <span className="ml-1 text-green-600 font-medium">✓ Logo ready.</span>
          ) : (
            <span className="ml-1 text-amber-600 font-medium"> Upload a logo above to unlock.</span>
          )}
        </p>
      </div>

      {/* Placement selector */}
      <div>
        <div className="text-xs font-semibold text-slate-600 mb-2">Choose placement</div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
          {STADIUM_PLACEMENTS.map((p) => {
            const base = STADIUM_BASES[p.basePhoto];
            return (
              <label
                key={p.id}
                className={`flex items-start gap-2 rounded-lg border px-3 py-2 text-left transition-colors cursor-pointer ${
                  placement === p.id
                    ? "border-amber-400 bg-amber-50 shadow-sm"
                    : "border-slate-200 bg-white hover:border-amber-300"
                }`}
              >
                <input
                  type="radio"
                  name="stadium-placement"
                  value={p.id}
                  checked={placement === p.id}
                  onChange={() => setPlacement(p.id)}
                  className="mt-0.5 accent-amber-600"
                />
                <div className="min-w-0">
                  <div className="text-xs font-semibold text-slate-700 flex items-center gap-1">
                    <span>{PLACEMENT_ICONS[p.id] ?? "📍"}</span>
                    {p.labelPt}
                  </div>
                  <div className="text-xs text-slate-400 leading-snug">{p.description}</div>
                  <div className="text-[10px] text-slate-400 mt-0.5 italic">{base.labelPt}</div>
                </div>
              </label>
            );
          })}
        </div>
      </div>

      {/* Selected photo preview label */}
      {selectedZone && baseInfo && (
        <div className="rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-800 flex items-center gap-2">
          <span className="text-base">{PLACEMENT_ICONS[selectedZone.id] ?? "📍"}</span>
          <div>
            <strong>Base photo:</strong> {baseInfo.label}
            <span className="mx-1.5 text-amber-400">·</span>
            <strong>Placement:</strong> {selectedZone.labelPt}
          </div>
        </div>
      )}

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
          Instantaneous · Real stadium photo · Saved to proposal
        </p>
        <button
          type="button"
          onClick={() => setShowConfirm(true)}
          disabled={!hasLogo || loading}
          className="flex items-center gap-2 rounded-lg bg-amber-600 hover:bg-amber-700 disabled:bg-slate-200 disabled:text-slate-400 text-white px-4 py-2 text-sm font-semibold transition-colors shrink-0"
        >
          {loading ? (
            <><Loader2 className="h-4 w-4 animate-spin" /> Generating…</>
          ) : image ? (
            <><RefreshCw className="h-4 w-4" /> Regenerate</>
          ) : (
            <>🏟️ Generate Outdoor Mockup</>
          )}
        </button>
      </div>

      {/* Confirm modal */}
      {showConfirm && selectedZone && baseInfo && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl max-w-sm w-full p-6 space-y-4 border border-slate-200">
            <div className="text-center space-y-2">
              <div className="text-3xl">🏟️</div>
              <h3 className="font-bold text-base text-slate-900 dark:text-slate-100">
                Generate Stadium Outdoor Mockup?
              </h3>
              <p className="text-sm text-slate-500">
                Your logo will be placed on the{" "}
                <strong className="text-slate-700">{selectedZone.labelPt}</strong> using a real
                photo of Estádio Couto Pereira.
              </p>
            </div>
            <div className="rounded-lg bg-amber-50 border border-amber-200 p-3 text-xs text-amber-800 space-y-1">
              <div><strong>Photo:</strong> {baseInfo.label}</div>
              <div><strong>Placement:</strong> {selectedZone.description}</div>
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
                className="flex-1 rounded-lg bg-amber-600 hover:bg-amber-700 text-white px-4 py-2.5 text-sm font-semibold transition-colors"
              >
                ✓ Generate
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Result */}
      {image && (
        <div className="rounded-xl border-2 border-amber-300 bg-white overflow-hidden shadow">
          <img
            src={image.url}
            alt={`Stadium mockup — ${companyName}`}
            className="w-full object-contain bg-slate-50"
            style={{ maxHeight: 400 }}
          />
          <div className="p-3 flex items-center justify-between gap-2 bg-amber-50 border-t border-amber-200">
            <div>
              <div className="text-xs font-semibold text-amber-800 flex items-center gap-1.5">
                <CheckCircle2 className="h-3.5 w-3.5" /> Stadium mockup · {selectedZone?.labelPt}
              </div>
              <div className="text-xs text-amber-600 mt-0.5">
                {image.basePhoto} · Generated in {(image.durationMs / 1000).toFixed(1)}s · Saved to proposal
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
                download={`${companyName.replace(/\s+/g, "_")}_stadium_${placement}.jpg`}
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
