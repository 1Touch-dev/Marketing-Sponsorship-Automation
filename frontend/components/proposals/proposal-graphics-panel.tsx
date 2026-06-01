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

  return (
    <div className="space-y-6">
      <ReplicateJerseyGenerator
        proposalId={proposalId}
        companyId={companyId}
        companyName={companyName}
        sponsorLogoUrl={sponsorLogoUrl}
        campaignTitle={campaignTitle}
        showPlacementPreview={!compact}
        onGenerated={() => setRefreshKey((k) => k + 1)}
      />

      <div className="border-t border-slate-200 pt-4">
        <CampaignImageGenerator
          proposalId={proposalId}
          companyName={companyName}
          strategyVariants={strategyVariants}
          campaignTitle={campaignTitle}
          uploadedLogoUrl={sponsorLogoUrl}
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
