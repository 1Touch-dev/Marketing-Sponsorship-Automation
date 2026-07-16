"use client";

import React, { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { BrandAssetsCard } from "./brand-assets-card";
import { ProposalGraphicsPanel } from "./proposal-graphics-panel";
import type { StrategyVariant } from "@/lib/ai/schemas";

interface ProposalBrandGraphicsWrapperProps {
  proposalId: string;
  companyId?: string;
  companyName: string;
  /** Initial logo URL (from companies.logo_url at page load time) */
  initialLogoUrl?: string | null;
  campaignTitle?: string;
  strategyVariants?: StrategyVariant[] | null;
  existingAssets?: Array<{ url: string; name: string; path: string }>;
}

/**
 * Wrapper that owns the "current logo URL" state.
 *
 * This solves the core problem: the proposal detail page is a server component —
 * it renders ProposalGraphicsPanel and BrandAssetsCard as siblings with the logo
 * URL baked in at request time. When a user uploads a logo via BrandAssetsCard,
 * the panel's `sponsorLogoUrl` prop never updates (no re-render triggered).
 *
 * By lifting `logoUrl` into this client component we get:
 *   - BrandAssetsCard reports the new URL via onLogoUploaded
 *   - ProposalGraphicsPanel immediately receives it as sponsorLogoUrl
 *   - The Generate button becomes enabled without a page reload
 */
export function ProposalBrandGraphicsWrapper({
  proposalId,
  companyId,
  companyName,
  initialLogoUrl,
  campaignTitle,
  strategyVariants,
  existingAssets = [],
}: ProposalBrandGraphicsWrapperProps) {
  const [logoUrl, setLogoUrl] = useState<string | null>(initialLogoUrl ?? null);

  return (
    <>
      {/* Card 1: Visuais da proposta — rendered ABOVE brand assets so user sees the panel */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <span className="text-lg">🖼</span> Visuais da proposta
          </CardTitle>
          <CardDescription className="text-xs">
            Mockup de camisa, criativos de campanha, seleção de imagem e vínculo a estratégias — aparece na landing do patrocinador.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ProposalGraphicsPanel
            proposalId={proposalId}
            companyId={companyId}
            companyName={companyName}
            sponsorLogoUrl={logoUrl}
            campaignTitle={campaignTitle}
            strategyVariants={strategyVariants}
          />
        </CardContent>
      </Card>

      {/* Card 2: Brand Assets — upload here to immediately unlock the panel above */}
      <BrandAssetsCard
        proposalId={proposalId}
        companyName={companyName}
        existingAssets={existingAssets}
        hasLogo={!!logoUrl}
        activeLogoUrl={logoUrl}
        strategyVariants={strategyVariants}
        campaignTitle={campaignTitle}
        onLogoUploaded={(url) => setLogoUrl(url)}
        onLogoRemoved={(url) => setLogoUrl(url)}
      />
    </>
  );
}
