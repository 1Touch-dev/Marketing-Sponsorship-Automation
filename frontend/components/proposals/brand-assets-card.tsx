"use client";

import { useState, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { AssetUploader } from "./asset-uploader";
import { Upload, Loader2, CheckCircle2, Sparkles } from "lucide-react";
import type { StrategyVariant } from "@/lib/ai/schemas";

interface UploadedAsset {
  url: string;
  name: string;
  path: string;
}

interface BrandAssetsCardProps {
  proposalId: string;
  companyName: string;
  existingAssets: UploadedAsset[];
  hasLogo: boolean;
  strategyVariants?: StrategyVariant[] | null;
  campaignTitle?: string;
  /** Called with the uploaded file URL when a new logo is successfully uploaded */
  onLogoUploaded?: (url: string) => void;
}

export function BrandAssetsCard({
  proposalId,
  companyName,
  existingAssets,
  hasLogo: initialHasLogo,
  strategyVariants,
  campaignTitle,
  onLogoUploaded,
}: BrandAssetsCardProps) {
  const [hasLogo, setHasLogo] = useState(initialHasLogo);
  const [autoGenerating, setAutoGenerating] = useState(false);
  const [autoGenDone, setAutoGenDone] = useState(false);

  const handleUpload = useCallback(
    async (asset: UploadedAsset) => {
      const wasLogoMissing = !hasLogo;
      setHasLogo(true);
      // Notify parent so ProposalGraphicsPanel's sponsorLogoUrl updates immediately
      onLogoUploaded?.(asset.url);

      // Auto-trigger campaign image generation if this is the first logo upload
      if (wasLogoMissing && strategyVariants && strategyVariants.length > 0) {
        setAutoGenerating(true);
        try {
          for (const variant of strategyVariants.slice(0, 3)) {
            const activations = (variant.key_activations ?? []).slice(0, 2).join(" and ");
            const tagline = variant.tagline ? `"${variant.tagline}". ` : "";
            const prompt = `Professional Brazilian sports marketing campaign visual for ${companyName} sponsoring Coritiba FC. ${tagline}Strategy: "${variant.label}". ${activations ? `Activation: ${activations}.` : ""} Estádio Couto Pereira during match day. ${companyName} brand integrated into Coritiba FC's verde coxa and white. Modern advertising photography, 16:9 format.`;

            await fetch("/api/media/campaign-image", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                proposal_id: proposalId,
                prompt,
                job_type: "campaign_creative",
                strategy_variant_id: variant.id,
                strategy_label: variant.label,
                logo_url: asset.url,
              }),
            }).catch(() => {});
          }
          setAutoGenDone(true);
        } finally {
          setAutoGenerating(false);
        }
      }
    },
    [hasLogo, proposalId, companyName, strategyVariants, onLogoUploaded],
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
            <span>Auto-generating campaign images for each strategy…</span>
          </div>
        )}
        {autoGenDone && !autoGenerating && (
          <div className="flex items-center gap-2 text-sm text-green-700 bg-green-50 border border-green-200 rounded-lg px-3 py-2">
            <Sparkles className="h-4 w-4" />
            <span>Campaign images queued — check the Visuais section below.</span>
          </div>
        )}

        <AssetUploader
          proposalId={proposalId}
          existingAssets={existingAssets}
          onUpload={handleUpload}
        />
      </CardContent>
    </Card>
  );
}
