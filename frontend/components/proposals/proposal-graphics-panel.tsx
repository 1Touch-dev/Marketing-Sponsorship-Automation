"use client";

import React, { useState } from "react";
import { ReplicateJerseyGenerator } from "./replicate-jersey-generator";
import { CampaignImageGenerator } from "./campaign-image-generator";
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
    <div className="space-y-6">
      {!hasLogo && (
        <div className="rounded-lg border border-yellow-200 bg-yellow-50 dark:bg-yellow-950/20 px-4 py-3 text-sm text-yellow-800 dark:text-yellow-300">
          📸 <strong>Upload the sponsor logo</strong> in the Brand Assets section above to unlock image generation.
        </div>
      )}

      <ReplicateJerseyGenerator
        proposalId={proposalId}
        companyId={companyId}
        companyName={companyName}
        sponsorLogoUrl={sponsorLogoUrl}
        campaignTitle={campaignTitle}
        showPlacementPreview={!compact}
        onGenerated={() => setRefreshKey((k) => k + 1)}
        disabled={!hasLogo}
      />

      <div className="border-t border-slate-200 pt-4">
        <CampaignImageGenerator
          proposalId={proposalId}
          companyName={companyName}
          strategyVariants={strategyVariants}
          campaignTitle={campaignTitle}
          uploadedLogoUrl={sponsorLogoUrl}
          disabled={!hasLogo}
        />
      </div>

      <div className="border-t border-slate-200 pt-4">
        <ProposalImageManager
          key={refreshKey}
          proposalId={proposalId}
          strategyVariants={strategyVariants}
        />
      </div>
    </div>
  );
}
