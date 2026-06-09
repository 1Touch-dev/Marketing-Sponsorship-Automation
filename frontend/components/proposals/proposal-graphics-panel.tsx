"use client";

import React, { useState } from "react";
import { OfficialJerseyMockup } from "./official-jersey-mockup";
import { AICreativesGenerator } from "./ai-creatives-generator";
import { ProposalImageManager } from "./proposal-image-manager";
import type { StrategyVariant } from "@/lib/ai/schemas";

export type ProposalGraphicsPanelProps = {
  proposalId: string;
  companyId?: string;
  companyName: string;
  sponsorLogoUrl?: string | null;
  campaignTitle?: string;
  strategyVariants?: StrategyVariant[] | null;
  compact?: boolean;
};

export function ProposalGraphicsPanel({
  proposalId,
  companyId,
  companyName,
  sponsorLogoUrl,
  campaignTitle,
  strategyVariants,
  compact = false,
}: ProposalGraphicsPanelProps) {
  const [refreshKey, setRefreshKey] = useState(0);
  const hasLogo = !!sponsorLogoUrl;

  return (
    <div className="space-y-4">
      {/* Logo requirement banner */}
      {!hasLogo && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 dark:bg-amber-950/20 px-4 py-3 text-sm text-amber-800 dark:text-amber-300 flex items-start gap-2">
          <span className="text-lg leading-none mt-0.5">⚠️</span>
          <div>
            <strong>Sponsor logo required</strong> — upload the logo in the{" "}
            <strong>Brand Assets</strong> section above to unlock jersey mockups.
            AI campaign images can still be generated without it.
          </div>
        </div>
      )}

      {/* Card 1: Official Jersey Mockup */}
      <div className="rounded-xl border-2 border-green-200 bg-white dark:bg-slate-900 overflow-hidden">
        <div className="flex items-center gap-2.5 px-4 py-3 bg-green-50 dark:bg-green-950/30 border-b border-green-200">
          <span className="text-xl">👕</span>
          <div>
            <div className="font-semibold text-sm text-green-900 dark:text-green-200">Jersey Mockup — Official</div>
            <div className="text-xs text-green-700 dark:text-green-400">
              Your logo composited onto the real Coritiba kit photo · Crest is never altered
            </div>
          </div>
          {hasLogo && (
            <span className="ml-auto text-xs px-2 py-0.5 rounded-full bg-green-600 text-white font-medium shrink-0">
              ✓ Logo ready
            </span>
          )}
        </div>
        <div className="p-4">
          <OfficialJerseyMockup
            proposalId={proposalId}
            companyId={companyId}
            companyName={companyName}
            sponsorLogoUrl={sponsorLogoUrl}
            showPlacementPreview={!compact}
            onGenerated={() => setRefreshKey((k) => k + 1)}
          />
        </div>
      </div>

      {/* Card 2: AI Creatives */}
      <div className="rounded-xl border-2 border-indigo-200 bg-white dark:bg-slate-900 overflow-hidden">
        <div className="flex items-center gap-2.5 px-4 py-3 bg-indigo-50 dark:bg-indigo-950/30 border-b border-indigo-200">
          <span className="text-xl">✨</span>
          <div>
            <div className="font-semibold text-sm text-indigo-900 dark:text-indigo-200">AI Campaign Creatives</div>
            <div className="text-xs text-indigo-700 dark:text-indigo-400">
              Stadium scenes · Concept-based · Assign to marketing strategies
            </div>
          </div>
        </div>
        <div className="p-4">
          <AICreativesGenerator
            proposalId={proposalId}
            companyName={companyName}
            strategyVariants={strategyVariants}
            campaignTitle={campaignTitle}
            uploadedLogoUrl={sponsorLogoUrl}
            onGenerated={() => setRefreshKey((k) => k + 1)}
          />
        </div>
      </div>

      {/* Card 3: All saved images */}
      <div className="rounded-xl border border-slate-200 bg-white dark:bg-slate-900 overflow-hidden">
        <div className="flex items-center gap-2.5 px-4 py-3 bg-slate-50 dark:bg-slate-800/50 border-b border-slate-200">
          <span className="text-xl">🖼️</span>
          <div>
            <div className="font-semibold text-sm text-slate-800 dark:text-slate-200">Saved Images</div>
            <div className="text-xs text-slate-500">All generated images for this proposal</div>
          </div>
        </div>
        <div className="p-4">
          <ProposalImageManager
            key={refreshKey}
            proposalId={proposalId}
            strategyVariants={strategyVariants}
          />
        </div>
      </div>
    </div>
  );
}
