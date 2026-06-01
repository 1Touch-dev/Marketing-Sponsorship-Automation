import { supabaseAdmin } from "@/lib/supabase/server";
import { notFound } from "next/navigation";
import { ProposalLandingPage } from "@/components/proposals/proposal-landing-page";
import type { ProposalContent } from "@/types/database";
import type { StrategyVariant, PricingTier, CompanyIntelligence } from "@/lib/ai/schemas";
import { fetchProposalImagesForLanding } from "@/lib/proposals/fetch-proposal-images";
import { PrintButton } from "@/app/proposals/[id]/view/print-button";

export const dynamic = "force-dynamic";

/**
 * Public shareable proposal landing page.
 * Accessible via: /proposals/view/[token]
 * No authentication required — share_token acts as the access key.
 */
export default async function PublicProposalViewPage({ params }: { params: { token: string } }) {
  const sb = supabaseAdmin();

  const { data: proposal } = await sb
    .from("proposals")
    .select("*, companies(*), campaigns(title, summary)")
    .eq("share_token", params.token)
    .maybeSingle();

  if (!proposal) notFound();

  // Only show approved or draft proposals publicly
  if (proposal.status === "rejected") notFound();

  const approvedImages = await fetchProposalImagesForLanding(proposal.id);

  type EnrichedProposal = typeof proposal & {
    companies: {
      company_name: string;
      industry?: string | null;
      website?: string | null;
      country?: string | null;
    } | null;
    campaigns: { title: string; summary?: string | null } | null;
    strategy_variants?: StrategyVariant[] | null;
    pricing_tiers?: PricingTier[] | null;
    intelligence?: CompanyIntelligence | null;
    share_token?: string | null;
  };

  const p = proposal as EnrichedProposal;
  const company = p.companies;

  return (
    <div className="min-h-screen w-full bg-slate-50">
      {/* Minimal public header */}
      <div className="w-full bg-white border-b border-slate-200 px-6 py-3 print:hidden">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <div className="text-sm font-semibold text-slate-700">
            Proposta de Patrocínio
            {company?.company_name && (
              <span className="ml-2 text-slate-400 font-normal">— {company.company_name}</span>
            )}
          </div>
          <PrintButton label="Imprimir / Salvar como PDF" />
        </div>
      </div>

      <ProposalLandingPage
        proposal={{
          id: p.id,
          title: p.title,
          status: p.status,
          version: p.version,
          created_at: p.created_at,
          content: p.content as ProposalContent,
          strategy_variants: p.strategy_variants,
          pricing_tiers: p.pricing_tiers,
          visual_prompts: p.visual_prompts,
          intelligence: p.intelligence,
          share_token: p.share_token,
        }}
        company={{
          company_name: company?.company_name ?? "",
          industry: company?.industry,
          website: company?.website,
          country: company?.country,
          logo_url: company?.logo_url,
        }}
        campaign={p.campaigns}
        approvedImages={approvedImages}
        adminMode={false}
      />
    </div>
  );
}
