"use client";

import { useState, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { AssetUploader } from "./asset-uploader";
import { Upload, Loader2, Sparkles } from "lucide-react";
import type { StrategyVariant } from "@/lib/ai/schemas";

interface UploadedAsset {
  url: string;
  name: string;
  path: string;
}

interface BrandAssetsCardProps {
  proposalId: string;
  companyId?: string;
  companyName: string;
  existingAssets: UploadedAsset[];
  hasLogo: boolean;
  /** Current active logo URL, highlighted in the asset grid. */
  activeLogoUrl?: string | null;
  strategyVariants?: StrategyVariant[] | null;
  campaignTitle?: string;
  /** Called with the uploaded file URL when a new logo is successfully uploaded */
  onLogoUploaded?: (url: string) => void;
  /** Called with the new active logo URL (or null) after a logo is deleted */
  onLogoRemoved?: (url: string | null) => void;
  /** Called after first-logo Matchday Street auto-gen succeeds so Visuais can show it without reload */
  onCreativeGenerated?: (payload: { url: string; sceneType: "matchday_street" }) => void;
}

export function BrandAssetsCard({
  proposalId,
  companyId,
  companyName,
  existingAssets,
  hasLogo: initialHasLogo,
  activeLogoUrl,
  strategyVariants: _strategyVariants,
  campaignTitle: _campaignTitle,
  onLogoUploaded,
  onLogoRemoved,
  onCreativeGenerated,
}: BrandAssetsCardProps) {
  const [hasLogo, setHasLogo] = useState(initialHasLogo);
  const [autoGenerating, setAutoGenerating] = useState(false);
  const [autoGenDone, setAutoGenDone] = useState(false);
  const [autoGenError, setAutoGenError] = useState<string | null>(null);

  const handleUpload = useCallback(
    async (asset: UploadedAsset) => {
      const wasLogoMissing = !hasLogo;
      setHasLogo(true);
      // Notify parent so ProposalGraphicsPanel's sponsorLogoUrl updates immediately
      onLogoUploaded?.(asset.url);

      // Auto-generate one Matchday Street creative on first logo upload
      if (wasLogoMissing) {
        setAutoGenerating(true);
        setAutoGenError(null);
        try {
          const res = await fetch("/api/media/campaign-creative", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              sponsor_name: companyName,
              sponsor_logo_url: asset.url,
              scene_type: "matchday_street",
              proposal_id: proposalId,
              ...(companyId ? { company_id: companyId } : {}),
              save_to_proposal: true,
            }),
          });
          const data = await res.json().catch(() => ({}));
          if (!res.ok) {
            throw new Error(typeof data?.error === "string" ? data.error : "Campaign creative failed");
          }
          if (typeof data?.url === "string") {
            onCreativeGenerated?.({ url: data.url, sceneType: "matchday_street" });
          }
          setAutoGenDone(true);
        } catch (err) {
          setAutoGenDone(false);
          setAutoGenError(err instanceof Error ? err.message : "Auto-generate failed");
        } finally {
          setAutoGenerating(false);
        }
      }
    },
    [hasLogo, proposalId, companyId, companyName, onLogoUploaded, onCreativeGenerated],
  );

  return (
    <Card id="brand-assets">
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Upload className="h-4 w-4 text-primary" /> Brand Assets
        </CardTitle>
        <CardDescription>
          Upload logos and brand assets. Campaign images auto-generate when the first logo is uploaded.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Sponsor asset checklist — per official Coritiba manual requirements */}
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
          <div className="text-xs font-semibold text-amber-800 mb-2 flex items-center gap-1.5">
            <span>📋</span> Asset Checklist (required per Coritiba manual)
          </div>
          <ul className="space-y-1 text-xs text-amber-700">
            {[
              { label: "Color logo (PNG/SVG, transparent background)", done: hasLogo },
              { label: "Monochrome version (black or white)", done: false },
              { label: "Outline/contour version", done: false },
              { label: "Vector file (.AI, .EPS or .SVG)", done: false },
            ].map((item, i) => (
              <li key={i} className="flex items-center gap-2">
                <span className={item.done ? "text-green-600" : "text-amber-400"}>
                  {item.done ? "✓" : "○"}
                </span>
                <span className={item.done ? "line-through text-amber-400" : ""}>{item.label}</span>
              </li>
            ))}
          </ul>
        </div>

        {/* Auto-generate status */}
        {autoGenerating && (
          <div className="flex items-center gap-2 text-sm text-blue-700 bg-blue-50 border border-blue-200 rounded-lg px-3 py-2">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span>Auto-generating Matchday Street creative…</span>
          </div>
        )}
        {autoGenDone && !autoGenerating && (
          <div className="flex items-center gap-2 text-sm text-green-700 bg-green-50 border border-green-200 rounded-lg px-3 py-2">
            <Sparkles className="h-4 w-4" />
            <span>Campaign creative ready — check the Visuais section above.</span>
          </div>
        )}
        {autoGenError && !autoGenerating && (
          <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
            {autoGenError}
          </div>
        )}

        <AssetUploader
          proposalId={proposalId}
          existingAssets={existingAssets}
          activeLogoUrl={activeLogoUrl}
          onUpload={handleUpload}
          onLogoChanged={(url) => {
            setHasLogo(!!url);
            onLogoRemoved?.(url);
          }}
        />
      </CardContent>
    </Card>
  );
}
