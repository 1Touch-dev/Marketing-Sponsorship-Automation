import { supabaseAdmin } from "@/lib/supabase/server";
import { notFound } from "next/navigation";
import { ProposalCMSEditor } from "@/components/proposals/proposal-cms-editor";
import { PrintButton } from "./print-button";
import { ShareLinkDisplay } from "./share-link-display";
import type { ProposalContent } from "@/types/database";
import type { StrategyVariant, PricingTier, CompanyIntelligence } from "@/lib/ai/schemas";
import { fetchProposalImagesForLanding } from "@/lib/proposals/fetch-proposal-images";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function ProposalViewPage({ params }: { params: { id: string } }) {
  const sb = supabaseAdmin();

  const { data: proposal } = await sb
    .from("proposals")
    .select("*, companies(id, company_name, industry, website, country, logo_url), campaigns(title, summary)")
    .eq("id", params.id)
    .maybeSingle();

  if (!proposal) notFound();

  const approvedImages = await fetchProposalImagesForLanding(proposal.id);

  type EnrichedProposal = typeof proposal & {
    companies: {
      company_name: string;
      industry?: string | null;
      website?: string | null;
      country?: string | null;
      logo_url?: string | null;
      id?: string;
    } | null;
    campaigns: { title: string; summary?: string | null } | null;
    strategy_variants?: StrategyVariant[] | null;
    pricing_tiers?: PricingTier[] | null;
    visual_prompts?: unknown[] | null;
    intelligence?: CompanyIntelligence | null;
    share_token?: string | null;
  };

  const p = proposal as EnrichedProposal;
  const company = p.companies;

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Admin back-link bar */}
      <div className="sticky top-0 z-[60] flex items-center justify-between bg-white border-b border-slate-200 px-4 py-2 print:hidden">
        <Link
          href={`/proposals/${proposal.id}`}
          className="flex items-center gap-1.5 text-sm text-slate-600 hover:text-slate-900 transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          Voltar para proposta
        </Link>
        <div className="flex items-center gap-2">
          <ShareLinkDisplay proposalId={proposal.id} shareToken={p.share_token ?? null} />
          <PrintButton proposalId={proposal.id} exportType="pdf_print" />
        </div>
      </div>

      {/* CMS editor wraps the landing page — edit mode toggle is inside */}
      <ProposalCMSEditor
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
        companyId={company?.id as string | undefined}
      />
    </div>
  );
}
